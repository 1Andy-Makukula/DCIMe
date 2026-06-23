import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { HOURLY_TELEMETRY_SCHEMA } from "../../features/field/constants/telemetrySchema";

/**
 * Mathematically translates a 0-based index to an Excel column letter.
 * E.g., 0 -> A, 1 -> B, 25 -> Z, 26 -> AA, 27 -> AB
 */
const getExcelColumn = (index: number): string => {
  let colName = "";
  let dividend = index + 1;
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    colName = String.fromCharCode(65 + modulo) + colName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return colName;
};

/**
 * Generates the legacy monthly report by taking flat chronological telemetry data
 * and injecting it into a legacy 40-sheet Excel template, preserving all corporate
 * formatting.
 * 
 * @param month Name of the month (e.g. "June")
 * @param year Year (e.g. "2026")
 * @param flatData Array of chronological telemetry records
 */
export const generateLegacyMonthlyReport = async (
  month: string,
  year: string,
  flatData: any[]
): Promise<void> => {
  // Fetch the blank template from the public folder
  const response = await fetch("/Blank_Monthly_Template.xlsx");
  if (!response.ok) {
    throw new Error(`Failed to fetch Excel template: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  // Load it into ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  // The Router Loop: Iterate through flatData
  for (const rowData of flatData) {
    if (!rowData.created_at) continue;

    // Time & Date Parsing: Extract the day (1-31) and hour (0-23) from the row's created_at ISO string
    const date = new Date(rowData.created_at);
    const day = date.getDate();
    const hour = date.getHours();

    // Select the correct sheet: fallback check for padded names
    const sheetName = day.toString();
    const sheet = workbook.getWorksheet(sheetName) || workbook.getWorksheet(day.toString().padStart(2, '0'));
    if (!sheet) {
      console.warn(`Sheet ${sheetName} not found, skipping.`);
      continue;
    }

    // Calculate the exact Excel row. (Assuming 00:00 starts on Row 5)
    const targetRow = hour + 5;

    // Add Traceability
    console.log(`Injecting Data -> Sheet: ${sheet.name}, Hour: ${hour}:00, Row: ${targetRow}`);

    // Dynamic Schema Loop
    HOURLY_TELEMETRY_SCHEMA.forEach((field) => {
      if (field.excelColumnIndex !== undefined && field.excelColumnIndex >= 0) {
        const colLetter = getExcelColumn(field.excelColumnIndex);
        const cellValue = rowData[field.id];
        
        // The Null-to-NA Pipeline
        sheet.getCell(colLetter + targetRow).value = 
          (cellValue === null || cellValue === undefined || cellValue === "") ? "NA" : cellValue;
      }
    });
  }

  // Save and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `NTC_Daily_Checks_${month}_${year}.xlsx`);
};
