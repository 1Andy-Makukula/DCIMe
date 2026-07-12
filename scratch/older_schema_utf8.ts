// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// DCIMe Engine ÔÇö Relational Asset Dictionary
// Single source of truth for the mobile app and Excel export engine.
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Shared metric blueprints ÔÇö avoids repeating the same fields
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function buildPacMetrics(prefix: string): AssetMetric[] {
  return [
    { 
      id: `${prefix}_return_temp_actual`, 
      label: 'Return Temp (Actual)', 
      type: 'number', 
      frequency: '2-hour', 
      destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 4 }] 
    },
    { 
      id: `${prefix}_return_temp_set`,    
      label: 'Return Temp (Set)',    
      type: 'number', 
      frequency: '2-hour', 
      carryForward: true, 
      destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 5 }] 
    },
    { 
      id: `${prefix}_supply_temp_set`,    
      label: 'Supply Temp (Set)',    
      type: 'number', 
      frequency: '2-hour', 
      carryForward: true, 
      destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 6 }] 
    },
    { 
      id: `${prefix}_humidity_actual`,    
      label: 'Humidity (Actual)',    
      type: 'number', 
      frequency: '2-hour', 
      destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 7 }] 
    },
    { 
      id: `${prefix}_humidity_set`,       
      label: 'Humidity (Set)',       
      type: 'number', 
      frequency: '2-hour', 
      carryForward: true, 
      destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 8 }] 
    },
    { id: `${prefix}_voltage_ry`,         label: 'Voltage (R-Y)',        type: 'number', frequency: '2-hour', destinations: [] },
    { id: `${prefix}_current_r`,          label: 'Current (R)',          type: 'number', frequency: '2-hour', destinations: [] },
  ];
}

function buildUpsMetrics(prefix: string, outputVoltageDefault: number, excelStartColumnIndex?: number): AssetMetric[] {
  const getDest = (offset: number): ExcelTarget[] => {
    if (excelStartColumnIndex === undefined) return [];
    return [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: excelStartColumnIndex + offset }];
  };

  return [
    { id: `${prefix}_output_load_kw`,        label: 'Output Load (kW)',      type: 'number', frequency: 'hourly', destinations: getDest(0) },
    { id: `${prefix}_used_capacity`,          label: 'Used Capacity (%)',     type: 'number', frequency: 'hourly', destinations: getDest(1) },
    { id: `${prefix}_battery_charge_percent`, label: 'Battery Charge (%)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 100, destinations: getDest(2) },
    { id: `${prefix}_battery_voltage`,        label: 'Battery Voltage (V)',   type: 'number', frequency: 'hourly', destinations: getDest(3) },
    { id: `${prefix}_load_amps_a`,            label: 'Load Amps (A)',         type: 'number', frequency: 'hourly', destinations: getDest(4) },
    { id: `${prefix}_output_voltage_a`,       label: 'Output Voltage (A)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: outputVoltageDefault, destinations: getDest(5) },
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
  ];
}

function buildDgMetrics(prefix: string, dgNumber: number, isHq: boolean = false): AssetMetric[] {
  const dgName = isHq ? 'DG-HQ' : `DG-${dgNumber}`;
  
  // daily_canvas mapping: DG-1 = 19, DG-2 = 22, DG-3 = 25, DG-4 = 28.
  const canvasStartIndex = isHq ? undefined : 19 + (dgNumber - 1) * 3;
  
  // commercial_logbook 'DG Check' battery voltage index: DG-1 = 12, DG-2 = 13, DG-3 = 14, DG-4 = 15, DG-HQ = 16.
  const checkVoltageIndex = isHq ? 16 : 12 + (dgNumber - 1);

  const runHrsDests: ExcelTarget[] = [];
  if (canvasStartIndex !== undefined) {
    runHrsDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex });
  }
  runHrsDests.push({ workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: 5 });

  const battVoltageDests: ExcelTarget[] = [];
  if (canvasStartIndex !== undefined) {
    battVoltageDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 1 });
  }
  battVoltageDests.push({ workbook: 'commercial_logbook', sheetName: 'DG Check', excelColumnIndex: checkVoltageIndex });

  return [
    { id: `${prefix}_run_hrs`,       label: 'Run Hours',       type: 'number', frequency: 'hourly', carryForward: true, destinations: runHrsDests },
    { id: `${prefix}_batt_voltage`,  label: 'Battery Voltage', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 26.7, destinations: battVoltageDests },
    { id: `${prefix}_charged_status`,label: 'Charged Status',  type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'GREEN', destinations: [] },
  ];
}

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// MASTER ASSET DICTIONARY
// Sequence is strict: matches the physical walk-around order technicians use.
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 1 ÔÇö The Server Room
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'The Server Room',
    assets: [
      {
        id: 'room_server_ambient',
        name: 'Server Room Ambient',
        metrics: [
          { 
            id: 'server_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 2 ÔÇö Power Room 1
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Power Room 1',
    assets: [
      {
        id: 'room_pr1_ambient',
        name: 'Power Room 1 Ambient',
        metrics: [
          { 
            id: 'pr1_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 3 ÔÇö Power Room 2
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Power Room 2',
    assets: [
      {
        id: 'room_pr2_ambient',
        name: 'Power Room 2 Ambient',
        metrics: [
          { 
            id: 'pr2_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 4 ÔÇö Outside / Main Grid
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Outside / Main Grid',
    assets: [
      {
        id: 'grid_main',
        name: 'ZESCO Grid',
        metrics: [
          { 
            id: 'grid_voltage_r',      
            label: 'Voltage (R)',        
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 4 },
              { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 2 }
            ] 
          },
          { id: 'grid_amps_r',         label: 'Amps (R)',           type: 'number', frequency: 'hourly', destinations: [] },
          { 
            id: 'grid_frequency',      
            label: 'Frequency (Hz)',     
            type: 'number', 
            frequency: 'hourly', 
            destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 7 }] 
          },
          { 
            id: 'grid_status',         
            label: 'Status',             
            type: 'text',   
            frequency: 'hourly', 
            isConstant: true, 
            defaultValue: 'ON', 
            destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 8 }] 
          },
          { 
            id: 'grid_total_site_load', 
            label: 'Total Site Load (kW)', 
            type: 'number', 
            frequency: 'hourly', 
            destinations: [
              { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 12 },
              { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 14 }
            ] 
          },
          { 
            id: 'grid_off_time',       
            label: 'Off Time',           
            type: 'text',   
            frequency: 'hourly', 
            isConstant: true, 
            defaultValue: '0:00', 
            destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 9 }] 
          },
          { id: 'grid_restored_time',  label: 'Restored Time',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [] },
        ],
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
      { id: 'dg_4', name: 'Generator 4 (Container)',  metrics: buildDgMetrics('dg_4', 4) },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 5 ÔÇö HQ Zone
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'HQ Zone',
    assets: [
      {
        id: 'hq_ambient',
        name: 'HQ Power Room Ambient',
        metrics: [
          { 
            id: 'hq_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 6 ÔÇö IT Room 2
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'IT Room 2',
    assets: [
      {
        id: 'room_it2_ambient',
        name: 'IT Room 2 Ambient',
        metrics: [
          { 
            id: 'it2_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 7 ÔÇö IT Room 1
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'IT Room 1',
    assets: [
      {
        id: 'room_it1_ambient',
        name: 'IT Room 1 Ambient',
        metrics: [
          { 
            id: 'it1_ambient_temp',     
            label: 'Temperature (┬░C)', 
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

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 8 ÔÇö Fuel Logistics
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
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

// ÔöÇÔöÇ BACKWARDS COMPATIBILITY LAYER ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
