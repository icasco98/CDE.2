import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Downloads } from './downloads'
import { downloadBlob } from './files'

vi.mock('./files', () => ({ downloadBlob: vi.fn() }))

const AT = new Date(2026, 8, 27, 12, 0, 0)

/** The artifact's downloads as a test holds them: every file asked for, and the answer it gives. */
function fakeDownloads(answer: () => Promise<{ status: 'saved' | 'delivered' }>) {
  const saved: { filename: string; data: unknown }[] = []
  const downloads: Downloads = {
    save: (file) => {
      saved.push(file)
      return answer()
    },
  }
  return { saved, downloads }
}

const saved = async () => ({ status: 'saved' as const })

describe('handing an exported file over', () => {
  beforeEach(() => vi.mocked(downloadBlob).mockClear())

  it('uses the browser’s download where the link grants no downloads', async () => {
    const { handOver } = await import('./downloads')
    const blob = new Blob(['%PDF-'])
    expect(await handOver('villa.pdf', blob, null, AT)).toBeNull()
    expect(downloadBlob).toHaveBeenCalledWith('villa.pdf', blob)
  })

  it('hands a PDF to the artifact’s downloads as it is', async () => {
    const { handOver } = await import('./downloads')
    const { saved: files, downloads } = fakeDownloads(saved)
    const blob = new Blob(['%PDF-'])
    expect(await handOver('villa.pdf', blob, downloads, AT)).toBeNull()
    expect(files).toEqual([{ filename: 'villa.pdf', data: blob }])
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('hands a DXF over inside a zip, since the artifact will not hand over a .dxf', async () => {
    const { handOver } = await import('./downloads')
    const { saved: files, downloads } = fakeDownloads(saved)
    await handOver('villa.dxf', new Blob(['0\nEOF\n']), downloads, AT)
    expect(files.map((f) => f.filename)).toEqual(['villa.zip'])
    const zip = new Uint8Array(await (files[0]!.data as Blob).arrayBuffer())
    const text = new TextDecoder().decode(zip)
    expect(text.startsWith('PK\u0003\u0004')).toBe(true)
    expect(text).toContain('villa.dxf0\nEOF\n')
  })

  it('says nothing when the viewer declines, and says why when the save fails', async () => {
    const { handOver } = await import('./downloads')
    const declined = fakeDownloads(() => Promise.reject({ code: 'declined', message: 'No' }))
    expect(await handOver('villa.pdf', new Blob([]), declined.downloads, AT)).toBeNull()
    const limited = fakeDownloads(() =>
      Promise.reject({ code: 'rate_limited', message: 'Too many files at once' }),
    )
    expect(await handOver('villa.pdf', new Blob([]), limited.downloads, AT)).toBe(
      'The file could not be saved: Too many files at once',
    )
  })
})

describe('asking the artifact for its downloads', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is null outside an artifact, and null where the link withholds them', async () => {
    vi.stubGlobal('window', {})
    expect(await (await import('./downloads')).artifactDownloads()).toBeNull()
    vi.resetModules()
    vi.stubGlobal('window', { claude: { use: async () => null } })
    expect(await (await import('./downloads')).artifactDownloads()).toBeNull()
  })

  it('is the downloads the link grants, asked for once', async () => {
    const { downloads } = fakeDownloads(saved)
    const use = vi.fn(async (name: string) => (name === 'downloads' ? downloads : null))
    vi.stubGlobal('window', { claude: { use } })
    const { artifactDownloads } = await import('./downloads')
    expect(await artifactDownloads()).toBe(downloads)
    expect(await artifactDownloads()).toBe(downloads)
    expect(use).toHaveBeenCalledTimes(1)
  })
})
