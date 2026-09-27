import { sheetOf } from '../sheet'
import { dxfOf, pdfOf } from '../export'
import { createAside, followProject, plotOf, programOf } from '../views/sheet/project'
import { localSheet } from '../views/sheet/store'
import { downloadBlob, fileNameFor } from './files'
import { session } from './session'

/**
 * Both exports draw the sheet as the browser has it kept, which is the sheet on screen; the stage
 * writes a change through within half a second of the hand coming off it. It is read as the project
 * asks for it, the project's rooms and no other. Nothing is written back.
 */
export function ExportMenu({ title }: { title: string }) {
  const sheet = () => {
    const project = session.getState()
    return followProject(
      localSheet(project.edges) ?? sheetOf([]),
      programOf(project.rooms),
      plotOf(project.plot),
      project.edges,
      createAside(),
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() =>
          downloadBlob(
            fileNameFor(title, 'pdf'),
            new Blob([pdfOf(sheet(), title, new Date())], { type: 'application/pdf' }),
          )
        }
      >
        Export PDF
      </button>
      <button
        type="button"
        onClick={() =>
          downloadBlob(
            fileNameFor(title, 'dxf'),
            new Blob([dxfOf(sheet())], { type: 'image/vnd.dxf' }),
          )
        }
      >
        Export DXF
      </button>
    </>
  )
}
