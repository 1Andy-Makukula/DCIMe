import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspect() {
  try {
    const dailyPath = path.join(__dirname, '..', 'public', 'template_daily_canvas.xlsx');
    const commPath = path.join(__dirname, '..', 'public', 'template_commercial_logbook.xlsx');

    const dailyWb = new ExcelJS.Workbook();
    await dailyWb.xlsx.readFile(dailyPath);
    console.log('Daily Canvas Sheets:', dailyWb.worksheets.map(w => w.name));

    const day1Sheet = dailyWb.getWorksheet('1');
    if (day1Sheet) {
      console.log('Day 1 Sheet Rows 1-10:');
      for (let i = 1; i <= 10; i++) {
        const row = day1Sheet.getRow(i);
        console.log(`Row ${i} values:`, row.values.slice(0, 30));
      }
    }

    const commWb = new ExcelJS.Workbook();
    await commWb.xlsx.readFile(commPath);
    console.log('Commercial Logbook Sheets:', commWb.worksheets.map(w => w.name));
    
    const cpSheet = commWb.worksheets.find(w => w.name.toLowerCase() === 'commercial power log');
    if (cpSheet) {
      console.log('Commercial Power Log Row 6 values:', cpSheet.getRow(6).values.slice(0, 30));
    }
  } catch (err) {
    console.error('Error reading templates:', err);
  }
}

inspect();
