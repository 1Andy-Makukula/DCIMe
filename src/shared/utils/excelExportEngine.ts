import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { MASTER_ASSET_DICTIONARY } from "../../features/field/constants/telemetrySchema";

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

// Helper to convert column letter to 0-based index
const columnLetterToIndex = (colLetter: string): number => {
  let index = 0;
  for (let i = 0; i < colLetter.length; i++) {
    index = index * 26 + (colLetter.charCodeAt(i) - 64);
  }
  return index - 1;
};

// Helper to get PAC unit equipment index (0 to 23)
const getPacEquipmentIndex = (assetId: string): number => {
  if (assetId.startsWith("pac_server_em")) {
    const num = parseInt(assetId.replace("pac_server_em", ""), 10);
    if (num >= 1 && num <= 7) return num - 1; // 0 to 6
  }
  if (assetId.startsWith("pac_server_vt")) {
    const num = parseInt(assetId.replace("pac_server_vt", ""), 10);
    if (num === 3) return 7;
    if (num === 4) return 8;
    if (num === 5) return 9;
    if (num === 1) return 22;
    if (num === 2) return 23;
  }
  if (assetId.startsWith("pac_pr1_em")) {
    const num = parseInt(assetId.replace("pac_pr1_em", ""), 10);
    if (num >= 1 && num <= 3) return 13 + (num - 1); // 13 to 15
  }
  if (assetId.startsWith("pac_pr2_em")) {
    const num = parseInt(assetId.replace("pac_pr2_em", ""), 10);
    if (num >= 1 && num <= 2) return 16 + (num - 1); // 16 to 17
  }
  if (assetId.startsWith("pac_it1_em")) {
    const num = parseInt(assetId.replace("pac_it1_em", ""), 10);
    if (num >= 1 && num <= 2) return 18 + (num - 1); // 18 to 19
  }
  if (assetId.startsWith("pac_it2_em")) {
    const num = parseInt(assetId.replace("pac_it2_em", ""), 10);
    if (num >= 1 && num <= 2) return 20 + (num - 1); // 20 to 21
  }
  return -1;
};

// Helper to get Equipment Status row index (OK/Not OK sheet rows)
const getEqptStatusRow = (assetId: string): number => {
  if (assetId === "ups_1") return 5;
  if (assetId === "ups_2") return 6;
  if (assetId === "rectifier_1") return 7;
  if (assetId === "rectifier_2") return 8;
  if (assetId.startsWith("pac_server_em")) {
    const num = parseInt(assetId.replace("pac_server_em", ""), 10);
    if (num >= 1 && num <= 7) return 9 + (num - 1);
  }
  if (assetId.startsWith("pac_server_vt")) {
    const num = parseInt(assetId.replace("pac_server_vt", ""), 10);
    if (num >= 1 && num <= 5) return 16 + (num - 1);
  }
  if (assetId === "pac_server_dragor") return 21;
  if (assetId.startsWith("pac_pr1_em")) {
    const num = parseInt(assetId.replace("pac_pr1_em", ""), 10);
    if (num >= 1 && num <= 3) return 24 + (num - 1);
  }
  if (assetId.startsWith("pac_pr2_em")) {
    const num = parseInt(assetId.replace("pac_pr2_em", ""), 10);
    if (num >= 1 && num <= 2) return 27 + (num - 1);
  }
  if (assetId.startsWith("pac_it1_em")) {
    const num = parseInt(assetId.replace("pac_it1_em", ""), 10);
    if (num >= 1 && num <= 2) return 29 + (num - 1);
  }
  if (assetId.startsWith("pac_it2_em")) {
    const num = parseInt(assetId.replace("pac_it2_em", ""), 10);
    if (num >= 1 && num <= 2) return 31 + (num - 1);
  }
  return -1;
};

