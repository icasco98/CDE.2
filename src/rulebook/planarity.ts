/*
 * Whether a graph can be drawn on a sheet with no link crossing another. A storey whose links
 * cannot be is a storey whose program asked for what geometry cannot give, and decision 21 says
 * the tool must say so on the brief rather than settle for ever trying.
 *
 * The test is Demoucron's: start from a cycle, then take the pieces hanging off what is drawn one
 * at a time and put each into a face that can hold it. A piece with no face left to go in is the
 * crossing, and there is no drawing without one.
 */

export type Pair = readonly [string, string]

type Graph = ReadonlyMap<string, ReadonlySet<string>>

function graphOf(nodes: readonly string[], pairs: readonly Pair[]): Graph {
  const joined = new Map<string, Set<string>>()
  for (const node of nodes) joined.set(node, new Set())
  for (const [a, b] of pairs) {
    if (a === b || !joined.has(a) || !joined.has(b)) continue
    joined.get(a)?.add(b)
    joined.get(b)?.add(a)
  }
  return joined
}

function edgesOf(graph: Graph): Pair[] {
  const out: Pair[] = []
  for (const [node, to] of graph) for (const other of to) if (node < other) out.push([node, other])
  return out
}

/** The blocks of a graph: the pieces inside which every pair of vertices lies on a common cycle. */
function blocks(graph: Graph): Pair[][] {
  const depth = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: Pair[] = []
  const found: Pair[][] = []
  let clock = 0

  const walk = (node: string, from: string | null): void => {
    clock += 1
    depth.set(node, clock)
    low.set(node, clock)
    for (const other of graph.get(node) ?? []) {
      if (other === from) continue
      const seen = depth.get(other)
      if (seen === undefined) {
        stack.push([node, other])
        walk(other, node)
        const back = low.get(other) ?? 0
        low.set(node, Math.min(low.get(node) ?? 0, back))
        if (back >= (depth.get(node) ?? 0)) {
          const block: Pair[] = []
          for (let edge = stack.pop(); edge; edge = stack.pop()) {
            block.push(edge)
            if (edge[0] === node && edge[1] === other) break
          }
          found.push(block)
        }
      } else if (seen < (depth.get(node) ?? 0)) {
        stack.push([node, other])
        low.set(node, Math.min(low.get(node) ?? 0, seen))
      }
    }
  }

  for (const node of graph.keys()) if (!depth.has(node)) walk(node, null)
  return found
}

/** A cycle of a block, found by walking until the walk meets a vertex it has already stood on. */
function someCycle(graph: Graph): string[] | null {
  const from = new Map<string, string | null>()
  const seen = new Set<string>()
  const start = [...graph.keys()][0]
  if (start === undefined) return null
  const queue: string[] = [start]
  from.set(start, null)
  seen.add(start)
  while (queue.length > 0) {
    const node = queue.shift() as string
    for (const other of graph.get(node) ?? []) {
      if (other === from.get(node)) continue
      if (seen.has(other)) {
        // Two walks met: the cycle is the two roads back to where they parted.
        const oneWay = pathToRoot(from, node)
        const otherWay = pathToRoot(from, other)
        const shared = new Set(otherWay)
        const meeting = oneWay.find((each) => shared.has(each))
        if (meeting === undefined) continue
        const head = oneWay.slice(0, oneWay.indexOf(meeting) + 1)
        const tail = otherWay.slice(0, otherWay.indexOf(meeting)).reverse()
        return [...head.reverse(), ...tail]
      }
      seen.add(other)
      from.set(other, node)
      queue.push(other)
    }
  }
  return null
}

function pathToRoot(from: ReadonlyMap<string, string | null>, node: string): string[] {
  const out: string[] = []
  for (let at: string | null | undefined = node; at != null; at = from.get(at)) out.push(at)
  return out
}

type Fragment = { readonly inside: readonly string[]; readonly contacts: readonly string[] }

/** Every piece of the block that is not drawn yet, with the drawn vertices it hangs from. */
function fragmentsOf(graph: Graph, drawn: ReadonlySet<string>, done: ReadonlySet<string>) {
  const found: Fragment[] = []
  for (const [a, b] of edgesOf(graph)) {
    if (!drawn.has(a) || !drawn.has(b) || done.has(keyOf(a, b))) continue
    found.push({ inside: [], contacts: [a, b] })
  }
  const seen = new Set<string>()
  for (const node of graph.keys()) {
    if (drawn.has(node) || seen.has(node)) continue
    const inside: string[] = []
    const contacts = new Set<string>()
    const queue = [node]
    seen.add(node)
    while (queue.length > 0) {
      const each = queue.shift() as string
      inside.push(each)
      for (const other of graph.get(each) ?? []) {
        if (drawn.has(other)) {
          contacts.add(other)
          continue
        }
        if (seen.has(other)) continue
        seen.add(other)
        queue.push(other)
      }
    }
    found.push({ inside, contacts: [...contacts] })
  }
  return found
}

function keyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** A way through a fragment from one of its contacts to another, the run that goes into a face. */
function pathThrough(
  graph: Graph,
  fragment: Fragment,
  drawn: ReadonlySet<string>,
): string[] | null {
  const [first, second] = fragment.contacts
  if (first === undefined) return null
  if (fragment.inside.length === 0) return second === undefined ? null : [first, second]
  const inside = new Set(fragment.inside)
  const from = new Map<string, string>()
  const queue: string[] = []
  for (const other of graph.get(first) ?? [])
    if (inside.has(other) && !from.has(other)) {
      from.set(other, first)
      queue.push(other)
    }
  while (queue.length > 0) {
    const node = queue.shift() as string
    for (const other of graph.get(node) ?? []) {
      if (drawn.has(other) && other !== first) {
        const path = [other, node]
        for (let at = from.get(node); at !== undefined && at !== first; at = from.get(at))
          path.push(at)
        path.push(first)
        return path.reverse()
      }
      if (!inside.has(other) || from.has(other)) continue
      from.set(other, node)
      queue.push(other)
    }
  }
  return null
}

/** The face split in two by a run drawn across it. */
function splitFace(face: readonly string[], path: readonly string[]): [string[], string[]] | null {
  const first = path[0]
  const last = path[path.length - 1]
  if (first === undefined || last === undefined) return null
  const from = face.indexOf(first)
  const to = face.indexOf(last)
  if (from < 0 || to < 0) return null
  const walk = (start: number, end: number): string[] => {
    const out: string[] = []
    for (let at = start; ; at = (at + 1) % face.length) {
      out.push(face[at] as string)
      if (at === end) break
    }
    return out
  }
  const middle = path.slice(1, -1)
  return [
    [...walk(from, to), ...[...middle].reverse()],
    [...walk(to, from), ...middle],
  ]
}

/** Whether one block of the graph can be drawn without a crossing. */
function blockIsPlanar(graph: Graph): boolean {
  const nodes = [...graph.keys()]
  const edges = edgesOf(graph)
  if (nodes.length < 5 || edges.length < 9) return true
  if (edges.length > 3 * nodes.length - 6) return false
  const cycle = someCycle(graph)
  if (!cycle) return true
  const drawn = new Set(cycle)
  const done = new Set<string>()
  for (let i = 0; i < cycle.length; i++)
    done.add(keyOf(cycle[i] as string, cycle[(i + 1) % cycle.length] as string))
  let faces: string[][] = [[...cycle], [...cycle]]

  for (let guard = 0; guard <= edges.length; guard++) {
    const fragments = fragmentsOf(graph, drawn, done)
    if (fragments.length === 0) return true
    let chosen: { readonly fragment: Fragment; readonly faces: number[] } | null = null
    for (const fragment of fragments) {
      const fits = faces
        .map((face, index) => ({ face, index }))
        .filter(({ face }) => fragment.contacts.every((contact) => face.includes(contact)))
        .map(({ index }) => index)
      if (fits.length === 0) return false
      if (!chosen || fits.length < chosen.faces.length) chosen = { fragment, faces: fits }
      if (fits.length === 1) break
    }
    if (!chosen) return true
    const path = pathThrough(graph, chosen.fragment, drawn)
    const into = chosen.faces[0]
    const face = into === undefined ? undefined : faces[into]
    if (!path || into === undefined || !face) return true
    const split = splitFace(face, path)
    if (!split) return true
    faces = [...faces.slice(0, into), ...faces.slice(into + 1), split[0], split[1]]
    for (const node of path) drawn.add(node)
    for (let i = 0; i + 1 < path.length; i++)
      done.add(keyOf(path[i] as string, path[i + 1] as string))
  }
  return true
}

/**
 * Whether these rooms and the links between them can be drawn with no link crossing another. A
 * graph is planar when every one of its blocks is, so the blocks are tested one at a time.
 */
export function isPlanar(nodes: readonly string[], pairs: readonly Pair[]): boolean {
  const whole = graphOf(nodes, pairs)
  for (const block of blocks(whole)) {
    const within = new Set(block.flat())
    if (!blockIsPlanar(graphOf([...within], block))) return false
  }
  return true
}
