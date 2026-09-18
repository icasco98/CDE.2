import { sampleSheet } from '../sheet'
import { dxfOf, pdfOf } from '../export'
import { localSheet } from '../views/sheet/store'
import { downloadBlob, fileNameFor } from './files'

/**
 * Both exports draw the sheet as the browser has it kept, which is the sheet on screen; the stage
 * writes a change through within half a second of the hand coming off it. Nothing is written back.
 */
export function ExportMenu({ title }: { title: string }) {
  const sheet = () => localSheet() ?? sampleSheet()
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
