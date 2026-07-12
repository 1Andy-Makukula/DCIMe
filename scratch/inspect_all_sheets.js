import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspect(fileName) {
  const filePath = path.join(__dirname, '../public', fileName);
  console.log(`\n=========================================`);
  console.log(`INSPECTING WORKBOOK: ${fileName}`);
  console.log(`=========================================`);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    console.error(`Failed to read ${fileName}:`, err);
    return;
  }
  
  workbook.eachSheet(sheet => {
    console.log(`\nSheet Name: "${sheet.name}"`);
    // Print headers from first 10 rows
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
      const row = sheet.getRow(r);
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let val = cell.value;
        if (typeof val === 'object' && val !== null) {
          val = val.richText ? val.richText.map(t => t.text).join('') : JSON.stringify(val);
        }
        // strip newlines to keep output clean
        val = String(val).replace(/\r?\n|\r/g, " ");
        cells.push(`[C${colNumber - 1} (${colNumber})]: ${val}`);
      });
      if (cells.length > 0) {
        console.log(`  Row ${r}: ${cells.slice(0, 15).join(' | ')}`);
      }
    }
  });
}

async function run() {
  await inspect('template_daily_canvas.xlsx');
  await inspect('template_commercial_logbook.xlsx');
}

run().catch(console.error);
