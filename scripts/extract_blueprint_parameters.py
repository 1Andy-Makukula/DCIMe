#!/usr/bin/env python3
"""
extract_blueprint_parameters.py — move the parameter definitions out of the
site blueprints and into the database.

The 324 readings a technician records every shift are defined in
src/config/sites/*_blueprint.json, as a `metrics` array on each equipment entry.
That is the actual source of V1's rigidity: adding a parameter means editing
JSON, rebuilding and redeploying.

This emits those definitions as equipment_parameters rows so the form can be
generated from data instead.

    python scripts/extract_blueprint_parameters.py

Writes: supabase/seed/20260816_seed_blueprint_parameters.sql

── ON UNIT INFERENCE ────────────────────────────────────────────────────────
The obvious approach — parse the unit out of the label's trailing parenthesis —
is WRONG here, and quietly so. Across the blueprint those parentheses are:

    (Set)      x81     setpoint qualifier, not a unit
    (Actual)   x54     reading qualifier, not a unit
    (R) (Y) (B) (R-Y)  three-phase designators
    (Start) (Stop)     time qualifiers
    (OK/Not OK)        an enumerated option list
    (%) (°C) (A) (Hz)  ... and only about 45 are genuinely units

Tagging 81 parameters with unit "Set" would corrupt the dimension system that
Stage 1 exists to protect. Units are therefore inferred from tokens in the
parameter ID, which is highly structured (temp x94, humidity x61, voltage x36),
and left NULL wherever the signal is ambiguous. A missing unit is recoverable;
a wrong one is not.
"""

import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITES = os.path.join(ROOT, "src", "config", "sites")
OUT = os.path.join(ROOT, "supabase", "seed", "20260816_seed_blueprint_parameters.sql")

# Token in the parameter id -> unit_code in unit_definitions.
# Ordered: the first match wins, so more specific tokens come first.
UNIT_RULES = [
    ("kwh",        "kWh"),
    ("kva",        "kVA"),
    ("kw",         "kW"),
    ("humidity",   "%RH"),
    ("temp",       "degC"),
    ("voltage",    "V"),
    ("volt",       "V"),
    ("amps",       "A"),
    ("current",    "A"),
    ("frequency",  "Hz"),
    ("rpm",        "rpm"),
    ("pressure",   "kPa"),
    ("percent",    "%"),
    ("pct",        "%"),
    ("soc",        "%"),
    ("hrs",        "hr"),
    ("hours",      "hr"),
    ("fuel",       "L"),
    ("liters",     "L"),
    ("litres",     "L"),
    ("ltr",        "L"),
]

# Tokens that mean "this is not a measurement" — status flags, remarks, times.
TEXTUAL = ("status", "remark", "sign", "comment", "observed", "abnormality",
           "time", "duration", "spoc", "signature", "date", "name")

# Plausible operating ranges, keyed by unit. Deliberately WIDE: the purpose is to
# catch a decimal-place or transposition error (400 typed as 4000), not to
# second-guess the facility. Stage 8 tightens these against real history.
RANGE_BY_UNIT = {
    "degC": (-10.0, 80.0),
    "%RH":  (0.0, 100.0),
    "%":    (0.0, 100.0),
    "V":    (0.0, 15000.0),
    "A":    (0.0, 6000.0),
    "Hz":   (0.0, 70.0),
    "kW":   (0.0, 5000.0),
    "kWh":  (0.0, 99999999.0),
    "kVA":  (0.0, 5000.0),
    "L":    (0.0, 50000.0),
    "hr":   (0.0, 200000.0),
    "rpm":  (0.0, 5000.0),
    "kPa":  (0.0, 1000.0),
}

# Labels whose parenthetical IS an option list rather than a unit.
OPTION_PAT = re.compile(r"\(([^)]*/[^)]*)\)\s*$")


def sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def infer_unit(pid: str, mtype: str):
    tokens = pid.lower().split("_")
    if mtype != "number":
        return None
    for tok, unit in UNIT_RULES:
        if tok in tokens or any(tok in t for t in tokens):
            return unit
    return None


def infer_input(pid: str, mtype: str, label: str):
    """Returns (input_type, options_json_or_None)."""
    m = OPTION_PAT.search(label)
    if m and mtype != "number":
        opts = [o.strip() for o in m.group(1).split("/") if o.strip()]
        if 2 <= len(opts) <= 6:
            return "select", json.dumps(opts)
    low = pid.lower()
    if mtype == "number":
        return "number", None
    if "time" in low.split("_"):
        return "time", None
    return "text", None


