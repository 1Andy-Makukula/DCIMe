// src/config/sites/index.ts
//
// Site blueprints, keyed by site_code. The keys must match sites.site_code in
// the database — a mismatch silently falls back to the first blueprint, which
// renders a facility that does not exist.
import site01Blueprint from "./SITE_01_blueprint.json";
import site02Blueprint from "./SITE_02_blueprint.json";

export const SITE_BLUEPRINTS: Record<string, any> = {
  SITE_01: site01Blueprint,
  SITE_02: site02Blueprint
};

/** Used when site context has not resolved yet. */
export const DEFAULT_SITE_CODE = "SITE_01";

export type SiteCode = keyof typeof SITE_BLUEPRINTS;
