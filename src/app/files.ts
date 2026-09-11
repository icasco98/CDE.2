export function fileNameFor(projectName: string, extension: string): string {
  const stem = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${stem || 'project'}.${extension}`
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Let go of the blob on the next turn, so the browser has taken hold of it before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