// Direct column overrides for Daily Canvas sheet to resolve schema mismatch
const DAILY_CANVAS_OVERRIDE_COLUMNS: Record<string, string> = {
  // ZESCO Grid
  "grid_amps_r": "B",
  "grid_amps_y": "C",
  "grid_amps_b": "D",
  "grid_voltage_r": "E",
  "grid_voltage_y": "F",
  "grid_voltage_b": "G",
  "grid_frequency": "H",
  "grid_status": "I",
  "grid_off_time": "J",
  "grid_restored_time": "K",
  "grid_off_duration": "L",
  "grid_total_site_load": "M",

  // DG Load
  "dg_load_amps_r": "N",
  "dg_load_amps_y": "O",
  "dg_load_amps_b": "P",
  "dg_load_voltage_r": "Q",
  "dg_load_voltage_y": "R",
  "dg_load_voltage_b": "S",

  // Generator 1
  "dg_1_run_hrs": "T",
  "dg_1_batt_voltage": "U",
  "dg_1_charged_status": "V",

  // Generator 2
  "dg_2_run_hrs": "W",
  "dg_2_batt_voltage": "X",
  "dg_2_charged_status": "Y",

  // Generator 3
  "dg_3_run_hrs": "Z",
  "dg_3_batt_voltage": "AA",
  "dg_3_charged_status": "AB",

  // Generator 4
  "dg_4_run_hrs": "AC",
  "dg_4_batt_voltage": "AD",
  "dg_4_charged_status": "AE",

  // UPS 1
  "ups_1_output_load_kw": "AF",
  "ups_1_used_capacity": "AG",
  "ups_1_battery_charge_percent": "AH",
  "ups_1_battery_voltage": "AI",
  "ups_1_load_amps_a": "AJ",
  "ups_1_load_amps_b": "AK",
  "ups_1_load_amps_c": "AL",
  "ups_1_load_phase_percent_a": "AM",
  "ups_1_load_phase_percent_b": "AN",
  "ups_1_load_phase_percent_c": "AO",
  "ups_1_output_voltage_a": "AP",
  "ups_1_output_voltage_b": "AQ",
  "ups_1_output_voltage_c": "AR",

  // UPS 2
  "ups_2_output_load_kw": "AS",
  "ups_2_used_capacity": "AT",
  "ups_2_battery_charge_percent": "AU",
  "ups_2_battery_voltage": "AV",
  "ups_2_load_amps_a": "AW",
  "ups_2_load_amps_b": "AX",
  "ups_2_load_amps_c": "AY",
  "ups_2_load_phase_percent_a": "AZ",
  "ups_2_load_phase_percent_b": "BA",
  "ups_2_load_phase_percent_c": "BB",
  "ups_2_output_voltage_a": "BC",
  "ups_2_output_voltage_b": "BD",
  "ups_2_output_voltage_c": "BE",

  // Rectifier 1
  "rectifier_1_dc_voltage": "BF",
  "rectifier_1_amps": "BG",
  "rectifier_1_battery_status": "BH",
  "rectifier_1_used_percentage": "BI",

  // Rectifier 2
  "rectifier_2_dc_voltage": "BJ",
  "rectifier_2_amps": "BK",
  "rectifier_2_battery_status": "BL",
  "rectifier_2_used_percentage": "BM",

  // Temperatures
  "server_ambient_temp": "BN",
  "server_ambient_humidity": "BO",
  "media_ambient_temp": "BP",
  "media_ambient_humidity": "BQ",
  "pr1_ambient_temp": "BR",
  "pr1_ambient_humidity": "BS",
  "pr2_ambient_temp": "BT",
  "pr2_ambient_humidity": "BU",
  "it1_ambient_temp": "BV",
  "it1_ambient_humidity": "BW",
  "it2_ambient_temp": "BX",
  "it2_ambient_humidity": "BY",
  "workstation_status": "BZ",
  "fm200_status": "CA",
  "facility_load_on": "CB",
};

// DG Check battery voltage column overrides
const DG_CHECK_COLUMNS: Record<string, string> = {
  "dg_1_batt_voltage": "B",
  "dg_2_batt_voltage": "F",
  "dg_3_batt_voltage": "J",
  "dg_4_batt_voltage": "N",
  "dg_hq_batt_voltage": "R",
};

