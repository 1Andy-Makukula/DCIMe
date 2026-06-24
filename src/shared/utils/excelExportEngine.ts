import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { MASTER_ASSET_DICTIONARY, TargetWorkbook } from "../../features/field/constants/telemetrySchema";

/** Translates 0-based index to Excel column letter (0 -> A, 1 -> B) */
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

export const generateLegacyMonthlyReport = async (
  month: string,
  year: string,
  flatData: any[]
): Promise<void> => {
  // 1. Fetch BOTH Master Templates
  const [dailyRes, commRes] = await Promise.all([
    fetch("/template_daily_canvas.xlsx").catch(() => null),
    fetch("/template_commercial_logbook.xlsx").catch(() => null)
  ]);

  if (!dailyRes || !commRes || !dailyRes.ok || !commRes.ok) {
    throw new Error("Failed to fetch templates. Ensure template_daily_canvas.xlsx and template_commercial_logbook.xlsx are in the /public folder.");
  }

  const dailyWorkbook = new ExcelJS.Workbook();
  await dailyWorkbook.xlsx.load(await dailyRes.arrayBuffer());

  const commWorkbook = new ExcelJS.Workbook();
  await commWorkbook.xlsx.load(await commRes.arrayBuffer());

  const getWorkbook = (wb: TargetWorkbook) => wb === 'daily_canvas' ? dailyWorkbook : commWorkbook;

  // 2. Process all chronological data
  for (const rowData of flatData) {
    // Rely on target_hour (from our new upsert logic) or fallback to created_at
    const timestampStr = rowData.target_hour || rowData.created_at;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    const day = date.getDate();
    const hour = date.getHours();

    // 3. Loop the Master Dictionary for routing
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        asset.metrics.forEach((metric) => {
          const cellValue = rowData[metric.id];
          if (cellValue === undefined || cellValue === null) return;

          metric.destinations.forEach((dest) => {
            const targetWb = getWorkbook(dest.workbook);
            const sheetName = dest.sheetName === 'DYNAMIC_DAY' ? day.toString() : dest.sheetName;
            
            // Try exact match or padded match (e.g. "1" or "01")
            const sheet = targetWb.getWorksheet(sheetName) || targetWb.getWorksheet(day.toString().padStart(2, '0'));
            if (!sheet) return;

            const colLetter = getExcelColumn(dest.excelColumnIndex);
            let targetRow = 0;

            // 4. Advanced Geometry Routing
            if (dest.workbook === 'daily_canvas') {
              // Hourly logic: 00:00 starts on row 5
              targetRow = hour + 5; 
            } else if (dest.workbook === 'commercial_logbook') {
              if (sheetName === 'Commercial Power Log' || sheetName === 'Temp Record') {
                // 4-Hour blocks: 6 rows per day. Day 1 00:00 is on Row 5.
                targetRow = 5 + ((day - 1) * 6) + Math.floor(hour / 4);
              } else if (sheetName === 'Fuel Record' || sheetName.startsWith('DG-')) {
                // 1 row per day. Day 1 is on Row 4 for DG, Row 3 for Fuel (approximated, script will land safely)
                const baseRow = sheetName === 'Fuel Record' ? 3 : 4;
                targetRow = baseRow + (day - 1);
              }
            }

            // 5. Injection
            if (targetRow > 0) {
              const safeValue = cellValue === "" ? "NA" : cellValue;
              sheet.getCell(colLetter + targetRow).value = safeValue;
            }
          });
        });
      });
    });
  }

  // 6. Trigger Dual Download
  const dailyBuffer = await dailyWorkbook.xlsx.writeBuffer();
  saveAs(new Blob([dailyBuffer]), `Airtel_Daily_Canvas_${month}_${year}.xlsx`);

  const commBuffer = await commWorkbook.xlsx.writeBuffer();
  saveAs(new Blob([commBuffer]), `Airtel_Commercial_Logbook_${month}_${year}.xlsx`);
};
