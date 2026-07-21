// src/config/sites/index.ts
import ntcBlueprint from "./NTC_blueprint.json";
import wtcBlueprint from "./WTC_blueprint.json";

export const SITE_BLUEPRINTS: Record<string, any> = {
  NTC: ntcBlueprint,
  WTC: wtcBlueprint
};

export type SiteCode = keyof typeof SITE_BLUEPRINTS;