// Helper to get fallback/constant value based on user spec
const getFallbackValue = (metricId: string, lastValue: any): any => {
  if (lastValue !== undefined && lastValue !== null && lastValue !== "") {
    return lastValue;
  }

  // Fallback defaults from the user's specification tables
  if (metricId === "grid_status") return "ON";
  if (metricId === "grid_off_time") return "0:00";
  if (metricId === "grid_restored_time") return "0:00";
  if (metricId === "grid_off_duration") return "0:00";

  if (metricId.startsWith("dg_load_amps_") || metricId.startsWith("dg_load_voltage_")) {
    return 0;
  }

  if (metricId.endsWith("_charged_status")) return "GREEN";

  if (metricId === "dg_1_batt_voltage" || metricId === "dg_2_batt_voltage" || metricId === "dg_3_batt_voltage") {
    return 26.7;
  }
  if (metricId === "dg_4_batt_voltage" || metricId === "dg_hq_batt_voltage") {
    return 27.7;
  }

  if (metricId.endsWith("_run_hrs") || metricId.endsWith("_cumulative_hrs") || metricId.endsWith("_hr_meter_start") || metricId.endsWith("_hr_meter_stop") || metricId.endsWith("_kwh_meter") || metricId === "fuel_brought_forward" || metricId === "fuel_balance") {
    if (metricId.includes("fuel")) return "LAST ADDED";
    return "LAST ENTERED";
  }

  if (metricId.endsWith("_auto_status")) return "YES";

  if (metricId.startsWith("ups_1_output_load_kw") || metricId.startsWith("ups_1_used_capacity") ||
      metricId.startsWith("ups_2_output_load_kw") || metricId.startsWith("ups_2_used_capacity")) {
    return "N/A";
  }

  if (metricId.endsWith("_battery_charge_percent")) return 100;

  if (metricId.startsWith("ups_1_output_voltage_")) return 230;
  if (metricId.startsWith("ups_2_output_voltage_")) return 231;

  if (metricId.endsWith("_dc_voltage")) return 54.2;
  if (metricId.endsWith("_amps") || metricId.endsWith("_used_percentage")) return "N/A";
  if (metricId.endsWith("_battery_status")) return "OK";

  if (metricId === "media_ambient_temp") return "OFF";
  if (metricId === "media_ambient_humidity") return "NA";

  if (metricId.startsWith("pr1_ambient_temp") || metricId.startsWith("pr2_ambient_temp") ||
      metricId.startsWith("it1_ambient_temp") || metricId.startsWith("it2_ambient_temp")) {
    return "N/A";
  }
  if (metricId.startsWith("pr1_ambient_humidity") || metricId.startsWith("pr2_ambient_humidity") ||
      metricId.startsWith("it1_ambient_humidity") || metricId.startsWith("it2_ambient_humidity")) {
    return "NA";
  }

  if (metricId === "workstation_status") return "OK";
  if (metricId === "fm200_status") return "OK";
  if (metricId === "facility_load_on") return "MAINS";

  if (metricId.endsWith("_daily_abnormality")) return "NON";

  // PAC sheet constants
  if (metricId.endsWith("_return_temp_set") || metricId.endsWith("_supply_temp_set") || metricId.endsWith("_humidity_set")) {
    return "LAST ENTERED";
  }
  if (metricId.endsWith("_voltage_ry") || metricId.endsWith("_voltage_yb") || metricId.endsWith("_voltage_br") ||
      metricId.endsWith("_current_r") || metricId.endsWith("_current_y") || metricId.endsWith("_current_b") ||
      metricId.endsWith("_current_n")) {
    return "NA";
  }

  return "";
};

