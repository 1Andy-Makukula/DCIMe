const ExcelJS = require('exceljs');
const path = require('path');

async function inspect() {
  try {
    const dailyPath = path.join(__dirname, '..', 'public', 'template_daily_canvas.xlsx');
    const commPath = path.join(__dirname, '..', 'public', 'template_commercial_logbook.xlsx');

    const dailyWb = new ExcelJS.Workbook();
    await dailyWb.xlsx.readFile(dailyPath);
    console.log('Daily Canvas Sheets:', dailyWb.worksheets.map(w => w.name));

    const commWb = new ExcelJS.Workbook();
    await commWb.xlsx.readFile(commPath);
    console.log('Commercial Logbook Sheets:', commWb.worksheets.map(w => w.name));
  } catch (err) {
    console.error('Error reading templates:', err);
  }
}

inspect();
