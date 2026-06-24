import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { MASTER_ASSET_DICTIONARY, TargetWorkbook } from "../../features/field/constants/telemetrySchema";

// Helper to translate 0-based index to Excel column letter
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

export const generateMonthlyReport = async (
  month: string,
  year: string,
  logs: any[]
): Promise<void> => {
  // 3. Fetch Templates concurrently
  const [dailyRes, commRes] = await Promise.all([
    fetch("/template_daily_canvas.xlsx").catch(() => null),
    fetch("/template_commercial_logbook.xlsx").catch(() => null)
  ]);

  if (!dailyRes || !commRes || !dailyRes.ok || !commRes.ok) {
    throw new Error("Failed to fetch templates. Ensure template_daily_canvas.xlsx and template_commercial_logbook.xlsx are in the /public folder.");
  }

  // Load them into separate ExcelJS.Workbook instances
  const dailyWb = new ExcelJS.Workbook();
  await dailyWb.xlsx.load(await dailyRes.arrayBuffer());

  const commWb = new ExcelJS.Workbook();
  await commWb.xlsx.load(await commRes.arrayBuffer());

  // 4. The Routing Engine (The Loop)
  for (const log of logs) {
    const timestampStr = log.target_hour;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    const day = date.getDate();
    const hour = date.getHours();

    if (!log.metrics) continue;

    // Loop over MASTER_ASSET_DICTIONARY -> categories -> assets -> metrics
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        asset.metrics.forEach((metric) => {
          const cellValue = log.metrics[metric.id];
          if (cellValue === undefined || cellValue === null) return;

          // 5. Geometric Matrix Injections
          metric.destinations.forEach((dest) => {
            const targetWb = dest.workbook === 'daily_canvas' ? dailyWb : commWb;
            const sheetName = dest.sheetName === 'DYNAMIC_DAY' ? day.toString() : dest.sheetName;

            const sheet = targetWb.getWorksheet(sheetName) || targetWb.getWorksheet(day.toString().padStart(2, '0'));
            if (!sheet) return;

            const colLetter = getExcelColumn(dest.excelColumnIndex);
            let targetRow = 0;

            // 6. Exhaustive Target Row Calculations
            if (dest.workbook === 'daily_canvas') {
              // Condition A (The Hourly Canvas): 00:00 starts on Row 5, each hour is 1 row down
              targetRow = hour + 5;
            } else if (dest.workbook === 'commercial_logbook') {
              if (sheetName === 'Commercial Power Log' || sheetName === 'Temp Record') {
                // Condition B (4-Hour Blocks): 6 rows per day. Day 1 00:00 is on Row 5
                targetRow = 5 + ((day - 1) * 6) + Math.floor(hour / 4);
              } else if (sheetName === 'Fuel Record' || sheetName.startsWith('DG-')) {
                // Condition C (Cumulative Daily Logs): 1 row per day. Fuel starts on Row 3, DGs start on Row 4
                const baseRow = sheetName === 'Fuel Record' ? 3 : 4;
                targetRow = baseRow + (day - 1);
              } else if (sheetName === 'Eqpt status') {
                // Condition D (Transposed Matrix - Eqpt Status)
                // Search Column C (from row 5 to 100) for asset.name
                let assetRowIndex = -1;
                sheet.getColumn(3).eachCell((cell, rowNumber) => {
                  if (rowNumber >= 5 && rowNumber <= 100) {
                    const cellValStr = cell.value?.toString() || "";
                    if (cellValStr.trim() === asset.name.trim()) {
                      assetRowIndex = rowNumber;
                    }
                  }
                });

                // Search Row 3 (from col 5 to 150) for day
                let dayColIndex = -1;
                sheet.getRow(3).eachCell((cell, colNumber) => {
                  if (colNumber >= 5 && colNumber <= 150) {
                    const cellVal = cell.value;
                    if (cellVal !== undefined && cellVal !== null) {
                      const parsedDay = parseInt(cellVal.toString(), 10);
                      if (parsedDay === day) {
                        dayColIndex = colNumber;
                      }
                    }
                  }
                });

                // If both intersect, inject the cellValue at that specific cell coordinate
                if (assetRowIndex !== -1 && dayColIndex !== -1) {
                  const colLetterIntersect = getExcelColumn(dayColIndex - 1);
                  const cellAddr = `${colLetterIntersect}${assetRowIndex}`;
                  sheet.getCell(cellAddr).value = cellValue === "" ? "NA" : cellValue;
                }
              }
            }

            // 7. Write the Value
            if (targetRow > 0) {
              sheet.getCell(colLetter + targetRow).value = cellValue === "" ? "NA" : cellValue;
            }
          });
        });
      });
    });
  }

  // 8. Trigger Dual Download
  const dailyBuffer = await dailyWb.xlsx.writeBuffer();
  saveAs(new Blob([dailyBuffer]), `Airtel_Daily_Canvas_${month}_${year}.xlsx`);

  const commBuffer = await commWb.xlsx.writeBuffer();
  saveAs(new Blob([commBuffer]), `Airtel_Commercial_Logbook_${month}_${year}.xlsx`);
};

export const generateLegacyMonthlyReport = async (
  month: string,
  year: string,
  flatData: any[]
): Promise<void> => {
  const mappedLogs = flatData.map((row) => {
    const metrics: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      if (key !== "target_hour" && key !== "created_at") {
        metrics[key] = row[key];
      }
    });
    return {
      target_hour: row.target_hour || row.created_at,
      metrics,
    };
  });
  return generateMonthlyReport(month, year, mappedLogs);
};
