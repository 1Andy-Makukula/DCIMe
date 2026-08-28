// ─────────────────────────────────────────────────────────────────────────────
// The categories a person browses by.
//
// These are NOT a new taxonomy. equipment_registry.category already groups
// every asset in the database — AIRCON, GENERATOR, UPS, RECTIFIER, MAINS,
// SWITCHGEAR, ENVIRONMENT, FUEL_LOGISTICS, IT_LOAD, SAFETY, FIRE_SUPPRESSION —
// and this file only says which of those belong together on one screen and what
// to call the result in English. Inventing a second grouping would mean two
// answers to "what counts as a generator" and an afternoon spent finding out
// which one a number came from.
//
// The parameters within a category are NOT listed here. They are read from the
// registry at runtime, so registering a parameter through Inventory puts it on
// the detail screen with no code change — which was the whole point of moving
// the registry into the database.
// ─────────────────────────────────────────────────────────────────────────────

/** Every value present in equipment_registry.category. */
export type DbCategory =
  | "AIRCON" | "SWITCHGEAR" | "IT_LOAD" | "GENERATOR" | "ENVIRONMENT"
  | "RECTIFIER" | "UPS" | "MAINS" | "FUEL_LOGISTICS" | "SAFETY"
  | "FIRE_SUPPRESSION";

export interface CategoryDef {
  /** URL segment. Stable — it ends up in printed report footers. */
  id: string;
  label: string;
  /** The one-line answer to "what am I looking at". */
  blurb: string;
  /** Which registry categories feed this screen. */
  dbCategories: DbCategory[];
  /**
   * How readings are grouped by default.
   *
   * Room, where a reader thinks in rooms ("how hot is the server room") —
   * asset, where they think in machines ("what is DG-2 doing").
   */
  defaultGroupBy: "room" | "asset";
  /** Icon name in lucide-react, resolved by the screen. */
  icon: string;
}

/**
 * The five categories asked for, plus the two that already had a home.
 *
 * Temperature & humidity draws on AIRCON as well as ENVIRONMENT because the
 * room temperatures are logged against the air conditioner that serves the
 * room, not against an abstract sensor — 36,355 of the readings are AIRCON
 * rows, so a screen reading ENVIRONMENT alone would show a tenth of the data
 * and look, wrongly, like a quiet month.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    id: "thermal",
    label: "Temperature & Humidity",
    blurb: "Room conditions and the air conditioning that holds them.",
    dbCategories: ["ENVIRONMENT", "AIRCON"],
    defaultGroupBy: "room",
    icon: "ThermometerSnowflake"
  },
  {
    id: "utility",
    label: "Utility Supply",
    blurb: "Incoming mains and the switchgear that distributes it.",
    dbCategories: ["MAINS", "SWITCHGEAR"],
    defaultGroupBy: "asset",
    icon: "Zap"
  },
  {
    id: "generator",
    label: "Generators & Fuel",
    blurb: "Standby generation, running hours and fuel on hand.",
    dbCategories: ["GENERATOR", "FUEL_LOGISTICS"],
    defaultGroupBy: "asset",
    icon: "Fuel"
  },
  {
    id: "ups",
    label: "UPS",
    blurb: "Uninterruptible supply, battery condition and load.",
    dbCategories: ["UPS"],
    defaultGroupBy: "asset",
    icon: "Battery"
  },
  {
    id: "rectifier",
    label: "DC Rectifiers",
    blurb: "DC plant, float voltage and rectifier output.",
    dbCategories: ["RECTIFIER"],
    defaultGroupBy: "asset",
    icon: "PlugZap"
  },
  {
    id: "load",
    label: "IT Load",
    blurb: "What the equipment in the racks is drawing.",
    dbCategories: ["IT_LOAD"],
    defaultGroupBy: "asset",
    icon: "Server"
  },
  {
    id: "safety",
    label: "Fire & Safety",
    blurb: "Suppression and life-safety systems.",
    dbCategories: ["FIRE_SUPPRESSION", "SAFETY"],
    defaultGroupBy: "asset",
    icon: "ShieldCheck"
  }
];

export const categoryById = (id: string): CategoryDef | undefined =>
  CATEGORIES.find((c) => c.id === id);

// ─────────────────────────────────────────────────────────────────────────────
// Units
//
// 167 of the 172 captured numeric parameters now carry a real unit, keyed into
// unit_definitions. The registry is the source; everything here is presentation
// and fallback.
//
// CODES ARE NOT SYMBOLS
// unit_definitions stores machine-safe codes — degC, %RH, hr, L/hr — because
// they are a foreign key and travel through URLs, CSV and Excel. A chart axis
// wants the symbol. Rendering the code verbatim puts "degC" on a temperature
// axis, which reads as a bug even though the data is right.
//
// The pattern list below survives only as a fallback for a parameter that has
// not been given a unit yet. It fails quietly on purpose: an unrecognised name
// gets nothing rather than a guess, because a WRONG unit on a compliance record
// is worse than a missing one.
// ─────────────────────────────────────────────────────────────────────────────

/** unit_definitions.unit_code → what a reader should see. */
const UNIT_SYMBOLS: Record<string, string> = {
  degC: "°C",
  degF: "°F",
  "%RH": "% RH",
  hr: "h",
  min: "min",
  "L/hr": "L/h",
  // Power factor is a bare ratio. The code exists so the dimension is
  // recorded; showing "pf" after the number would be noise.
  pf: ""
};

const UNIT_PATTERNS: [RegExp, string][] = [
  [/temp|temperature/i,               "°C"],
  [/humidity/i,                       "%"],
  [/(^|_)(voltage|volt|volts)(_|$)/i, "V"],
  [/(^|_)(current|amps|ampere)/i,     "A"],
  [/frequency|freq|hz/i,              "Hz"],
  [/power_factor/i,                   ""],
  [/(^|_)kwh|energy/i,                "kWh"],
  [/(^|_)kw(_|$)|active_power/i,      "kW"],
  [/(^|_)kva(_|$)/i,                  "kVA"],
  [/pressure/i,                       "kPa"],
  [/fuel.*(level|remaining)/i,        "L"],
  [/(^|_)litres|liters|_l$/i,         "L"],
  [/hours|runtime|run_time/i,         "h"],
  [/load.*percent|percent.*load|_pct/i, "%"],
  [/rpm/i,                            "rpm"]
];

/**
 * The unit for a parameter: the registry's own value when set, otherwise a
 * guess from the name, otherwise nothing.
 */
export function unitFor(parameterName: string, registryUnit?: string | null): string | null {
  const registered = registryUnit?.trim();
  if (registered) {
    const symbol = UNIT_SYMBOLS[registered];
    // An empty string in the map means "deliberately shown without a unit",
    // which is different from "not in the map" — hence the `in` check rather
    // than a truthiness test.
    if (registered in UNIT_SYMBOLS) return symbol || null;
    return registered;
  }
  for (const [pattern, unit] of UNIT_PATTERNS) {
    if (pattern.test(parameterName)) return unit || null;
  }
  return null;
}

/** "supply_temp_actual" → "Supply Temp Actual". */
export function humanise(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bTemp\b/g, "Temp")
    .replace(/\bPac\b/g, "PAC")
    .replace(/\bUps\b/g, "UPS")
    .replace(/\bDg\b/g, "DG")
    .replace(/\bKw\b/g, "kW")
    .replace(/\bKva\b/g, "kVA")
    .replace(/\bDc\b/g, "DC")
    .replace(/\bAc\b/g, "AC");
}
