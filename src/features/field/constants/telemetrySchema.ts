export type CheckFrequency = 'hourly' | '2-hour' | '4-hour' | 'daily';

export interface ExcelTarget {
  sheetName: string;
  excelColumnIndex: number;
}

export interface AssetMetric {
  id: string;
  label: string;
  type: 'number' | 'text' | 'boolean';
  frequency: CheckFrequency;
  isConstant?: boolean;
  defaultValue?: string | number;
  carryForward?: boolean;
  destinations: ExcelTarget[];
  unit?: string;
}

export interface Asset {
  id: string;
  name: string;
  metrics: AssetMetric[];
}

export interface AssetCategory {
  categoryName: string;
  assets: Asset[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ASSET DICTIONARY
// Covers Groups 1–8 of the official NTC DCIMe Data Extraction List
// ─────────────────────────────────────────────────────────────────────────────
export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 1 — DAILY SHEETS (Hourly Baseline)
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Power Infrastructure",
    assets: [

      // ── ZESCO GRID ────────────────────────────────────────────────────────
      {
        id: "main_grid",
        name: "ZESCO Grid",
        metrics: [
          // Phase Voltages [HOURLY]
          { id: "grid_v_r", label: "Voltage (R)", type: "number", frequency: "hourly", unit: "V", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 1 }] },
          { id: "grid_v_y", label: "Voltage (Y)", type: "number", frequency: "hourly", unit: "V", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 2 }] },
          { id: "grid_v_b", label: "Voltage (B)", type: "number", frequency: "hourly", unit: "V", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 3 }] },
          // Phase Amps [HOURLY]
          { id: "grid_a_r", label: "Amps (R)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 4 }] },
          { id: "grid_a_y", label: "Amps (Y)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 5 }] },
          { id: "grid_a_b", label: "Amps (B)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 6 }] },
          // Constants [HOURLY]
          { id: "grid_status", label: "Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "On", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 7 }] },
          { id: "grid_off_time", label: "Off Time", type: "text", frequency: "hourly", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 8 }] },
          { id: "grid_restored_time", label: "Restored Time", type: "text", frequency: "hourly", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 9 }] },
          { id: "grid_duration", label: "Duration", type: "text", frequency: "hourly", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 10 }] },
          { id: "grid_total_kw", label: "Total Site Load (KW)", type: "number", frequency: "hourly", unit: "kW", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 11 }] },
          // Frequency [HOURLY / 4-HOUR dual-target]
          { id: "grid_freq", label: "Frequency", type: "number", frequency: "hourly", unit: "Hz", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 12 }, { sheetName: "Commercial Power Log", excelColumnIndex: 7 }] },
        ]
      },

      // ── DG LOAD (Bus) ─────────────────────────────────────────────────────
      // Voltages & Amps on the DG bus when running — CONSTANT: 0 on standby
      {
        id: "dg_load",
        name: "DG Load",
        metrics: [
          { id: "dgl_v_r", label: "Voltage (R)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 13 }] },
          { id: "dgl_v_y", label: "Voltage (Y)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 14 }] },
          { id: "dgl_v_b", label: "Voltage (B)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 15 }] },
          { id: "dgl_a_r", label: "Amps (R)", type: "number", frequency: "hourly", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 16 }] },
          { id: "dgl_a_y", label: "Amps (Y)", type: "number", frequency: "hourly", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 17 }] },
          { id: "dgl_a_b", label: "Amps (B)", type: "number", frequency: "hourly", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 18 }] },
        ]
      },

      // ── GENERATOR 1 ───────────────────────────────────────────────────────
      {
        id: "dg_1",
        name: "Generator 1",
        metrics: [
          // Daily sheet (Group 1) — hourly summary fields
          { id: "dg1_run_hrs", label: "Run Hrs", type: "number", frequency: "hourly", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 19 }] },
          { id: "dg1_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 26.7, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 20 }] },
          { id: "dg1_status", label: "Charged Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "GREEN", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 21 }] },
          // Group 5 — DG-1 individual log [DAILY]
          { id: "dg1_hour_meter_start", label: "Hour Meter (Start)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-1", excelColumnIndex: 1 }] },
          { id: "dg1_hour_meter_stop", label: "Hour Meter (Stop)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-1", excelColumnIndex: 2 }] },
          { id: "dg1_time_start", label: "Time (Start)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-1", excelColumnIndex: 3 }] },
          { id: "dg1_time_stop", label: "Time (Stop)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-1", excelColumnIndex: 4 }] },
          { id: "dg1_hrs_run_daily", label: "Hrs Run", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-1", excelColumnIndex: 5 }] },
          { id: "dg1_cumulative_run_hrs", label: "Cumulative Run Hrs", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-1", excelColumnIndex: 6 }] },
          { id: "dg1_auto_status", label: "Is DG Auto (Yes/No)", type: "text", frequency: "daily", isConstant: true, defaultValue: "YES", destinations: [{ sheetName: "DG-1", excelColumnIndex: 7 }] },
          { id: "dg1_kwh", label: "KWH Meter Reading", type: "number", frequency: "daily", unit: "kWh", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-1", excelColumnIndex: 8 }] },
          { id: "dg1_v_ry", label: "Voltage (RY)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 9 }] },
          { id: "dg1_v_yb", label: "Voltage (YB)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 10 }] },
          { id: "dg1_v_br", label: "Voltage (BR)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 11 }] },
          { id: "dg1_load_a_r", label: "Load Current (R)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 12 }] },
          { id: "dg1_load_a_y", label: "Load Current (Y)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 13 }] },
          { id: "dg1_load_a_b", label: "Load Current (B)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 14 }] },
          { id: "dg1_load_kw", label: "Load KW", type: "number", frequency: "daily", unit: "kW", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 15 }] },
          { id: "dg1_dg_freq", label: "Frequency", type: "number", frequency: "daily", unit: "Hz", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 16 }] },
          { id: "dg1_rpm", label: "Engine Speed (RPM)", type: "number", frequency: "daily", unit: "rpm", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 17 }] },
          { id: "dg1_oil_pressure", label: "Lub. Oil Pressure", type: "number", frequency: "daily", unit: "bar", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 18 }] },
          { id: "dg1_water_temp", label: "Water Temp", type: "number", frequency: "daily", unit: "°C", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-1", excelColumnIndex: 19 }] },
          { id: "dg1_remarks", label: "Remarks", type: "text", frequency: "daily", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "DG-1", excelColumnIndex: 20 }] },
        ]
      },

      // ── GENERATOR 2 ───────────────────────────────────────────────────────
      {
        id: "dg_2",
        name: "Generator 2",
        metrics: [
          { id: "dg2_run_hrs", label: "Run Hrs", type: "number", frequency: "hourly", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 22 }] },
          { id: "dg2_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 26.7, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 23 }] },
          { id: "dg2_status", label: "Charged Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "GREEN", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 24 }] },
          { id: "dg2_hour_meter_start", label: "Hour Meter (Start)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-2", excelColumnIndex: 1 }] },
          { id: "dg2_hour_meter_stop", label: "Hour Meter (Stop)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-2", excelColumnIndex: 2 }] },
          { id: "dg2_time_start", label: "Time (Start)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-2", excelColumnIndex: 3 }] },
          { id: "dg2_time_stop", label: "Time (Stop)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-2", excelColumnIndex: 4 }] },
          { id: "dg2_hrs_run_daily", label: "Hrs Run", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-2", excelColumnIndex: 5 }] },
          { id: "dg2_cumulative_run_hrs", label: "Cumulative Run Hrs", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-2", excelColumnIndex: 6 }] },
          { id: "dg2_auto_status", label: "Is DG Auto (Yes/No)", type: "text", frequency: "daily", isConstant: true, defaultValue: "YES", destinations: [{ sheetName: "DG-2", excelColumnIndex: 7 }] },
          { id: "dg2_kwh", label: "KWH Meter Reading", type: "number", frequency: "daily", unit: "kWh", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-2", excelColumnIndex: 8 }] },
          { id: "dg2_v_ry", label: "Voltage (RY)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 9 }] },
          { id: "dg2_v_yb", label: "Voltage (YB)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 10 }] },
          { id: "dg2_v_br", label: "Voltage (BR)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 11 }] },
          { id: "dg2_load_a_r", label: "Load Current (R)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 12 }] },
          { id: "dg2_load_a_y", label: "Load Current (Y)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 13 }] },
          { id: "dg2_load_a_b", label: "Load Current (B)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 14 }] },
          { id: "dg2_load_kw", label: "Load KW", type: "number", frequency: "daily", unit: "kW", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 15 }] },
          { id: "dg2_dg_freq", label: "Frequency", type: "number", frequency: "daily", unit: "Hz", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 16 }] },
          { id: "dg2_rpm", label: "Engine Speed (RPM)", type: "number", frequency: "daily", unit: "rpm", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 17 }] },
          { id: "dg2_oil_pressure", label: "Lub. Oil Pressure", type: "number", frequency: "daily", unit: "bar", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 18 }] },
          { id: "dg2_water_temp", label: "Water Temp", type: "number", frequency: "daily", unit: "°C", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-2", excelColumnIndex: 19 }] },
          { id: "dg2_remarks", label: "Remarks", type: "text", frequency: "daily", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "DG-2", excelColumnIndex: 20 }] },
        ]
      },

      // ── GENERATOR 3 ───────────────────────────────────────────────────────
      {
        id: "dg_3",
        name: "Generator 3",
        metrics: [
          { id: "dg3_run_hrs", label: "Run Hrs", type: "number", frequency: "hourly", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 25 }] },
          { id: "dg3_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 26.7, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 26 }] },
          { id: "dg3_status", label: "Charged Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "GREEN", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 27 }] },
          { id: "dg3_hour_meter_start", label: "Hour Meter (Start)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-3", excelColumnIndex: 1 }] },
          { id: "dg3_hour_meter_stop", label: "Hour Meter (Stop)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-3", excelColumnIndex: 2 }] },
          { id: "dg3_time_start", label: "Time (Start)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-3", excelColumnIndex: 3 }] },
          { id: "dg3_time_stop", label: "Time (Stop)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-3", excelColumnIndex: 4 }] },
          { id: "dg3_hrs_run_daily", label: "Hrs Run", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-3", excelColumnIndex: 5 }] },
          { id: "dg3_cumulative_run_hrs", label: "Cumulative Run Hrs", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-3", excelColumnIndex: 6 }] },
          { id: "dg3_auto_status", label: "Is DG Auto (Yes/No)", type: "text", frequency: "daily", isConstant: true, defaultValue: "YES", destinations: [{ sheetName: "DG-3", excelColumnIndex: 7 }] },
          { id: "dg3_kwh", label: "KWH Meter Reading", type: "number", frequency: "daily", unit: "kWh", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-3", excelColumnIndex: 8 }] },
          { id: "dg3_v_ry", label: "Voltage (RY)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 9 }] },
          { id: "dg3_v_yb", label: "Voltage (YB)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 10 }] },
          { id: "dg3_v_br", label: "Voltage (BR)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 11 }] },
          { id: "dg3_load_a_r", label: "Load Current (R)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 12 }] },
          { id: "dg3_load_a_y", label: "Load Current (Y)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 13 }] },
          { id: "dg3_load_a_b", label: "Load Current (B)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 14 }] },
          { id: "dg3_load_kw", label: "Load KW", type: "number", frequency: "daily", unit: "kW", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 15 }] },
          { id: "dg3_dg_freq", label: "Frequency", type: "number", frequency: "daily", unit: "Hz", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 16 }] },
          { id: "dg3_rpm", label: "Engine Speed (RPM)", type: "number", frequency: "daily", unit: "rpm", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 17 }] },
          { id: "dg3_oil_pressure", label: "Lub. Oil Pressure", type: "number", frequency: "daily", unit: "bar", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 18 }] },
          { id: "dg3_water_temp", label: "Water Temp", type: "number", frequency: "daily", unit: "°C", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-3", excelColumnIndex: 19 }] },
          { id: "dg3_remarks", label: "Remarks", type: "text", frequency: "daily", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "DG-3", excelColumnIndex: 20 }] },
        ]
      },

      // ── GENERATOR 4 ───────────────────────────────────────────────────────
      {
        id: "dg_4",
        name: "Generator 4",
        metrics: [
          { id: "dg4_run_hrs", label: "Run Hrs", type: "number", frequency: "hourly", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 28 }] },
          { id: "dg4_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 27.7, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 29 }] },
          { id: "dg4_status", label: "Charged Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "GREEN", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 30 }] },
          { id: "dg4_hour_meter_start", label: "Hour Meter (Start)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-4", excelColumnIndex: 1 }] },
          { id: "dg4_hour_meter_stop", label: "Hour Meter (Stop)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-4", excelColumnIndex: 2 }] },
          { id: "dg4_time_start", label: "Time (Start)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-4", excelColumnIndex: 3 }] },
          { id: "dg4_time_stop", label: "Time (Stop)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-4", excelColumnIndex: 4 }] },
          { id: "dg4_hrs_run_daily", label: "Hrs Run", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-4", excelColumnIndex: 5 }] },
          { id: "dg4_cumulative_run_hrs", label: "Cumulative Run Hrs", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-4", excelColumnIndex: 6 }] },
          { id: "dg4_auto_status", label: "Is DG Auto (Yes/No)", type: "text", frequency: "daily", isConstant: true, defaultValue: "YES", destinations: [{ sheetName: "DG-4", excelColumnIndex: 7 }] },
          { id: "dg4_kwh", label: "KWH Meter Reading", type: "number", frequency: "daily", unit: "kWh", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-4", excelColumnIndex: 8 }] },
          { id: "dg4_v_ry", label: "Voltage (RY)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 9 }] },
          { id: "dg4_v_yb", label: "Voltage (YB)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 10 }] },
          { id: "dg4_v_br", label: "Voltage (BR)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 11 }] },
          { id: "dg4_load_a_r", label: "Load Current (R)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 12 }] },
          { id: "dg4_load_a_y", label: "Load Current (Y)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 13 }] },
          { id: "dg4_load_a_b", label: "Load Current (B)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 14 }] },
          { id: "dg4_load_kw", label: "Load KW", type: "number", frequency: "daily", unit: "kW", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 15 }] },
          { id: "dg4_dg_freq", label: "Frequency", type: "number", frequency: "daily", unit: "Hz", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 16 }] },
          { id: "dg4_rpm", label: "Engine Speed (RPM)", type: "number", frequency: "daily", unit: "rpm", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 17 }] },
          { id: "dg4_oil_pressure", label: "Lub. Oil Pressure", type: "number", frequency: "daily", unit: "bar", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 18 }] },
          { id: "dg4_water_temp", label: "Water Temp", type: "number", frequency: "daily", unit: "°C", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-4", excelColumnIndex: 19 }] },
          { id: "dg4_remarks", label: "Remarks", type: "text", frequency: "daily", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "DG-4", excelColumnIndex: 20 }] },
        ]
      },

      // ── GENERATOR HQ ──────────────────────────────────────────────────────
      {
        id: "dg_hq",
        name: "Generator HQ",
        metrics: [
          { id: "dghq_run_hrs", label: "Run Hrs", type: "number", frequency: "hourly", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 31 }] },
          { id: "dghq_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 26.7, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 32 }] },
          { id: "dghq_status", label: "Charged Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "GREEN", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 33 }] },
          { id: "dghq_hour_meter_start", label: "Hour Meter (Start)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 1 }] },
          { id: "dghq_hour_meter_stop", label: "Hour Meter (Stop)", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 2 }] },
          { id: "dghq_time_start", label: "Time (Start)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 3 }] },
          { id: "dghq_time_stop", label: "Time (Stop)", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 4 }] },
          { id: "dghq_hrs_run_daily", label: "Hrs Run", type: "text", frequency: "daily", isConstant: true, defaultValue: "0:00", destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 5 }] },
          { id: "dghq_cumulative_run_hrs", label: "Cumulative Run Hrs", type: "number", frequency: "daily", unit: "hrs", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 6 }] },
          { id: "dghq_auto_status", label: "Is DG Auto (Yes/No)", type: "text", frequency: "daily", isConstant: true, defaultValue: "YES", destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 7 }] },
          { id: "dghq_kwh", label: "KWH Meter Reading", type: "number", frequency: "daily", unit: "kWh", isConstant: true, carryForward: true, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 8 }] },
          { id: "dghq_v_ry", label: "Voltage (RY)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 9 }] },
          { id: "dghq_v_yb", label: "Voltage (YB)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 10 }] },
          { id: "dghq_v_br", label: "Voltage (BR)", type: "number", frequency: "daily", unit: "V", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 11 }] },
          { id: "dghq_load_a_r", label: "Load Current (R)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 12 }] },
          { id: "dghq_load_a_y", label: "Load Current (Y)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 13 }] },
          { id: "dghq_load_a_b", label: "Load Current (B)", type: "number", frequency: "daily", unit: "A", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 14 }] },
          { id: "dghq_load_kw", label: "Load KW", type: "number", frequency: "daily", unit: "kW", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 15 }] },
          { id: "dghq_dg_freq", label: "Frequency", type: "number", frequency: "daily", unit: "Hz", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 16 }] },
          { id: "dghq_rpm", label: "Engine Speed (RPM)", type: "number", frequency: "daily", unit: "rpm", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 17 }] },
          { id: "dghq_oil_pressure", label: "Lub. Oil Pressure", type: "number", frequency: "daily", unit: "bar", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 18 }] },
          { id: "dghq_water_temp", label: "Water Temp", type: "number", frequency: "daily", unit: "°C", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 19 }] },
          { id: "dghq_remarks", label: "Remarks", type: "text", frequency: "daily", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "DG-HQ", excelColumnIndex: 20 }] },
        ]
      },

      // ── UPS UNIT 1 ───────────────────────────────────────────────────────
      {
        id: "ups_1",
        name: "UPS Unit 1",
        metrics: [
          { id: "ups1_load_kw", label: "Output Load KW", type: "number", frequency: "hourly", unit: "kW", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 34 }] },
          { id: "ups1_used_capacity", label: "Used Capacity", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 35 }] },
          { id: "ups1_batt_charge", label: "Battery Charge %", type: "number", frequency: "hourly", unit: "%", isConstant: true, defaultValue: 100, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 36 }] },
          { id: "ups1_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 37 }] },
          { id: "ups1_load_a_a", label: "Load Amps (A)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 38 }] },
          { id: "ups1_load_a_b", label: "Load Amps (B)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 39 }] },
          { id: "ups1_load_a_c", label: "Load Amps (C)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 40 }] },
          { id: "ups1_load_pct_a", label: "Load Phase % (A)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 41 }] },
          { id: "ups1_load_pct_b", label: "Load Phase % (B)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 42 }] },
          { id: "ups1_load_pct_c", label: "Load Phase % (C)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 43 }] },
          { id: "ups1_out_v_a", label: "Output Voltage (A)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 230, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 44 }] },
          { id: "ups1_out_v_b", label: "Output Voltage (B)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 230, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 45 }] },
          { id: "ups1_out_v_c", label: "Output Voltage (C)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 230, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 46 }] },
        ]
      },

      // ── UPS UNIT 2 ───────────────────────────────────────────────────────
      {
        id: "ups_2",
        name: "UPS Unit 2",
        metrics: [
          { id: "ups2_load_kw", label: "Output Load KW", type: "number", frequency: "hourly", unit: "kW", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 47 }] },
          { id: "ups2_used_capacity", label: "Used Capacity", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 48 }] },
          { id: "ups2_batt_charge", label: "Battery Charge %", type: "number", frequency: "hourly", unit: "%", isConstant: true, defaultValue: 100, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 49 }] },
          { id: "ups2_batt_v", label: "Battery Voltage", type: "number", frequency: "hourly", unit: "V", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 50 }] },
          { id: "ups2_load_a_a", label: "Load Amps (A)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 51 }] },
          { id: "ups2_load_a_b", label: "Load Amps (B)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 52 }] },
          { id: "ups2_load_a_c", label: "Load Amps (C)", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 53 }] },
          { id: "ups2_load_pct_a", label: "Load Phase % (A)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 54 }] },
          { id: "ups2_load_pct_b", label: "Load Phase % (B)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 55 }] },
          { id: "ups2_load_pct_c", label: "Load Phase % (C)", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 56 }] },
          { id: "ups2_out_v_a", label: "Output Voltage (A)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 231, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 57 }] },
          { id: "ups2_out_v_b", label: "Output Voltage (B)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 231, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 58 }] },
          { id: "ups2_out_v_c", label: "Output Voltage (C)", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 231, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 59 }] },
        ]
      },

      // ── RECTIFIER 1 ──────────────────────────────────────────────────────
      {
        id: "rectifier_1",
        name: "Rectifier 1",
        metrics: [
          { id: "rect1_dc_v", label: "DC Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 54.2, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 60 }] },
          { id: "rect1_amps", label: "Amps", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 61 }] },
          { id: "rect1_batt_status", label: "Battery Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 62 }] },
          { id: "rect1_used_pct", label: "Used Percentage", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 63 }] },
        ]
      },

      // ── RECTIFIER 2 ──────────────────────────────────────────────────────
      {
        id: "rectifier_2",
        name: "Rectifier 2",
        metrics: [
          { id: "rect2_dc_v", label: "DC Voltage", type: "number", frequency: "hourly", unit: "V", isConstant: true, defaultValue: 54.2, destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 64 }] },
          { id: "rect2_amps", label: "Amps", type: "number", frequency: "hourly", unit: "A", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 65 }] },
          { id: "rect2_batt_status", label: "Battery Status", type: "text", frequency: "hourly", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 66 }] },
          { id: "rect2_used_pct", label: "Used Percentage", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 67 }] },
        ]
      },
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 3 — COMMERCIAL POWER LOG [4-HOUR]
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Commercial Power",
    assets: [
      {
        id: "comm_power",
        name: "ZESCO Commercial Log",
        metrics: [
          // Line Voltages
          { id: "cp_line_v_r", label: "Line Voltage (R)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 1 }] },
          { id: "cp_line_v_y", label: "Line Voltage (Y)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 2 }] },
          { id: "cp_line_v_b", label: "Line Voltage (B)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 3 }] },
          // Phase Voltages
          { id: "cp_phase_v_rn", label: "Phase Voltage (RN)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 4 }] },
          { id: "cp_phase_v_yn", label: "Phase Voltage (YN)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 5 }] },
          { id: "cp_phase_v_bn", label: "Phase Voltage (BN)", type: "number", frequency: "4-hour", unit: "V", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 6 }] },
          // Load Currents
          { id: "cp_load_a_r", label: "Load Current (R)", type: "number", frequency: "4-hour", unit: "A", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 8 }] },
          { id: "cp_load_a_y", label: "Load Current (Y)", type: "number", frequency: "4-hour", unit: "A", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 9 }] },
          { id: "cp_load_a_b", label: "Load Current (B)", type: "number", frequency: "4-hour", unit: "A", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 10 }] },
          // Other
          { id: "cp_tf_temp", label: "Transformer Temp", type: "text", frequency: "4-hour", unit: "°C", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 11 }] },
          { id: "cp_pf", label: "Power Factor", type: "number", frequency: "4-hour", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 12 }] },
          { id: "cp_total_kw", label: "Total Kilowatt", type: "number", frequency: "4-hour", unit: "kW", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 13 }] },
          // Energy Meters
          { id: "cp_energy_sw1", label: "Energy Meter (Switch 1)", type: "number", frequency: "4-hour", unit: "kWh", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 14 }] },
          { id: "cp_energy_sw2", label: "Energy Meter (Switch 2)", type: "number", frequency: "4-hour", unit: "kWh", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 15 }] },
          { id: "cp_remarks", label: "Remarks", type: "text", frequency: "4-hour", isConstant: true, defaultValue: "WEATHER ON MAINS", destinations: [{ sheetName: "Commercial Power Log", excelColumnIndex: 16 }] },
        ]
      }
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 2 — PAC LOG BOOK [2-HOUR]
  // Each named unit in each room gets its own asset for full traceability
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Thermal Management",
    assets: [
      // Helper function pattern: each PAC unit shares same metric shape
      // Server Room PACs
      ...([
        { id: "pac_sr_em1", name: "Server Room – Emerson Aircon 1" },
        { id: "pac_sr_em2", name: "Server Room – Emerson Aircon 2" },
        { id: "pac_sr_em3", name: "Server Room – Emerson Aircon 3" },
        { id: "pac_sr_em4", name: "Server Room – Emerson Aircon 4" },
        { id: "pac_sr_em5", name: "Server Room – Emerson Aircon 5" },
        { id: "pac_sr_em6", name: "Server Room – Emerson Aircon 6" },
        { id: "pac_sr_em7", name: "Server Room – Emerson Aircon 7" },
        { id: "pac_sr_vt3", name: "Server Room – Vertiv 3" },
        { id: "pac_sr_vt4", name: "Server Room – Vertiv 4" },
        { id: "pac_sr_vt5", name: "Server Room – Vertiv 5" },
        { id: "pac_sr_vt1", name: "Server Room – Vertiv 1" },
        { id: "pac_sr_vt2", name: "Server Room – Vertiv 2" },
        // Data Room
        { id: "pac_dr_em1", name: "Data Room – Emerson Aircon 1" },
        { id: "pac_dr_em2", name: "Data Room – Emerson Aircon 2" },
        { id: "pac_dr_vt6", name: "Data Room – Vertiv 6" },
        // Power Room 1
        { id: "pac_pr1_em1", name: "Power Room 1 – Emerson Aircon 1" },
        { id: "pac_pr1_em2", name: "Power Room 1 – Emerson Aircon 2" },
        { id: "pac_pr1_em3", name: "Power Room 1 – Emerson Aircon 3" },
        // Power Room 2
        { id: "pac_pr2_em1", name: "Power Room 2 – Emerson Aircon 1" },
        { id: "pac_pr2_em2", name: "Power Room 2 – Emerson Aircon 2" },
        // IT Room 1
        { id: "pac_itr1_em1", name: "IT Room 1 – Emerson Aircon 1" },
        { id: "pac_itr1_em2", name: "IT Room 1 – Emerson Aircon 2" },
        // IT Room 2
        { id: "pac_itr2_em1", name: "IT Room 2 – Emerson Aircon 1" },
        { id: "pac_itr2_em2", name: "IT Room 2 – Emerson Aircon 2" },
      ] as { id: string; name: string }[]).map((unit, idx) => ({
        id: unit.id,
        name: unit.name,
        metrics: [
          { id: `${unit.id}_ret_temp_act`, label: "Return Temp (Actual)", type: "number" as const, frequency: "2-hour" as const, unit: "°C", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 1 }] },
          { id: `${unit.id}_ret_temp_set`, label: "Return Temp (Set)", type: "number" as const, frequency: "2-hour" as const, unit: "°C", isConstant: true, carryForward: true, destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 2 }] },
          { id: `${unit.id}_sup_temp_set`, label: "Supply Temp (Set)", type: "number" as const, frequency: "2-hour" as const, unit: "°C", isConstant: true, carryForward: true, destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 3 }] },
          { id: `${unit.id}_hum_act`, label: "Humidity (Actual)", type: "number" as const, frequency: "2-hour" as const, unit: "%", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 4 }] },
          { id: `${unit.id}_hum_set`, label: "Humidity (Set)", type: "number" as const, frequency: "2-hour" as const, unit: "%", isConstant: true, carryForward: true, destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 5 }] },
          { id: `${unit.id}_v_ry`, label: "Voltage (R-Y)", type: "text" as const, frequency: "2-hour" as const, unit: "V", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 6 }] },
          { id: `${unit.id}_v_yb`, label: "Voltage (Y-B)", type: "text" as const, frequency: "2-hour" as const, unit: "V", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 7 }] },
          { id: `${unit.id}_v_br`, label: "Voltage (B-R)", type: "text" as const, frequency: "2-hour" as const, unit: "V", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 8 }] },
          { id: `${unit.id}_lc_r`, label: "Load Current (R)", type: "text" as const, frequency: "2-hour" as const, unit: "A", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 9 }] },
          { id: `${unit.id}_lc_y`, label: "Load Current (Y)", type: "text" as const, frequency: "2-hour" as const, unit: "A", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 10 }] },
          { id: `${unit.id}_lc_b`, label: "Load Current (B)", type: "text" as const, frequency: "2-hour" as const, unit: "A", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 11 }] },
          { id: `${unit.id}_lc_n`, label: "Load Current (N)", type: "text" as const, frequency: "2-hour" as const, unit: "A", isConstant: true, carryForward: true, destinations: [{ sheetName: "PAC Log", excelColumnIndex: idx * 12 + 12 }] },
        ]
      }))
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 4 — TEMPERATURE RECORD LOG [4-HOUR]
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Environment",
    assets: [
      {
        id: "env_zesco_panel",
        name: "ZESCO Panel Room",
        metrics: [
          { id: "env_zp_temp", label: "Temperature", type: "text", frequency: "4-hour", unit: "°C", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 1 }] },
          { id: "env_zp_hum", label: "Humidity", type: "text", frequency: "4-hour", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 2 }] },
        ]
      },
      {
        id: "env_rmu_ht",
        name: "RMU / HT Room",
        metrics: [
          { id: "env_rmu_temp", label: "Temperature", type: "text", frequency: "4-hour", unit: "°C", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 3 }] },
          { id: "env_rmu_hum", label: "Humidity", type: "text", frequency: "4-hour", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 4 }] },
        ]
      },
      {
        id: "env_rect_hq",
        name: "Rectifier / HQ Power Room",
        metrics: [
          { id: "env_rhq_temp", label: "Temperature", type: "number", frequency: "4-hour", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 5 }] },
          { id: "env_rhq_hum", label: "Humidity", type: "text", frequency: "4-hour", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 6 }] },
        ]
      },
      {
        id: "env_server_room",
        name: "Server Room",
        metrics: [
          { id: "env_sr_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 7 }, { sheetName: "Daily Checks", excelColumnIndex: 68 }] },
          { id: "env_sr_hum", label: "Humidity", type: "number", frequency: "hourly", unit: "%", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 8 }, { sheetName: "Daily Checks", excelColumnIndex: 69 }] },
        ]
      },
      {
        id: "env_media_room",
        name: "IBM / Media Room",
        metrics: [
          { id: "env_mr_temp", label: "Temperature", type: "text", frequency: "hourly", unit: "°C", isConstant: true, defaultValue: "OFF", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 9 }, { sheetName: "Daily Checks", excelColumnIndex: 70 }] },
          { id: "env_mr_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 10 }, { sheetName: "Daily Checks", excelColumnIndex: 71 }] },
        ]
      },
      {
        id: "env_power_room_1",
        name: "Power Room 1",
        metrics: [
          { id: "env_pr1_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 11 }, { sheetName: "Daily Checks", excelColumnIndex: 72 }] },
          { id: "env_pr1_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 12 }, { sheetName: "Daily Checks", excelColumnIndex: 73 }] },
        ]
      },
      {
        id: "env_power_room_2",
        name: "Power Room 2",
        metrics: [
          { id: "env_pr2_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 13 }, { sheetName: "Daily Checks", excelColumnIndex: 74 }] },
          { id: "env_pr2_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 14 }, { sheetName: "Daily Checks", excelColumnIndex: 75 }] },
        ]
      },
      {
        id: "env_battery_room",
        name: "Battery Room (Power Room 2)",
        metrics: [
          { id: "env_br_temp", label: "Temperature", type: "number", frequency: "4-hour", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 15 }] },
          { id: "env_br_hum", label: "Humidity", type: "text", frequency: "4-hour", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 16 }] },
        ]
      },
      {
        id: "env_it_room_1",
        name: "IT Room 1",
        metrics: [
          { id: "env_it1_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 17 }, { sheetName: "Daily Checks", excelColumnIndex: 76 }] },
          { id: "env_it1_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 18 }, { sheetName: "Daily Checks", excelColumnIndex: 77 }] },
        ]
      },
      {
        id: "env_it_room_2",
        name: "IT Room 2",
        metrics: [
          { id: "env_it2_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 19 }, { sheetName: "Daily Checks", excelColumnIndex: 78 }] },
          { id: "env_it2_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 20 }, { sheetName: "Daily Checks", excelColumnIndex: 79 }] },
        ]
      },
      {
        id: "env_general_room_1",
        name: "General Room 1",
        metrics: [
          { id: "env_gr1_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 80 }] },
          { id: "env_gr1_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 81 }] },
        ]
      },
      {
        id: "env_general_room_2",
        name: "General Room 2",
        metrics: [
          { id: "env_gr2_temp", label: "Temperature", type: "number", frequency: "hourly", unit: "°C", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 82 }] },
          { id: "env_gr2_hum", label: "Humidity", type: "text", frequency: "hourly", unit: "%", isConstant: true, defaultValue: "NA", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 83 }] },
        ]
      },
      // Ambient avg temp [4-HOUR calculated field]
      {
        id: "env_ambient",
        name: "Ambient Temperature",
        metrics: [
          { id: "env_ambient_avg", label: "Ambient Avg Temp", type: "number", frequency: "4-hour", unit: "°C", destinations: [{ sheetName: "Temp Record", excelColumnIndex: 21 }] },
        ]
      },
      // Group 1 extras — Work Station, FM 200, Load On, Shift
      {
        id: "env_ops",
        name: "Operational Status",
        metrics: [
          { id: "env_work_station", label: "Work Station", type: "text", frequency: "hourly", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 84 }] },
          { id: "env_fm200", label: "FM 200 Panel", type: "text", frequency: "hourly", isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 85 }] },
          { id: "env_load_on", label: "Load On", type: "text", frequency: "hourly", isConstant: true, defaultValue: "MAINS", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 86 }] },
          { id: "env_shift", label: "Shift (Personnel)", type: "text", frequency: "hourly", destinations: [{ sheetName: "Daily Checks", excelColumnIndex: 87 }] },
        ]
      }
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 7 — EQUIPMENT STATUS LOG [DAILY @ 09:00]
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Equipment Status",
    assets: [
      ...([
        // Inverters
        { id: "eqst_ups1", name: "Inverter – UPS 1", room: "Inverter" },
        { id: "eqst_ups2", name: "Inverter – UPS 2", room: "Inverter" },
        // Rectifiers
        { id: "eqst_rect1", name: "Rectifier 1", room: "Rectifier" },
        { id: "eqst_rect2", name: "Rectifier 2", room: "Rectifier" },
        // Server Room
        { id: "eqst_sr_em1", name: "Server Room – Emerson Aircon 1", room: "Server Room" },
        { id: "eqst_sr_em2", name: "Server Room – Emerson Aircon 2", room: "Server Room" },
        { id: "eqst_sr_em3", name: "Server Room – Emerson Aircon 3", room: "Server Room" },
        { id: "eqst_sr_em4", name: "Server Room – Emerson Aircon 4", room: "Server Room" },
        { id: "eqst_sr_em5", name: "Server Room – Emerson Aircon 5", room: "Server Room" },
        { id: "eqst_sr_em6", name: "Server Room – Emerson Aircon 6", room: "Server Room" },
        { id: "eqst_sr_em7", name: "Server Room – Emerson Aircon 7", room: "Server Room" },
        { id: "eqst_sr_vt1", name: "Server Room – Vertiv 1", room: "Server Room" },
        { id: "eqst_sr_vt2", name: "Server Room – Vertiv 2", room: "Server Room" },
        { id: "eqst_sr_vt3", name: "Server Room – Vertiv 3", room: "Server Room" },
        { id: "eqst_sr_vt4", name: "Server Room – Vertiv 4", room: "Server Room" },
        { id: "eqst_sr_vt5", name: "Server Room – Vertiv 5", room: "Server Room" },
        { id: "eqst_sr_dragor", name: "Server Room – Dragor", room: "Server Room" },
        // Data Room
        { id: "eqst_dr_vt6", name: "Data Room – Vertiv 6", room: "Data Room" },
        // Power Room 1
        { id: "eqst_pr1_em1", name: "Power Room 1 – Emerson Aircon 1", room: "Power Room 1" },
        { id: "eqst_pr1_em2", name: "Power Room 1 – Emerson Aircon 2", room: "Power Room 1" },
        { id: "eqst_pr1_em3", name: "Power Room 1 – Emerson Aircon 3", room: "Power Room 1" },
        // Power Room 2
        { id: "eqst_pr2_em1", name: "Power Room 2 – Emerson Aircon 1", room: "Power Room 2" },
        { id: "eqst_pr2_em2", name: "Power Room 2 – Emerson Aircon 2", room: "Power Room 2" },
        // IT Room 1
        { id: "eqst_it1_em1", name: "IT Room 1 – Emerson Aircon 1", room: "IT Room 1" },
        { id: "eqst_it1_em2", name: "IT Room 1 – Emerson Aircon 2", room: "IT Room 1" },
        // IT Room 2
        { id: "eqst_it2_em1", name: "IT Room 2 – Emerson Aircon 1", room: "IT Room 2" },
        { id: "eqst_it2_em2", name: "IT Room 2 – Emerson Aircon 2", room: "IT Room 2" },
      ] as { id: string; name: string; room: string }[]).map((unit, idx) => ({
        id: unit.id,
        name: unit.name,
        metrics: [
          { id: `${unit.id}_status`, label: "Status (OK/Not OK)", type: "text" as const, frequency: "daily" as const, isConstant: true, defaultValue: "OK", destinations: [{ sheetName: "Eqpt Status", excelColumnIndex: idx * 3 + 1 }] },
          { id: `${unit.id}_load_temp`, label: "Output Load / Temp", type: "text" as const, frequency: "daily" as const, destinations: [{ sheetName: "Eqpt Status", excelColumnIndex: idx * 3 + 2 }] },
          { id: `${unit.id}_abnormality`, label: "Abnormality Observed", type: "text" as const, frequency: "daily" as const, isConstant: true, defaultValue: "NON", destinations: [{ sheetName: "Eqpt Status", excelColumnIndex: idx * 3 + 3 }] },
        ]
      }))
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP 8 — FUEL RECORD LOG [DAILY]
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: "Fuel System",
    assets: [
      {
        id: "fuel_main",
        name: "Main Fuel Stock",
        metrics: [
          { id: "fuel_bf", label: "Fuel Brought Forward (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, carryForward: true, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 1 }] },
          { id: "fuel_received", label: "Fuel Received (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 2 }] },
          { id: "fuel_consumed", label: "Fuel Consumed (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 3 }] },
          { id: "fuel_balance", label: "Fuel Balance (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, carryForward: true, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 4 }] },
          { id: "fuel_leakage", label: "Sign of Fuel Leakage", type: "text", frequency: "daily", isConstant: true, defaultValue: "No", destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 5 }] },
          { id: "fuel_spillage", label: "Sign of Fuel Spillage", type: "text", frequency: "daily", isConstant: true, defaultValue: "No", destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 6 }] },
        ]
      },
      {
        id: "fuel_dg",
        name: "DG Fuel Readings",
        metrics: [
          { id: "fuel_dg_bf", label: "DG Fuel B/F (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, carryForward: true, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 7 }] },
          { id: "fuel_dg_received", label: "DG Fuel Received (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 8 }] },
          { id: "fuel_dg_consumed", label: "DG Fuel Consumed (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, defaultValue: 0, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 9 }] },
          { id: "fuel_dg_balance", label: "DG Fuel Balance (Ltr)", type: "number", frequency: "daily", unit: "L", isConstant: true, carryForward: true, destinations: [{ sheetName: "Fuel Log", excelColumnIndex: 10 }] },
        ]
      }
    ]
  }
];

// ── BACKWARDS COMPATIBILITY LAYER ─────────────────────────────────────────────
export interface TelemetryField {
  id: string;
  label: string;
  category: string;
  subgroup?: string;
  unit?: string;
  type: "number" | "text";
  excelColumnIndex: number;
  isConstant?: boolean;
  defaultValue?: string | number;
  carryForward?: boolean;
  frequency: CheckFrequency;
}

export const HOURLY_TELEMETRY_SCHEMA: TelemetryField[] = (() => {
  const fields: TelemetryField[] = [];
  MASTER_ASSET_DICTIONARY.forEach((cat) => {
    cat.assets.forEach((asset) => {
      asset.metrics.forEach((metric) => {
        const primaryDest = metric.destinations[0];
        fields.push({
          id: metric.id,
          label: `${asset.name} — ${metric.label}`,
          category: cat.categoryName,
          subgroup: asset.name,
          unit: metric.unit,
          type: metric.type === "boolean" ? "text" : metric.type,
          excelColumnIndex: primaryDest ? primaryDest.excelColumnIndex : -1,
          isConstant: metric.isConstant,
          defaultValue: metric.defaultValue,
          carryForward: metric.carryForward,
          frequency: metric.frequency
        });
      });
    });
  });
  return fields;
})();
