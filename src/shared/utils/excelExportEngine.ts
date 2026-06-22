import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

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

    // Calculate the exact Excel row. (Assuming 00:00 starts on Row 6)
    const targetRow = hour + 6;

    // Helper for Null-to-NA Pipeline: If a value is null, undefined, or "", explicitly inject "NA"
    const getSafeValue = (val: any) => {
      if (val === null || val === undefined || val === "") {
        return "NA";
      }
      return val;
    };

    // Add Traceability
    console.log(`Injecting Data -> Sheet: ${sheet.name}, Hour: ${hour}:00, Row: ${targetRow}`);

    // Data Mapping & Null-to-NA Pipeline
    sheet.getCell("B" + targetRow).value = getSafeValue(rowData.grid_amps_R);
    sheet.getCell("E" + targetRow).value = getSafeValue(rowData.grid_volts_R);
    sheet.getCell("AD" + targetRow).value = getSafeValue(rowData.ups1_load_kw);
  }

  // Save and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `NTC_Daily_Checks_${month}_${year}.xlsx`);
};
