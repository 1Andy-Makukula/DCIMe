export const loadChartData = [
  { t: "00:00", kw: 441 }, { t: "02:00", kw: 428 }, { t: "04:00", kw: 415 },
  { t: "06:00", kw: 422 }, { t: "08:00", kw: 458 }, { t: "10:00", kw: 476 },
  { t: "12:00", kw: 483 }, { t: "14:00", kw: 471 }, { t: "16:00", kw: 468 },
  { t: "18:00", kw: 479 }, { t: "20:00", kw: 462 }, { t: "22:00", kw: 451 },
];

export const thermalData = [
  { room: "Main", temp: 20.7 },
  { room: "Pwr 1", temp: 19.2 },
  { room: "Pwr 2", temp: 21.1 },
  { room: "Ent 1", temp: 21.3 },
  { room: "Ent 2", temp: 20.4 },
];

export const phaseAlerts = [
  { id: "A-001", msg: "UPS 1: L3 drawing 112A vs L2 at 83A", level: "warn", time: "14:22" },
  { id: "A-002", msg: "Rectifier 2 Room 2: Voltage drop 47.8V", level: "crit", time: "13:55" },
  { id: "A-003", msg: "Main Room humidity at 63% (threshold 65%)", level: "warn", time: "12:30" },
  { id: "A-004", msg: "UPS 2: L1 phase imbalance approaching limit", level: "warn", time: "11:15" },
];

export const shiftLogs = [
  { id: "12347", by: "Anderson M.", time: "2 hours ago", status: "ok" },
  { id: "12346", by: "Chileshe K.", time: "6 hours ago", status: "ok" },
  { id: "12345", by: "Anderson M.", time: "14 hours ago", status: "ok" },
  { id: "12344", by: "Mwansa B.", time: "1 day ago", status: "warn" },
];
