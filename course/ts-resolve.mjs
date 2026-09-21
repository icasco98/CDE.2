/**
 * How plain Node reads the tool's own sources: an extensionless import is a TypeScript file, and a
 * `?raw` import is that file's text. Nothing here transforms the sources; Node strips the types.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const tried = async (specifier, context, next) => {
  try {
    return await next(specifier, context)
  } catch {
    return null
  }
}

export async function resolve(specifier, context, next) {
  const [path, query] = specifier.split('?')
  if (query === 'raw')
    return { ...(await next(path, context)), format: 'raw-text', shortCircuit: true }
  if (path.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(path))
    return (
      (await tried(`${path}.ts`, context, next)) ??
      (await tried(`${path}/index.ts`, context, next)) ??
      next(specifier, context)
    )
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (context.format === 'raw-text') {
    const text = await readFile(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(text)}`,
    }
  }
  return next(url, context)
}
