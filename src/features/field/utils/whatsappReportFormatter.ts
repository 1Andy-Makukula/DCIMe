// src/features/field/utils/whatsappReportFormatter.ts

export interface HistoryRecord {
  timestamp: string;
  date: string;
  hour: string;
  text: string;
}

/** Parses hour string (e.g. "12:00", "15:00", "09:30") into total minutes for numerical sorting */
export const parseHourMinutes = (hStr: string): number => {
  if (!hStr) return 0;
  const match = hStr.match(/(\d{1,2})(?::(\d{2}))?/);
  if (match) {
    const hh = parseInt(match[1], 10);
    const mm = match[2] ? parseInt(match[2], 10) : 0;
    return hh * 60 + mm;
  }
  return 0;
};

/** Sorts history records in ascending numerical hour order */
export const sortHistoryAscending = (records: HistoryRecord[]): HistoryRecord[] => {
  return [...records].sort((a, b) => {
    const minA = parseHourMinutes(a.hour);
    const minB = parseHourMinutes(b.hour);
    if (minA !== minB) return minA - minB;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
};

interface ReportParams {
  siteCode: string;
  currentSiteName?: string;
  employeeName?: string;
  activePowerSource: 'ZESCO' | 'MAINS' | 'GENERATOR';
  formData: Record<string, any>;
  targetHour?: string | number;
}

export const generateReportTexts = ({
  siteCode,
  currentSiteName,
  employeeName,
  activePowerSource,
  formData,
  targetHour
}: ReportParams) => {
  const getCleanValue = (key: string, fallback: string = "NA") => {
    const val = formData[key];
    if (val === undefined || val === null || String(val).trim() === "") return fallback;
    return String(val).trim();
  };

  const rawHour = targetHour ?? formData.target_hour ?? formData.hour ?? new Date().getHours();
  const numericHour = typeof rawHour === 'number'
    ? rawHour
    : parseInt(String(rawHour || '0').split(':')[0], 10);
  const isFourHour = !isNaN(numericHour) && numericHour % 4 === 0;

  const technicianName = employeeName || "Unknown Tech";
  const firstName = technicianName.trim().split(/\s+/)[0];
  const powerSourceText = activePowerSource === 'GENERATOR' ? 'GENERATOR' : 'ZESCO MAINS';
  const isGen = activePowerSource === 'GENERATOR';
  const shareTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let whatsappPayload = "";
  let internalPayload = "";

  if (siteCode === "NTC") {
    const v_r = isGen ? getCleanValue('dg_load_voltage_r') : getCleanValue('grid_voltage_r');
    const v_y = isGen ? getCleanValue('dg_load_voltage_y') : getCleanValue('grid_voltage_y');
    const v_b = isGen ? getCleanValue('dg_load_voltage_b') : getCleanValue('grid_voltage_b');

    const v_rn = isGen ? "230" : getCleanValue('grid_phase_voltage_rn', '230');
    const v_yn = isGen ? "230" : getCleanValue('grid_phase_voltage_yn', '230');
    const v_bn = isGen ? "230" : getCleanValue('grid_phase_voltage_bn', '230');

    const a_r = isGen ? getCleanValue('dg_load_amps_r') : getCleanValue('grid_amps_r');
    const a_y = isGen ? getCleanValue('dg_load_amps_y') : getCleanValue('grid_amps_y');
    const a_b = isGen ? getCleanValue('dg_load_amps_b') : getCleanValue('grid_amps_b');

    const parseAvg = (...vals: string[]): number | null => {
      const nums = vals
        .filter(v => v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "NA")
        .map(v => parseFloat(v))
        .filter(n => !isNaN(n));
      if (nums.length === 0) return null;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };

    const avgV_LL_num = parseAvg(v_r, v_y, v_b);
    const avgV_LL = avgV_LL_num !== null ? avgV_LL_num : (parseFloat(v_r) || 0);

    const avgV_LN_num = parseAvg(v_rn, v_yn, v_bn);
    const avgV_LN = avgV_LN_num !== null ? avgV_LN_num : 230;

    const avgAmps_num = parseAvg(a_r, a_y, a_b);
    const avgAmps = avgAmps_num !== null ? avgAmps_num : (parseFloat(a_r) || 0);

    const pfVal = isGen ? "0.9" : getCleanValue('grid_power_factor', "0.9");
    const pfNum = parseFloat(pfVal);
    const calcKw = (isGen && avgV_LL > 0 && avgAmps > 0)
      ? Math.round((avgV_LL * avgAmps * 1.732 * pfNum) / 1000)
      : 0;

    const kwVal = isGen ? calcKw.toString() : getCleanValue('grid_total_site_load');

    const sw1_val = getCleanValue('grid_energy_meter_1');
    const sw2_val = getCleanValue('grid_energy_meter_2');
    const swSection = (isFourHour && (sw1_val !== "NA" || sw2_val !== "NA"))
      ? `\n*SWITCH METERS (4-HR)*\nSW 1: ${sw1_val} kWh | SW 2: ${sw2_val} kWh\n`
      : "";

    const r1_v = getCleanValue('rectifier_1_dc_voltage', '54.2');
    const r1_a = getCleanValue('rectifier_1_amps');
    const r1_cap = getCleanValue('rectifier_1_used_percentage');

    const r2_v = getCleanValue('rectifier_2_dc_voltage', '54.2');
    const r2_a = getCleanValue('rectifier_2_amps');
    const r2_cap = getCleanValue('rectifier_2_used_percentage');

    const ups1_l1 = getCleanValue('ups_1_output_voltage_a', '230');
    const ups1_l2 = getCleanValue('ups_1_output_voltage_b', '230');
    const ups1_l3 = getCleanValue('ups_1_output_voltage_c', '230');
    const ups1_a1 = getCleanValue('ups_1_load_amps_a');
    const ups1_a2 = getCleanValue('ups_1_load_amps_b');
    const ups1_a3 = getCleanValue('ups_1_load_amps_c');
    const ups1_p1 = getCleanValue('ups_1_load_phase_percent_a');
    const ups1_p2 = getCleanValue('ups_1_load_phase_percent_b');
    const ups1_p3 = getCleanValue('ups_1_load_phase_percent_c');
    const ups1_batt = getCleanValue('ups_1_battery_voltage');
    const ups1_charge = getCleanValue('ups_1_battery_charge_percent', '100');
    const ups1_used = getCleanValue('ups_1_used_capacity');
    const ups1_load = getCleanValue('ups_1_output_load_kw');

    const ups2_l1 = getCleanValue('ups_2_output_voltage_a', '230');
    const ups2_l2 = getCleanValue('ups_2_output_voltage_b', '230');
    const ups2_l3 = getCleanValue('ups_2_output_voltage_c', '230');
    const ups2_a1 = getCleanValue('ups_2_load_amps_a');
    const ups2_a2 = getCleanValue('ups_2_load_amps_b');
    const ups2_a3 = getCleanValue('ups_2_load_amps_c');
    const ups2_p1 = getCleanValue('ups_2_load_phase_percent_a');
    const ups2_p2 = getCleanValue('ups_2_load_phase_percent_b');
    const ups2_p3 = getCleanValue('ups_2_load_phase_percent_c');
    const ups2_batt = getCleanValue('ups_2_battery_voltage');
    const ups2_charge = getCleanValue('ups_2_battery_charge_percent', '100');
    const ups2_used = getCleanValue('ups_2_used_capacity');
    const ups2_load = getCleanValue('ups_2_output_load_kw');

    const tempMain = getCleanValue('server_ambient_temp');
    const tempPr1 = getCleanValue('pr1_ambient_temp');
    const tempPr2 = getCleanValue('pr2_ambient_temp');
    const tempIt1 = getCleanValue('it1_ambient_temp');
    const tempIt2 = getCleanValue('it2_ambient_temp');
    const humidityMain = getCleanValue('server_ambient_humidity');

    whatsappPayload = `*NTC ZM 0874*
*${firstName.toUpperCase()} ON DUTY*
*TIME: ${shareTime}hrs*
*LOAD ON:* ${powerSourceText}
*Load voltage:* ${avgV_LL}V
*Load in Amps:* ${avgAmps}A

*KW:* ${kwVal}
*Power factor* ${pfVal}

*VERTIV RECTIFIER 1*
(Power room 1) ${r1_v}v/${r1_a}A/${r1_cap}%
*VERTIV RECTIFIER 2*
(Power room 2) ${r2_v}v/${r2_a}A/${r2_cap}%

*VERTIV UPS 1 OUTPUT*
(Power room_1)
L1-${ups1_l1}V/${ups1_a1}A (${ups1_p1}%)
L2-${ups1_l2}V/${ups1_a2}A (${ups1_p2}%)
L3-${ups1_l3}V/${ups1_a3}A (${ups1_p3}%)

Battery Voltage: ${ups1_batt}VDC
Battery Charge: ${ups1_charge}%
Used Capacity: ${ups1_used}%
Load: ${ups1_load}KW

*VERTIV UPS 2 OUTPUT*
(Power room_2)
L1-${ups2_l1}V/${ups2_a1}A (${ups2_p1}%)
L2-${ups2_l2}V/${ups2_a2}A (${ups2_p2}%)
L3-${ups2_l3}V/${ups2_a3}A (${ups2_p3}%)

Battery Voltage: ${ups2_batt}VDC
Battery Charge:${ups2_charge}%
Used Capacity:${ups2_used}%
Load: ${ups2_load}KW

*TEMPERATURE*
Main Room_${tempMain}°C
Power Room1_${tempPr1}°C
Power Room2_${tempPr2}°C

*FIRST FLOOR SERVER ROOM*
ENTERPRISE  ROOM 1_${tempIt1}°C
ENTERPRISE ROOM 2_${tempIt2}°C
Humidity: ${humidityMain}%`;

    const em1_temp = getCleanValue('pac_server_em1_return_temp_actual');
    const em1_hum = getCleanValue('pac_server_em1_humidity_actual');
    const em2_temp = getCleanValue('pac_server_em2_return_temp_actual');
    const em2_hum = getCleanValue('pac_server_em2_humidity_actual');
    const em3_temp = getCleanValue('pac_server_em3_return_temp_actual');
    const em3_hum = getCleanValue('pac_server_em3_humidity_actual');
    const em4_temp = getCleanValue('pac_server_em4_return_temp_actual');
    const em4_hum = getCleanValue('pac_server_em4_humidity_actual');
    const em5_temp = getCleanValue('pac_server_em5_return_temp_actual');
    const em5_hum = getCleanValue('pac_server_em5_humidity_actual');
    const em6_temp = getCleanValue('pac_server_em6_return_temp_actual');
    const em6_hum = getCleanValue('pac_server_em6_humidity_actual');
    const em7_temp = getCleanValue('pac_server_em7_return_temp_actual');
    const em7_hum = getCleanValue('pac_server_em7_humidity_actual');

    const vt1_temp = getCleanValue('pac_server_vt1_return_temp_actual');
    const vt1_hum = getCleanValue('pac_server_vt1_humidity_actual');
    const vt2_temp = getCleanValue('pac_server_vt2_return_temp_actual');
    const vt2_hum = getCleanValue('pac_server_vt2_humidity_actual');
    const vt3_temp = getCleanValue('pac_server_vt3_return_temp_actual');
    const vt3_hum = getCleanValue('pac_server_vt3_humidity_actual');
    const vt4_temp = getCleanValue('pac_server_vt4_return_temp_actual');
    const vt4_hum = getCleanValue('pac_server_vt4_humidity_actual');
    const vt5_temp = getCleanValue('pac_server_vt5_return_temp_actual');
    const vt5_hum = getCleanValue('pac_server_vt5_humidity_actual');
    const vt6_temp = getCleanValue('pac_data_vt6_return_temp_actual');
    const vt6_hum = getCleanValue('pac_data_vt6_humidity_actual');

    internalPayload = `${whatsappPayload}${swSection}

*UNIT TEMPERATURES & HUMIDITY*
Emerson 1 : ${em1_temp}°C | ${em1_hum}%
Emerson 2 : ${em2_temp}°C | ${em2_hum}%
Emerson 3 : ${em3_temp}°C | ${em3_hum}%
Emerson 4 : ${em4_temp}°C | ${em4_hum}%
Emerson 5 : ${em5_temp}°C | ${em5_hum}%
Emerson 6 : ${em6_temp}°C | ${em6_hum}%
Emerson 7 : ${em7_temp}°C | ${em7_hum}%

Vertiv 1  : ${vt1_temp}°C | ${vt1_hum}%
Vertiv 2  : ${vt2_temp}°C | ${vt2_hum}%
Vertiv 3  : ${vt3_temp}°C | ${vt3_hum}%
Vertiv 4  : ${vt4_temp}°C | ${vt4_hum}%
Vertiv 5  : ${vt5_temp}°C | ${vt5_hum}%
Vertiv 6  : ${vt6_temp}°C | ${vt6_hum}%

*GRID/POWER METRICS*
VOLTAGE L-L : R:${v_r}V | Y:${v_y}V | B:${v_b}V (AVG: ${avgV_LL}V)
VOLTAGE L-N : RN:${v_rn}V | YN:${v_yn}V | BN:${v_bn}V (AVG: ${avgV_LN}V)
CURRENT     : R:${a_r}A | Y:${a_y}A | B:${a_b}A (AVG: ${avgAmps}A)`;
  } else {
    const v_r = isGen ? getCleanValue('dg_load_voltage_r') : getCleanValue('grid_voltage_r');
    const v_y = isGen ? getCleanValue('dg_load_voltage_y') : getCleanValue('grid_voltage_y');
    const v_b = isGen ? getCleanValue('dg_load_voltage_b') : getCleanValue('grid_voltage_b');

    const v_rn = isGen ? "230" : getCleanValue('grid_phase_voltage_rn', '230');
    const v_yn = isGen ? "230" : getCleanValue('grid_phase_voltage_yn', '230');
    const v_bn = isGen ? "230" : getCleanValue('grid_phase_voltage_bn', '230');

    const a_r = isGen ? getCleanValue('dg_load_amps_r') : getCleanValue('grid_amps_r');
    const a_y = isGen ? getCleanValue('dg_load_amps_y') : getCleanValue('grid_amps_y');
    const a_b = isGen ? getCleanValue('dg_load_amps_b') : getCleanValue('grid_amps_b');

    const parseAvg = (...vals: string[]): number | null => {
      const nums = vals
        .filter(v => v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "NA")
        .map(v => parseFloat(v))
        .filter(n => !isNaN(n));
      if (nums.length === 0) return null;
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };

    const avgV_LL_num = parseAvg(v_r, v_y, v_b);
    const avgV_LL = avgV_LL_num !== null ? avgV_LL_num : (parseFloat(v_r) || 0);

    const avgV_LN_num = parseAvg(v_rn, v_yn, v_bn);
    const avgV_LN = avgV_LN_num !== null ? avgV_LN_num : 230;

    const avgAmps_num = parseAvg(a_r, a_y, a_b);
    const avgAmps = avgAmps_num !== null ? avgAmps_num : (parseFloat(a_r) || 0);

    const pfVal = isGen ? "0.9" : getCleanValue('grid_power_factor', "0.9");
    const pfNum = parseFloat(pfVal);
    const calcKw = (isGen && avgV_LL > 0 && avgAmps > 0)
      ? Math.round((avgV_LL * avgAmps * 1.732 * pfNum) / 1000)
      : 0;
    const kwVal = isGen ? calcKw.toString() : getCleanValue('grid_total_site_load');

    const sw1_val = getCleanValue('grid_energy_meter_1');
    const sw2_val = getCleanValue('grid_energy_meter_2');
    const swSection = (isFourHour && (sw1_val !== "NA" || sw2_val !== "NA"))
      ? `\n*SWITCH METERS (4-HR)*\nSW 1: ${sw1_val} kWh | SW 2: ${sw2_val} kWh\n`
      : "";

    const r1_v = getCleanValue('rectifier_1_dc_voltage', '54.2');
    const r1_a = getCleanValue('rectifier_1_amps');
    const r1_cap = getCleanValue('rectifier_1_used_percentage');

    const ups1_l1 = getCleanValue('ups_1_output_voltage_a', '230');
    const ups1_a1 = getCleanValue('ups_1_load_amps_a');
    const ups1_batt = getCleanValue('ups_1_battery_voltage');
    const ups1_charge = getCleanValue('ups_1_battery_charge_percent', '100');
    const ups1_used = getCleanValue('ups_1_used_capacity');
    const ups1_load = getCleanValue('ups_1_output_load_kw');

    const tempMain = getCleanValue('server_ambient_temp');
    const tempPr1 = getCleanValue('pr1_ambient_temp');
    const tempIt1 = getCleanValue('it1_ambient_temp');

    whatsappPayload = `*${siteCode} ${currentSiteName || ""}*
*${firstName.toUpperCase()} ON DUTY*
*TIME: ${shareTime}hrs*
*LOAD ON ${powerSourceText}*
Load voltage *${avgV_LL}*V
Load in Amps *${avgAmps}*A
*KW:${kwVal}*KW
Power factor *${pfVal}*
*RECTIFIER 1:* ${r1_v}V / ${r1_a}A / ${r1_cap}%
*UPS 1:* L1:${ups1_l1}V / ${ups1_a1}A | Batt:${ups1_batt}V (${ups1_charge}%) | Capacity:${ups1_used}% | Load:${ups1_load}KW

*TEMPERATURE*
Main Room *${tempMain}*°C
Power Room1_*${tempPr1}*°C
Enterprise Room 1 *${tempIt1}*°C`;

    const em1_temp = getCleanValue('pac_server_em1_return_temp_actual');
    const em1_hum = getCleanValue('pac_server_em1_humidity_actual');
    const em2_temp = getCleanValue('pac_server_em2_return_temp_actual');
    const em2_hum = getCleanValue('pac_server_em2_humidity_actual');
    const em1_it_temp = getCleanValue('pac_it1_em1_return_temp_actual');

    internalPayload = `${whatsappPayload}${swSection}

*GRID/POWER METRICS*
VOLTAGE L-L : R:${v_r}V | Y:${v_y}V | B:${v_b}V (AVG: ${avgV_LL}V)
VOLTAGE L-N : RN:${v_rn}V | YN:${v_yn}V | BN:${v_bn}V (AVG: ${avgV_LN}V)
CURRENT     : R:${a_r}A | Y:${a_y}A | B:${a_b}A (AVG: ${avgAmps}A)

*UNIT TEMPERATURES & HUMIDITY*
Emerson 1 : ${em1_temp}°C | ${em1_hum}%
Emerson 2 : ${em2_temp}°C | ${em2_hum}%
IT Room 1 AC 1 : ${em1_it_temp}°C`;
  }

  return { whatsappPayload, internalPayload };
};
