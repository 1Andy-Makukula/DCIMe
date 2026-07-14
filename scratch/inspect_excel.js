import ExcelJS from 'exceljs';
import path from 'path';

async function inspect() {
  const dailyPath = path.resolve('public/template_daily_canvas.xlsx');
  const dailyWb = new ExcelJS.Workbook();
  await dailyWb.xlsx.readFile(dailyPath);
  
  const sheet = dailyWb.getWorksheet('FSS & VESDA');
  if (sheet) {
    console.log(`Sheet: ${sheet.name}`);
    for (let r = 1; r <= 40; r++) {
      const row = sheet.getRow(r).values;
      if (row && row.some(v => v)) {
        console.log(`Row ${r}:`, row.slice(1, 15).map(v => v === null || v === undefined ? '' : v));
      }
    }
  }
}

inspect().catch(err => console.error(err));
