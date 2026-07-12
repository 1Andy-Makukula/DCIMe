// ─────────────────────────────────────────────────────────────────────────────
// DCIMe Engine — Relational Asset Dictionary
// Single source of truth for the mobile app and Excel export engine.
// ─────────────────────────────────────────────────────────────────────────────

export type CheckFrequency = 'hourly' | '2-hour' | '4-hour' | 'daily';
export type TargetWorkbook = 'daily_canvas' | 'commercial_logbook';

export interface ExcelTarget {
  workbook: TargetWorkbook;
  sheetName: string;
  excelColumnIndex: number; // 0-based column index
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
// Shared metric blueprints — avoids repeating the same fields
// ─────────────────────────────────────────────────────────────────────────────

function buildPacMetrics(prefix: string): AssetMetric[] {
  return [
    { id: `${prefix}_return_temp_actual`, label: 'Return Temp (Actual)', type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 4 }] },
    { id: `${prefix}_return_temp_set`,    label: 'Return Temp (Set)',    type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 22, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 5 }] },
    { id: `${prefix}_supply_temp_set`,    label: 'Supply Temp (Set)',    type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 20, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 6 }] },
    { id: `${prefix}_humidity_actual`,    label: 'Humidity (Actual)',    type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 45, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 7 }] },
    { id: `${prefix}_humidity_set`,       label: 'Humidity (Set)',       type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 45, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 8 }] },
    
    // Voltages
    { id: `${prefix}_voltage_ry`,         label: 'Voltage (R-Y)',        type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 9 }] },
    { id: `${prefix}_voltage_yb`,         label: 'Voltage (Y-B)',        type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 10 }] },
    { id: `${prefix}_voltage_br`,         label: 'Voltage (B-R)',        type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 11 }] },
    
    // Currents
    { id: `${prefix}_current_r`,          label: 'Current (R)',          type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 12 }] },
    { id: `${prefix}_current_y`,          label: 'Current (Y)',          type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 13 }] },
    { id: `${prefix}_current_b`,          label: 'Current (B)',          type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 14 }] },
    { id: `${prefix}_current_n`,          label: 'Current (N)',          type: 'text',   frequency: '2-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 15 }] },

    // Daily Equipment Status Checks
    { id: `${prefix}_daily_status`, label: 'Status (OK/Not OK)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [] },
    { id: `${prefix}_daily_abnormality`, label: 'Abnormality Observed', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NON', destinations: [] },
  ];
}

function buildUpsMetrics(prefix: string, outputVoltageDefault: number, excelStartColumnIndex?: number): AssetMetric[] {
  const getDest = (offset: number): ExcelTarget[] => {
    if (excelStartColumnIndex === undefined) return [];
    return [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: excelStartColumnIndex + offset }];
  };

  return [
    { id: `${prefix}_output_load_kw`,        label: 'Output Load (kW)',      type: 'number', frequency: 'hourly', destinations: getDest(0) },
    { id: `${prefix}_used_capacity`,         label: 'Used Capacity (%)',     type: 'number', frequency: 'hourly', destinations: getDest(1) },
    { id: `${prefix}_battery_charge_percent`,label: 'Battery Charge (%)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 100, destinations: getDest(2) },
    { id: `${prefix}_battery_voltage`,       label: 'Battery Voltage (V)',   type: 'number', frequency: 'hourly', destinations: getDest(3) },
    
    // Load Amps (A, B, C)
    { id: `${prefix}_load_amps_a`,           label: 'Load Amps (A)',         type: 'number', frequency: 'hourly', destinations: getDest(4) },
    { id: `${prefix}_load_amps_b`,           label: 'Load Amps (B)',         type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_load_amps_c`,           label: 'Load Amps (C)',         type: 'number', frequency: 'hourly', destinations: [] },

    // Load Phase % (A, B, C)
    { id: `${prefix}_load_phase_percent_a`,  label: 'Load Phase % (A)',      type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_load_phase_percent_b`,  label: 'Load Phase % (B)',      type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_load_phase_percent_c`,  label: 'Load Phase % (C)',      type: 'number', frequency: 'hourly', destinations: [] },

    // Output Voltages (All Constants)
    { id: `${prefix}_output_voltage_a`,      label: 'Output Voltage (A)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: outputVoltageDefault, destinations: getDest(5) },
    { id: `${prefix}_output_voltage_b`,      label: 'Output Voltage (B)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: outputVoltageDefault, destinations: [] },
    { id: `${prefix}_output_voltage_c`,      label: 'Output Voltage (C)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: outputVoltageDefault, destinations: [] },

    // Daily Equipment Status Checks
    { id: `${prefix}_daily_status`, label: 'Status (OK/Not OK)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [] },
    { id: `${prefix}_daily_abnormality`, label: 'Abnormality Observed', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NON', destinations: [] },
  ];
}

function buildRectifierMetrics(prefix: string, excelStartColumnIndex?: number): AssetMetric[] {
  const getDest = (offset: number): ExcelTarget[] => {
    if (excelStartColumnIndex === undefined) return [];
    return [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: excelStartColumnIndex + offset }];
  };

  return [
    { id: `${prefix}_dc_voltage`,      label: 'DC Voltage (V)',          type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 54.2, destinations: getDest(0) },
    { id: `${prefix}_amps`,            label: 'Amps (A)',                 type: 'number', frequency: 'hourly', destinations: getDest(1) },
    { id: `${prefix}_battery_status`,  label: 'Battery Status',          type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: getDest(2) },
    { id: `${prefix}_used_percentage`, label: 'Used Percentage (%)',     type: 'number', frequency: 'hourly', destinations: getDest(3) },
    
    // Daily Equipment Status Checks
    { id: `${prefix}_daily_status`, label: 'Status (OK/Not OK)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [] },
    { id: `${prefix}_daily_abnormality`, label: 'Abnormality Observed', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NON', destinations: [] },
  ];
}

function buildDgMetrics(prefix: string, dgNumber: number, isHq: boolean = false, defaultVoltage: number = 26.7): AssetMetric[] {
  const dgName = isHq ? 'DG-HQ' : `DG-${dgNumber}`;
  const canvasStartIndex = isHq ? undefined : 19 + (dgNumber - 1) * 3;
  const checkVoltageIndex = isHq ? 16 : 12 + (dgNumber - 1);

  const runHrsDests: ExcelTarget[] = [];
  if (canvasStartIndex !== undefined) runHrsDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex });
  runHrsDests.push({ workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: 5 });

  const battVoltageDests: ExcelTarget[] = [];
  if (canvasStartIndex !== undefined) battVoltageDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 1 });
  battVoltageDests.push({ workbook: 'commercial_logbook', sheetName: 'DG Check', excelColumnIndex: checkVoltageIndex });

  return [
    // Hourly Logs
    { id: `${prefix}_run_hrs`,       label: 'Run Hours',       type: 'number', frequency: 'hourly', carryForward: true, destinations: runHrsDests },
    { id: `${prefix}_batt_voltage`,  label: 'Battery Voltage', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: defaultVoltage, destinations: battVoltageDests },
    { id: `${prefix}_charged_status`,label: 'Charged Status',  type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'GREEN', destinations: [] },
    
    // --- NEW: Daily Engine & Time Logs ---
    { id: `${prefix}_hr_meter_start`, label: 'Hour Meter (Start)', type: 'number', frequency: 'daily', carryForward: true, destinations: [] },
    { id: `${prefix}_hr_meter_stop`,  label: 'Hour Meter (Stop)',  type: 'number', frequency: 'daily', destinations: [] },
    { id: `${prefix}_time_start`,     label: 'Time (Start)',       type: 'text',   frequency: 'daily', isConstant: true, defaultValue: '0:00', destinations: [] },
    { id: `${prefix}_time_stop`,      label: 'Time (Stop)',        type: 'text',   frequency: 'daily', isConstant: true, defaultValue: '0:00', destinations: [] },
    { id: `${prefix}_cumulative_hrs`, label: 'Cumulative Run Hrs', type: 'number', frequency: 'daily', carryForward: true, destinations: [] },
    { id: `${prefix}_auto_status`,    label: 'Auto Functioning?',  type: 'text',   frequency: 'daily', isConstant: true, defaultValue: 'YES', destinations: [] },
    { id: `${prefix}_kwh_meter`,      label: 'KWH Meter',          type: 'number', frequency: 'daily', carryForward: true, destinations: [] },
    { id: `${prefix}_engine_rpm`,     label: 'Engine Speed (RPM)', type: 'number', frequency: 'daily', isConstant: true, defaultValue: 0, destinations: [] },
    { id: `${prefix}_oil_pressure`,   label: 'Oil Pressure (Bar)', type: 'number', frequency: 'daily', isConstant: true, defaultValue: 0, destinations: [] },
    { id: `${prefix}_water_temp`,     label: 'Water Temp (°C)',    type: 'number', frequency: 'daily', isConstant: true, defaultValue: 0, destinations: [] },
    { id: `${prefix}_daily_remarks`,  label: 'Daily Remarks',      type: 'text',   frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ASSET DICTIONARY
// Sequence is strict: matches the physical walk-around order technicians use.
// ─────────────────────────────────────────────────────────────────────────────

export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1 — The Server Room
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'The Server Room',
    assets: [
      {
        id: 'room_server_ambient',
        name: 'Server Room Ambient',
        metrics: [
          { 
            id: 'server_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 53 },
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 8 }
            ] 
          },
          { 
            id: 'server_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 9 }
            ] 
          },
        ],
      },
      { id: 'pac_server_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_server_em1') },
      { id: 'pac_server_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_server_em2') },
      { id: 'pac_server_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_server_em3') },
      { id: 'pac_server_em4', name: 'Emerson Aircon 4', metrics: buildPacMetrics('pac_server_em4') },
      { id: 'pac_server_em5', name: 'Emerson Aircon 5', metrics: buildPacMetrics('pac_server_em5') },
      { id: 'pac_server_em6', name: 'Emerson Aircon 6', metrics: buildPacMetrics('pac_server_em6') },
      { id: 'pac_server_em7', name: 'Emerson Aircon 7', metrics: buildPacMetrics('pac_server_em7') },
      { id: 'pac_server_vt1', name: 'Vertiv 1', metrics: buildPacMetrics('pac_server_vt1') },
      { id: 'pac_server_vt2', name: 'Vertiv 2', metrics: buildPacMetrics('pac_server_vt2') },
      { id: 'pac_server_vt3', name: 'Vertiv 3', metrics: buildPacMetrics('pac_server_vt3') },
      { id: 'pac_server_vt4', name: 'Vertiv 4', metrics: buildPacMetrics('pac_server_vt4') },
      { id: 'pac_server_vt5', name: 'Vertiv 5', metrics: buildPacMetrics('pac_server_vt5') },
      { id: 'pac_server_dragor', name: 'Dragor', metrics: buildPacMetrics('pac_server_dragor') },
    ],
  },
  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY — Media Room & Work Station
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Media Room & General',
    assets: [
      {
        id: 'room_media_ambient',
        name: 'Media Room Ambient',
        metrics: [
          { id: 'media_ambient_temp', label: 'Temperature (°C)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 54 }] },
          { id: 'media_ambient_humidity', label: 'Humidity (%)', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      {
        id: 'room_workstation',
        name: 'Work Station',
        metrics: [
          { id: 'workstation_status', label: 'Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 59 }] },
        ],
      },
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2 — Power Room 1
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 1',
    assets: [
      {
        id: 'room_pr1_ambient',
        name: 'Power Room 1 Ambient',
        metrics: [
          { 
            id: 'pr1_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 55 },
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 12 }
            ] 
          },
          { 
            id: 'pr1_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'text',   
            frequency: 'hourly', 
            isConstant: true, 
            defaultValue: 'NA', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 13 }
            ] 
          },
        ],
      },
      { id: 'ups_1', name: 'UPS 1', metrics: buildUpsMetrics('ups_1', 230, 31) },
      { id: 'rectifier_1', name: 'Rectifier 1', metrics: buildRectifierMetrics('rectifier_1', 45) },
      { id: 'pac_pr1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr1_em1') },
      { id: 'pac_pr1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr1_em2') },
      { id: 'pac_pr1_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_pr1_em3') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3 — Power Room 2
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 2',
    assets: [
      {
        id: 'room_pr2_ambient',
        name: 'Power Room 2 Ambient',
        metrics: [
          { 
            id: 'pr2_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 56 },
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 14 }
            ] 
          },
          { 
            id: 'pr2_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'text',   
            frequency: 'hourly', 
            isConstant: true, 
            defaultValue: 'NA', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 15 }
            ] 
          },
        ],
      },
      { id: 'ups_2', name: 'UPS 2', metrics: buildUpsMetrics('ups_2', 231, 38) },
      { id: 'rectifier_2', name: 'Rectifier 2', metrics: buildRectifierMetrics('rectifier_2', 49) },
      { id: 'pac_pr2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr2_em1') },
      { id: 'pac_pr2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4 — Outside / Main Grid
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Outside / Main Grid',
    assets: [
      {
        id: 'grid_main',
        name: 'ZESCO Grid',
        metrics: [
          // Voltages
          { id: 'grid_voltage_r', label: 'Voltage (R)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 4 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 2 }] },
          { id: 'grid_voltage_y', label: 'Voltage (Y)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_voltage_b', label: 'Voltage (B)', type: 'number', frequency: 'hourly', destinations: [] },
          
          // Amps
          { id: 'grid_amps_r', label: 'Amps (R)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_amps_y', label: 'Amps (Y)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_amps_b', label: 'Amps (B)', type: 'number', frequency: 'hourly', destinations: [] },
          
          { id: 'grid_frequency', label: 'Frequency (Hz)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 7 }] },
          
          // Status & Durations (With Constants)
          { id: 'grid_status', label: 'Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'ON', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 8 }] },
          { id: 'grid_off_time', label: 'Off Time', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 9 }] },
          { id: 'grid_restored_time', label: 'Restored Time', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [] },
          { id: 'grid_off_duration', label: 'Off Duration', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [] },
          
          { id: 'grid_total_site_load', label: 'Total Site Load (kW)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 12 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 14 }] },

          // Commercial Power (4-Hour) Metrics
          { id: 'grid_phase_voltage_rn', label: 'Phase Voltage (RN)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_phase_voltage_yn', label: 'Phase Voltage (YN)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_phase_voltage_bn', label: 'Phase Voltage (BN)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_transformer_temp', label: 'Transformer Temp (°C)', type: 'text', frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
          { id: 'grid_power_factor', label: 'Power Factor', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_energy_meter_1', label: 'Energy Meter (Sw 1)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_energy_meter_2', label: 'Energy Meter (Sw 2)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'grid_commercial_remarks', label: 'Remarks', type: 'text', frequency: '4-hour', isConstant: true, defaultValue: 'WEATHER ON MAINS/DG', destinations: [] },
          { id: 'facility_load_on', label: 'Load On (MAINS/DG)', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'MAINS', destinations: [] },
        ],
      },
      // MISSING ASSET ADDED: Aggregate DG Load
      {
        id: 'dg_aggregate_load',
        name: 'DG Load',
        metrics: [
          { id: 'dg_load_voltage_r', label: 'DG Voltage (R)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
          { id: 'dg_load_voltage_y', label: 'DG Voltage (Y)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
          { id: 'dg_load_voltage_b', label: 'DG Voltage (B)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
          { id: 'dg_load_amps_r', label: 'DG Amps (R)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
          { id: 'dg_load_amps_y', label: 'DG Amps (Y)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
          { id: 'dg_load_amps_b', label: 'DG Amps (B)', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 0, destinations: [] },
        ]
      },
      {
        id: 'fm200_panel',
        name: 'FM 200 Panel',
        metrics: [
          { 
            id: 'fm200_status',        
            label: 'Status',             
            type: 'text',   
            frequency: 'hourly', 
            isConstant: true, 
            defaultValue: 'OK', 
            destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 60 }] 
          },
        ],
      },
      { id: 'dg_1', name: 'Generator 1 (Built Room)', metrics: buildDgMetrics('dg_1', 1) },
      { id: 'dg_2', name: 'Generator 2 (Built Room)', metrics: buildDgMetrics('dg_2', 2) },
      { id: 'dg_3', name: 'Generator 3 (Container)',  metrics: buildDgMetrics('dg_3', 3) },
      { id: 'dg_4', name: 'Generator 4 (Container)',  metrics: buildDgMetrics('dg_4', 4, false, 27.7) },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5 — HQ Zone
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'HQ Zone',
    assets: [
      {
        id: 'hq_ambient',
        name: 'HQ Power Room Ambient',
        metrics: [
          { 
            id: 'hq_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: '4-hour', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 6 }
            ] 
          },
          { 
            id: 'hq_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'text',   
            frequency: '4-hour', 
            isConstant: true, 
            defaultValue: 'NA', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 7 }
            ] 
          },
        ],
      },
      { id: 'dg_hq', name: 'Generator HQ (Container)', metrics: buildDgMetrics('dg_hq', 5, true) },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6 — IT Room 2
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'IT Room 2',
    assets: [
      {
        id: 'room_it2_ambient',
        name: 'IT Room 2 Ambient',
        metrics: [
          { 
            id: 'it2_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: '4-hour', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 58 },
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 18 }
            ] 
          },
          { 
            id: 'it2_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'text',   
            frequency: '4-hour', 
            isConstant: true, 
            defaultValue: 'NA', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 19 }
            ] 
          },
        ],
      },
      { id: 'pac_it2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it2_em1') },
      { id: 'pac_it2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7 — IT Room 1
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'IT Room 1',
    assets: [
      {
        id: 'room_it1_ambient',
        name: 'IT Room 1 Ambient',
        metrics: [
          { 
            id: 'it1_ambient_temp',     
            label: 'Temperature (°C)', 
            type: 'number', 
            frequency: '4-hour', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 57 },
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 16 }
            ] 
          },
          { 
            id: 'it1_ambient_humidity', 
            label: 'Humidity (%)',      
            type: 'text',   
            frequency: '4-hour', 
            isConstant: true, 
            defaultValue: 'NA', 
            destinations: [
              { workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: 17 }
            ] 
          },
        ],
      },
      { id: 'pac_it1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it1_em1') },
      { id: 'pac_it1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it1_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8 — Fuel Logistics
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Fuel Logistics',
    assets: [
      {
        id: 'site_fuel_record',
        name: 'Site Fuel Record',
        metrics: [
          { 
            id: 'fuel_brought_forward', 
            label: 'Fuel Brought Forward (L)', 
            type: 'number', 
            frequency: 'daily', 
            carryForward: true, 
            destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 1 }] 
          },
          { 
            id: 'fuel_received',        
            label: 'Fuel Received (L)',        
            type: 'number', 
            frequency: 'daily', 
            defaultValue: 0, 
            destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 2 }] 
          },
          { 
            id: 'fuel_consumed',        
            label: 'Fuel Consumed (L)',        
            type: 'number', 
            frequency: 'daily', 
            defaultValue: 0, 
            destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 3 }] 
          },
          { 
            id: 'fuel_balance',         
            label: 'Fuel Balance (L)',         
            type: 'number', 
            frequency: 'daily', 
            carryForward: true, 
            destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 4 }] 
          },
          { id: 'leakage_sign',         label: 'Leakage Sign',             type: 'text',   frequency: 'daily', isConstant: true, defaultValue: 'NO', destinations: [] },
        ],
      },
    ],
  },
];

// ── BACKWARDS COMPATIBILITY LAYER ─────────────────────────────────────────────
// Reconstructs the flat HOURLY_TELEMETRY_SCHEMA and TelemetryField objects so
// layout builders, form managers, and export engines continue to compile clean.
export interface TelemetryField {
  id: string;
  label: string;
  category: string;
  subgroup?: string;
  unit?: string;
  type: "number" | "text";
  excelColumnIndex: number;
}

export const HOURLY_TELEMETRY_SCHEMA: TelemetryField[] = (() => {
  const fields: TelemetryField[] = [];
  MASTER_ASSET_DICTIONARY.forEach((cat) => {
    cat.assets.forEach((asset) => {
      asset.metrics.forEach((metric) => {
        const primaryDest = metric.destinations[0];
        fields.push({
          id: metric.id,
          label: `${asset.name} - ${metric.label}`,
          category: cat.categoryName,
          subgroup: asset.name,
          unit: undefined,
          type: metric.type === "boolean" ? "text" : metric.type,
          excelColumnIndex: primaryDest ? primaryDest.excelColumnIndex : -1
        });
      });
    });
  });
  return fields;
})();

// ── STRICT ANALYTICS TYPES ───────────────────────────────────────────────────
export interface GeneratorsFuelAnalyticsType {
  run_hrs: number;
  fuel_consumed: number;
  batt_voltage: number;
  oil_pressure: number;
  water_temp: number;
  dg_id: 'DG-1' | 'DG-2' | 'DG-3' | 'DG-4' | 'DG-HQ';
}

export interface UpsRectifiersAnalyticsType {
  ups_status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  rectifier_status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  output_load_kw: number;
  load_amps_a: number;
  load_amps_b: number;
  load_amps_c: number;
  rectifier_dc_voltage: number;
  battery_charge: number;
}

export interface ThermalHvacAnalyticsType {
  server_ambient_temp: number;
  return_temp_actual: number;
  supply_temp_set: number;
  humidity_percent: number;
  pac_id: string;
  room_zone: string;
  abnormality_flag: boolean;
}

export interface IncidentsAnalyticsType {
  resolution_time_hrs: number;
  incident_count: number;
  incident_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'OPEN' | 'RESOLVED';
  technician_id: string;
  resolution_notes: string;
}
