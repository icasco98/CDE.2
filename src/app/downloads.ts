/**
 * Handing an exported file to the person: through the artifact's downloads when the link grants
 * them, since its sandbox blocks a plain download, else through the browser's own download.
 */

import { downloadBlob } from './files'
import { session } from './session'
import { zipOf } from './zip'

type SaveInput = { filename: string; data: string | Blob | ArrayBuffer }

export type Downloads = {
  save: (file: SaveInput) => Promise<{ status: 'saved' | 'delivered' }>
}

/** The kinds of file the artifact's downloads hand over; any other goes inside a zip. */
const HANDED = new Set([
  ...['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx'],
  ...['epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip'],
])

const asDownloads = (value: unknown): Downloads | null => {
  const downloads = value as Downloads | null
  return downloads && typeof downloads.save === 'function' ? downloads : null
}

let granted: Promise<Downloads | null> | null = null

/** The artifact's downloads, asked for once; null outside an artifact or where the link withholds them. */
export function artifactDownloads(): Promise<Downloads | null> {
  granted ??= (async () => {
    const use = window.claude?.use
    if (typeof use !== 'function') return null
    return asDownloads(await use.call(window.claude, 'downloads').catch(() => null))
  })()
  return granted
}

/**
 * Hands the file over, and says why when it could not be; the viewer declining is their answer,
 * not a failure.
 */
export async function handOver(
  name: string,
  blob: Blob,
  downloads: Downloads | null,
  at: Date,
): Promise<string | null> {
  if (!downloads) {
    downloadBlob(name, blob)
    return null
  }
  const dot = name.lastIndexOf('.')
  const file: SaveInput = HANDED.has(name.slice(dot + 1).toLowerCase())
    ? { filename: name, data: blob }
    : {
        filename: `${name.slice(0, dot)}.zip`,
        data: new Blob([zipOf([{ name, data: new Uint8Array(await blob.arrayBuffer()) }], at)], {
          type: 'application/zip',
        }),
      }
  try {
    await downloads.save(file)
    return null
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
    if (code === 'declined') return null
    return `The file could not be saved: ${typeof message === 'string' && message ? message : String(code ?? error)}`
  }
}

/** Hands a file over the way this view allows, and says so in the message corner when it could not. */
export const offer = (name: string, blob: Blob): void =>
  void artifactDownloads()
    .then((downloads) => handOver(name, blob, downloads, new Date()))
    .then((failed) => failed && session.warn(failed))
