import * as XLSX from 'xlsx'

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        const words = []
        for (let i = 1; i < rows.length; i++) { // 0번째 행(헤더) 건너뜀
        const row = rows[i]
          const word = String(row[0] ?? '').trim()
          const meaning = String(row[1] ?? '').trim()
          if (!word || !meaning) continue

          const examples = []
          for (let i = 2; i <= 6; i++) {
            const ex = String(row[i] ?? '').trim()
            if (ex) examples.push(ex)
          }
          words.push({ word, meaning, examples })
        }
        resolve(words)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