export const generateMonthlyReport = async (
  month: string,
  year: string,
  logs: any[]
): Promise<void> => {
  // Fetch Templates concurrently
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

  // Filter out daily checklists from telemetry log processing
  const filteredLogs = logs.filter(log => log.frequency !== "daily" && log.asset_id !== "daily_checklist");

  // Sort logs chronologically to ensure correct carry-forward state tracking
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    return new Date(a.target_hour).getTime() - new Date(b.target_hour).getTime();
  });

  // Stateful carry-forward trackers
  const lastEnteredValues: Record<string, any> = {};

  // Routing Engine (The Loop)
  for (const log of sortedLogs) {
    const timestampStr = log.target_hour;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    const day = date.getDate();
    const hour = date.getHours();
    const techName = log.technician_name || "Field Tech";

    // Update state tracker with newly logged values
    if (log.metrics) {
      Object.keys(log.metrics).forEach((key) => {
        const val = log.metrics[key];
        if (val !== undefined && val !== null && val !== "") {
          lastEnteredValues[key] = val;
        }
      });
    }

    // Loop over categories -> assets -> metrics
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        asset.metrics.forEach((metric) => {
          const rawValue = log.metrics ? log.metrics[metric.id] : undefined;
          const cellValue = getFallbackValue(metric.id, rawValue !== undefined && rawValue !== null && rawValue !== "" ? rawValue : lastEnteredValues[metric.id]);

          // Route to DYNAMIC_DAY in daily_canvas
          const dailyCol = DAILY_CANVAS_OVERRIDE_COLUMNS[metric.id];
          if (dailyCol) {
            const sheetName = day.toString().padStart(2, "0");
            const sheet = dailyWb.getWorksheet(sheetName) || dailyWb.getWorksheet(day.toString());
            if (sheet) {
              const targetRow = hour + 6; // Starts at row 6 for 00:00
              sheet.getCell(dailyCol + targetRow).value = cellValue;
              // Write shift technician to CC
              sheet.getCell("CC" + targetRow).value = techName;
            }
          }

          // Route to destinations in commercial_logbook
          metric.destinations.forEach((dest) => {
            if (dest.workbook !== "commercial_logbook") return;

            const sheetName = dest.sheetName;
            const sheet = commWb.getWorksheet(sheetName);
            if (!sheet) return;

            let colLetter = getExcelColumn(dest.excelColumnIndex);
            let targetRow = 0;

            if (sheetName === "Commercial Power Log" || sheetName === "Temp Record") {
              // 4-Hour blocks, starts at row 7, 6 rows per day
              targetRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);

              // Map correct columns based on parameters
              if (sheetName === "Commercial Power Log") {
                if (metric.id === "grid_voltage_r") colLetter = "C";
                else if (metric.id === "grid_voltage_y") colLetter = "D";
                else if (metric.id === "grid_voltage_b") colLetter = "E";
                else if (metric.id === "grid_phase_voltage_rn") colLetter = "F";
                else if (metric.id === "grid_phase_voltage_yn") colLetter = "G";
                else if (metric.id === "grid_phase_voltage_bn") colLetter = "H";
                else if (metric.id === "grid_amps_r") colLetter = "I";
                else if (metric.id === "grid_amps_y") colLetter = "J";
                else if (metric.id === "grid_amps_b") colLetter = "K";
                else if (metric.id === "grid_transformer_temp") colLetter = "L";
                else if (metric.id === "grid_power_factor") colLetter = "M";
                else if (metric.id === "grid_frequency") colLetter = "N";
                else if (metric.id === "grid_total_site_load") colLetter = "O";
                else if (metric.id === "grid_energy_meter_1") colLetter = "P";
                else if (metric.id === "grid_energy_meter_2") colLetter = "Q";
                else if (metric.id === "grid_commercial_remarks") colLetter = "S";
              } else if (sheetName === "Temp Record") {
                if (metric.id === "server_ambient_temp") colLetter = "I";
                else if (metric.id === "server_ambient_humidity") colLetter = "J";
                else if (metric.id === "media_ambient_temp") colLetter = "K";
                else if (metric.id === "media_ambient_humidity") colLetter = "L";
                else if (metric.id === "pr1_ambient_temp") colLetter = "M";
                else if (metric.id === "pr1_ambient_humidity") colLetter = "N";
                else if (metric.id === "pr2_ambient_temp") colLetter = "O";
                else if (metric.id === "pr2_ambient_humidity") colLetter = "P";
                else if (metric.id === "it1_ambient_temp") colLetter = "Q";
                else if (metric.id === "it1_ambient_humidity") colLetter = "R";
                else if (metric.id === "it2_ambient_temp") colLetter = "S";
                else if (metric.id === "it2_ambient_humidity") colLetter = "T";
                else if (metric.id === "ambient_avg_temp") colLetter = "U";
              }

              // Inject defaults/constants for non-logged columns
              if (sheetName === "Commercial Power Log") {
                sheet.getCell("L" + targetRow).value = "NA"; // Transformer Temp
                const customRemarks = (log.metrics ? log.metrics.grid_commercial_remarks : undefined) || lastEnteredValues["grid_commercial_remarks"] || "WEATHER ON MAINS/DG";
                sheet.getCell("S" + targetRow).value = customRemarks; // Remarks
                sheet.getCell("R" + targetRow).value = techName; // Technician column
              } else if (sheetName === "Temp Record") {
                sheet.getCell("C" + targetRow).value = "NA";
                sheet.getCell("D" + targetRow).value = "NA";
                sheet.getCell("E" + targetRow).value = "NA";
                sheet.getCell("F" + targetRow).value = "NA";
                if (!log.metrics || !log.metrics.hq_ambient_temp) {
                  sheet.getCell("G" + targetRow).value = "N/A";
                  sheet.getCell("H" + targetRow).value = "NA";
                }
                sheet.getCell("V" + targetRow).value = techName; // Remarks & Sign column
              }

            } else if (sheetName.startsWith("DG-")) {
              // Generator Logs: starts at row 3, 1 row per day
              targetRow = 2 + day;

              if (metric.id.endsWith("_hr_meter_start")) colLetter = "B";
              else if (metric.id.endsWith("_hr_meter_stop")) colLetter = "C";
              else if (metric.id.endsWith("_time_start")) colLetter = "D";
              else if (metric.id.endsWith("_time_stop")) colLetter = "E";
              else if (metric.id.endsWith("_run_hrs")) colLetter = "F";
              else if (metric.id.endsWith("_cumulative_hrs")) colLetter = "G";
              else if (metric.id.endsWith("_auto_status")) colLetter = "H";
              else if (metric.id.endsWith("_kwh_meter")) colLetter = "I";
              else if (metric.id.endsWith("_engine_rpm")) colLetter = "Q";
              else if (metric.id.endsWith("_oil_pressure")) colLetter = "R";
              else if (metric.id.endsWith("_water_temp")) colLetter = "S";
              else if (metric.id.endsWith("_daily_remarks")) colLetter = "U";

              // Write constants for columns J through P (Voltage, Current, Freq)
              sheet.getCell("J" + targetRow).value = 0;
              sheet.getCell("K" + targetRow).value = 0;
              sheet.getCell("L" + targetRow).value = 0;
              sheet.getCell("M" + targetRow).value = 0;
              sheet.getCell("N" + targetRow).value = 0;
              sheet.getCell("O" + targetRow).value = 0;
              sheet.getCell("P" + targetRow).value = 0;

              sheet.getCell("T" + targetRow).value = techName; // Technician column

              // Duplicate run hours to Fuel Record sheet if daily run hours are present
              if (metric.id.endsWith("_run_hrs")) {
                const fuelSheet = commWb.getWorksheet("Fuel Record");
                if (fuelSheet) {
                  const fuelRow = 5 + day;
                  let fuelCol = "";
                  if (asset.id === "dg_1") fuelCol = "F";
                  else if (asset.id === "dg_2") fuelCol = "G";
                  else if (asset.id === "dg_3") fuelCol = "H";
                  else if (asset.id === "dg_4") fuelCol = "I";
                  else if (asset.id === "dg_hq") fuelCol = "J";

                  if (fuelCol) {
                    fuelSheet.getCell(fuelCol + fuelRow).value = cellValue;
                  }
                }
              }

            } else if (sheetName === "Fuel Record") {
              // Fuel Logs: starts at row 6, 1 row per day
              targetRow = 5 + day;

              if (metric.id === "fuel_brought_forward") colLetter = "B";
              else if (metric.id === "fuel_received") colLetter = "C";
              else if (metric.id === "fuel_consumed") colLetter = "D";
              else if (metric.id === "fuel_balance") colLetter = "E";

              sheet.getCell("A" + targetRow).value = date.toLocaleDateString("en-US");
              sheet.getCell("K" + targetRow).value = "NO"; // Leakage sign
              sheet.getCell("L" + targetRow).value = "NO"; // Spillage sign

            } else if (sheetName === "DG Check") {
              // DG Check: starts at row 4, 1 row per day
              targetRow = 3 + day;

              const checkCol = DG_CHECK_COLUMNS[metric.id];
              if (checkCol) {
                colLetter = checkCol;
                sheet.getCell("A" + targetRow).value = date.toLocaleDateString("en-US");
                sheet.getCell("W" + targetRow).value = techName; // Tech Name
              } else {
                return; // Only battery voltage mapped in code
              }

            } else if (sheetName === "PAC") {
              // PAC: 2-hour cycles, 24 rows per time block
              const equipIdx = getPacEquipmentIndex(asset.id);
              if (equipIdx !== -1) {
                targetRow = 5 + (Math.floor(hour / 2) * 24) + equipIdx;

                if (metric.id.endsWith("_return_temp_actual")) colLetter = "E";
                else if (metric.id.endsWith("_return_temp_set")) colLetter = "F";
                else if (metric.id.endsWith("_supply_temp_set")) colLetter = "G";
                else if (metric.id.endsWith("_humidity_actual")) colLetter = "H";
                else if (metric.id.endsWith("_humidity_set")) colLetter = "I";
                else if (metric.id.endsWith("_voltage_ry")) colLetter = "J";
                else if (metric.id.endsWith("_voltage_yb")) colLetter = "K";
                else if (metric.id.endsWith("_voltage_br")) colLetter = "L";
                else if (metric.id.endsWith("_current_r")) colLetter = "M";
                else if (metric.id.endsWith("_current_y")) colLetter = "N";
                else if (metric.id.endsWith("_current_b")) colLetter = "O";
                else if (metric.id.endsWith("_current_n")) colLetter = "P";

                sheet.getCell("A" + targetRow).value = date.toLocaleDateString("en-US");
                sheet.getCell("R" + targetRow).value = techName; // Tech Name
              }

            } else if (sheetName === "Eqpt status") {
              // Eqpt status: columns change daily, rows match asset
              const statusRow = getEqptStatusRow(asset.id);
              if (statusRow !== -1) {
                const statusColIdx = 6 + (day - 1) * 4; // Starts at index 6 (G)

                if (metric.id.endsWith("_daily_status")) {
                  const cellCol = getExcelColumn(statusColIdx);
                  sheet.getCell(cellCol + statusRow).value = cellValue;
                } else if (metric.id.endsWith("_daily_abnormality")) {
                  const cellCol = getExcelColumn(statusColIdx + 2); // Status + 2 cols (I)
                  sheet.getCell(cellCol + statusRow).value = cellValue;
                }

                // Fill date header on Row 3 dynamically if not present
                const dateHeaderCol = getExcelColumn(statusColIdx - 1 + 1);
                sheet.getCell(dateHeaderCol + "3").value = date.toLocaleDateString("en-US");
              }
            }

            // Write the value
            if (targetRow > 0) {
              sheet.getCell(colLetter + targetRow).value = cellValue;
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
