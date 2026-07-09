import ExcelJS from 'exceljs';
import path from 'path';

const projectRoot = 'c:\\Users\\Owner\\Downloads\\DCIMe_Engine';
const commercialLogbookPath = path.join(projectRoot, 'public', 'template_commercial_logbook.xlsx');

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(commercialLogbookPath);
  
  const worksheet = workbook.getWorksheet('Environment');
  if (!worksheet) {
    console.log('Environment worksheet not found!');
    return;
  }
  
  console.log(`Scanning Environment worksheet (${worksheet.rowCount} rows)...`);
  for (let r = 1; r <= Math.min(worksheet.rowCount, 50); r++) {
    const row = worksheet.getRow(r);
    const cellVals = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cellVals.push(`Col ${colNumber}: ${JSON.stringify(cell.value)}`);
    });
    if (cellVals.length > 0) {
      console.log(`Row ${r}: ${cellVals.join(' | ')}`);
    }
  }
}

run().catch(console.error);
