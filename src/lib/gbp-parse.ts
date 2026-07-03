/**
 * GBP spreadsheet parsing — isolated here because it pulls in `xlsx` (~400KB min).
 * Keep this module OUT of any client component that only needs the pure helpers in
 * gbp-data.ts (formatMonth, METRIC_FIELDS, mapping/date helpers) so xlsx never leaks
 * into their browser bundles. Only the in-browser upload page, which parses the
 * uploaded file client-side, imports this module.
 */
import * as XLSX from 'xlsx'
import type { ParsedSheet } from '@/lib/gbp-data'

export function parseFile(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const sheetName = wb.SheetNames[0]
        const sheet = wb.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        if (!json.length) {
          reject(new Error('File is empty or has no data rows'))
          return
        }
        const headers = Object.keys(json[0])
        resolve({ headers, rows: json })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}