def main():
    if not os.path.isdir(SITES):
        sys.exit(f"blueprint directory not found: {SITES}")

    blueprints = sorted(f for f in os.listdir(SITES) if f.endswith("_blueprint.json"))
    if not blueprints:
        sys.exit("no *_blueprint.json files found")

    rows = []
    stats = Counter()
    per_site = Counter()

    for fname in blueprints:
        bp = json.load(open(os.path.join(SITES, fname), encoding="utf-8"))
        site_code = bp.get("site_code")
        for eq in bp.get("equipment", []):
            for order, m in enumerate(eq.get("metrics", [])):
                pid   = m["id"]
                label = m.get("label", pid)
                mtype = m.get("type", "number")

                unit  = infer_unit(pid, mtype)
                itype, options = infer_input(pid, mtype, label)

                # A textual token overrides a numeric-looking id: "dg_1_run_time"
                # is a clock reading, not a duration in hours.
                if any(t in pid.lower().split("_") for t in TEXTUAL):
                    if mtype == "number" and unit in (None, "hr"):
                        pass  # run-hours really are numeric; keep the unit
                    elif mtype != "number":
                        unit = None

                lo = hi = None
                if unit in RANGE_BY_UNIT and mtype == "number":
                    lo, hi = RANGE_BY_UNIT[unit]

                dtype = "number" if mtype == "number" else "string"

                rows.append({
                    "site_code":     site_code,
                    "equipment_id":  eq["id"],
                    "parameter_name": pid,
                    "display_label": label,
                    "data_type":     dtype,
                    "unit":          unit,
                    "min_value":     lo,
                    "max_value":     hi,
                    "input_type":    itype,
                    "options":       options,
                    "frequency":     m.get("frequency"),
                    "carry_forward": bool(m.get("carry_forward", False)),
                    "default_value": (str(m["default_value"]) if m.get("default_value") is not None else None),
                    "is_constant":   bool(m.get("is_constant", False)),
                    "display_order": order,
                })
                stats[unit or "(no unit)"] += 1
                stats["type:" + itype] += 1
                per_site[site_code] += 1

    print(f"blueprints : {', '.join(blueprints)}")
    print(f"parameters : {len(rows)}")
    for s, c in per_site.items():
        print(f"   {s}: {c}")
    print("\nunits inferred:")
    for u, c in sorted(stats.items()):
        if not u.startswith("type:"):
            print(f"   {u:12} x{c}")
    print("\ninput types:")
    for u, c in sorted(stats.items()):
        if u.startswith("type:"):
            print(f"   {u[5:]:12} x{c}")

    # ── Emit ─────────────────────────────────────────────────────────────────
    L = []
    L.append("-- ═══════════════════════════════════════════════════════════════════════════")
    L.append("-- 20260816_seed_blueprint_parameters.sql")
    L.append("-- GENERATED by scripts/extract_blueprint_parameters.py — do not hand-edit.")
    L.append("--")
    L.append("-- The parameter definitions previously locked inside")
    L.append("-- src/config/sites/*_blueprint.json, as database rows. Once Stage 6b reads")
    L.append("-- from these, adding a parameter is an INSERT rather than a redeploy.")
    L.append("--")
    L.append(f"-- {len(rows)} parameters across {len(per_site)} site blueprint(s).")
    L.append("--")
    L.append("-- Units are inferred from tokens in the parameter id, NOT from the label's")
    L.append("-- trailing parenthesis — across this blueprint those are overwhelmingly")
    L.append("-- qualifiers ('Set' x81, 'Actual' x54) and phase designators, not units.")
    L.append("-- Where the signal is ambiguous the unit is left NULL: a missing unit is")
    L.append("-- recoverable, a wrong one silently corrupts every conversion downstream.")
    L.append("-- ═══════════════════════════════════════════════════════════════════════════")
    L.append("")
    L.append("BEGIN;")
    L.append("")
    L.append("CREATE TEMP TABLE _bp(")
    L.append("  site_code text, equipment_id text, parameter_name text, display_label text,")
    L.append("  data_type text, unit text, min_value double precision, max_value double precision,")
    L.append("  input_type text, options jsonb, frequency text, carry_forward boolean,")
    L.append("  default_value text, is_constant boolean, display_order int")
    L.append(") ON COMMIT DROP;")
    L.append("")
    L.append("INSERT INTO _bp VALUES")
    vals = []
    for r in rows:
        vals.append("  (" + ", ".join([
            sql(r["site_code"]), sql(r["equipment_id"]), sql(r["parameter_name"]),
            sql(r["display_label"]), sql(r["data_type"]), sql(r["unit"]),
            sql(r["min_value"]), sql(r["max_value"]), sql(r["input_type"]),
            (sql(r["options"]) + "::jsonb") if r["options"] else "NULL",
            sql(r["frequency"]), sql(r["carry_forward"]), sql(r["default_value"]),
            sql(r["is_constant"]), sql(r["display_order"]),
        ]) + ")")
    L.append(",\n".join(vals) + ";")
    L.append("")
    L.append("-- Only for equipment that actually exists at that site. A blueprint entry")
    L.append("-- with no matching registry row is reported below rather than silently lost.")
    L.append("INSERT INTO public.equipment_parameters")
    L.append("  (equipment_id, parameter_name, display_label, data_type, unit,")
    L.append("   min_value, max_value, input_type, options, frequency, carry_forward,")
    L.append("   default_value, is_constant, display_order, is_required, is_graphable, is_active)")
    L.append("SELECT b.equipment_id, b.parameter_name, b.display_label,")
    L.append("       b.data_type::public.parameter_data_type, b.unit,")
    L.append("       b.min_value, b.max_value, b.input_type, b.options, b.frequency,")
    L.append("       b.carry_forward, b.default_value, b.is_constant, b.display_order,")
    L.append("       false, (b.data_type = 'number'), true")
    L.append("  FROM _bp b")
    L.append("  JOIN public.sites s ON s.site_code = b.site_code")
    L.append("  JOIN public.equipment_registry e")
    L.append("    ON e.equipment_id = b.equipment_id AND e.site_uuid = s.id")
    L.append("ON CONFLICT (equipment_id, parameter_name) WHERE equipment_id IS NOT NULL")
    L.append("DO UPDATE SET display_label = EXCLUDED.display_label,")
    L.append("              unit          = EXCLUDED.unit,")
    L.append("              min_value     = EXCLUDED.min_value,")
    L.append("              max_value     = EXCLUDED.max_value,")
    L.append("              input_type    = EXCLUDED.input_type,")
    L.append("              options       = EXCLUDED.options,")
    L.append("              frequency     = EXCLUDED.frequency,")
    L.append("              carry_forward = EXCLUDED.carry_forward,")
    L.append("              default_value = EXCLUDED.default_value,")
    L.append("              display_order = EXCLUDED.display_order;")
    L.append("")
    L.append("DO $$")
    L.append("DECLARE v_in int; v_orphan int; v_sample text;")
    L.append("BEGIN")
    L.append("  SELECT count(*) INTO v_in FROM public.equipment_parameters WHERE equipment_id IS NOT NULL;")
    L.append("  SELECT count(*) INTO v_orphan FROM _bp b")
    L.append("    LEFT JOIN public.sites s ON s.site_code = b.site_code")
    L.append("    LEFT JOIN public.equipment_registry e")
    L.append("      ON e.equipment_id = b.equipment_id AND e.site_uuid = s.id")
    L.append("   WHERE e.equipment_id IS NULL;")
    L.append("  IF v_orphan > 0 THEN")
    L.append("    SELECT string_agg(DISTINCT b.equipment_id, ', ') INTO v_sample FROM _bp b")
    L.append("      LEFT JOIN public.sites s ON s.site_code = b.site_code")
    L.append("      LEFT JOIN public.equipment_registry e")
    L.append("        ON e.equipment_id = b.equipment_id AND e.site_uuid = s.id")
    L.append("     WHERE e.equipment_id IS NULL;")
    L.append("    RAISE NOTICE 'SKIPPED % parameter(s): no matching equipment for %', v_orphan, left(v_sample, 300);")
    L.append("  END IF;")
    L.append("  RAISE NOTICE 'Parameter registry now holds % instance-level definition(s).', v_in;")
    L.append("END $$;")
    L.append("")
    L.append("COMMIT;")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print(f"\nwrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
