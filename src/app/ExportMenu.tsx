import { dxfOf, pdfOf } from '../export'
import type { Project } from '../model'
import { downloadBlob, fileNameFor } from './files'

/** Both exports read the project as it stands and write nothing back to it. */
export function ExportMenu({ project }: { project: Project }) {
  return (
    <>
      <button
        type="button"
        onClick={() =>
          downloadBlob(
            fileNameFor(project.name, 'pdf'),
            new Blob([pdfOf(project, new Date())], { type: 'application/pdf' }),
          )
        }
      >
        Export PDF
      </button>
      <button
        type="button"
        onClick={() =>
          downloadBlob(
            fileNameFor(project.name, 'dxf'),
            new Blob([dxfOf(project)], { type: 'image/vnd.dxf' }),
          )
        }
      >
        Export DXF
      </button>
    </>
  )
}
