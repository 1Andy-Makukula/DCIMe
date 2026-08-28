// ─────────────────────────────────────────────────────────────────────────────
// Which 3D model stands for a category of thing.
//
// ONE MODEL PER CATEGORY, NOT PER MACHINE
// There are four generators on site and one generator model. The model says
// "this is a generator" — it is identity, not portraiture, and the readings
// underneath it stay per-machine. Modelling DG-1 separately from DG-2 would
// quadruple the download to draw four identical boxes and tell a reader nothing
// the label does not already say.
//
// This module is deliberately free of any WebGL dependency. It answers what to
// load and what it costs; the renderer decides how. That keeps the mapping
// testable, lets screens decide whether to show a model at all before pulling
// in a loader, and means adding a category here does not touch the viewer.
//
// A CATEGORY WITH NO MODEL GETS NO MODEL
// modelFor() returns null rather than the nearest lookalike. A fuel tank drawn
// as a generator is a confident lie about what a reader is looking at, and the
// screens already fall back to a lucide icon, which claims nothing.
// ─────────────────────────────────────────────────────────────────────────────

import type { DbCategory } from "@/domain/categories";

export interface AssetModel {
  /** Public URL. These are served as static files, never from the database. */
  url: string;
  /** Bytes on disk, so a caller can decide whether to defer or preload. */
  bytes: number;
  /** What the model depicts, for alt text and the loading state. */
  label: string;
  /**
   * True where the file is too large to sit in a grid of cards as-is.
   *
   * rack.glb is 20 MB — roughly fourteen times the next largest — and a room of
   * racks would be a hundred megabytes before a single reading is drawn. It is
   * fine in a single detail viewport and must not be used at overview scale
   * until it has been through Draco or meshopt compression.
   */
  heavy: boolean;
}

const BASE = "/models/assets";

/** 8 MB: above this a model cannot be shown in a grid of category cards. */
const HEAVY_BYTES = 8_000_000;

const model = (file: string, bytes: number, label: string): AssetModel => ({
  url: `${BASE}/${file}`,
  bytes,
  label,
  heavy: bytes > HEAVY_BYTES
});

/**
 * The models on disk, keyed by what they depict.
 *
 * Sizes are recorded rather than fetched: a screen needs to know the cost
 * BEFORE it decides to load, and a HEAD request to find out defeats the point.
 * They are checked by the assetModels test, which fails if a file is replaced
 * with one of a materially different size.
 */
export const MODELS = {
  crac:       model("crac.glb",         733_160, "Precision air conditioner"),
  fm200:      model("fm200.glb",        923_572, "FM-200 suppression cylinder"),
  generator:  model("generator.glb",  1_622_636, "Standby generator"),
  mains:      model("mains.glb",        579_728, "Mains supply panel"),
  rack:       model("rack.glb",      20_389_204, "Server rack"),
  rectifier:  model("rectifier.glb",  2_482_008, "DC rectifier"),
  sensor:     model("sensor.glb",       291_872, "Environment sensor"),
  ups:        model("ups.glb",          776_892, "UPS"),
  technician: model("technician.glb", 1_192_744, "Technician")
} as const;

export type ModelKey = keyof typeof MODELS;

/**
 * Registry category → model.
 *
 * SWITCHGEAR shares the mains panel: both are the incoming supply as a person
 * meets it at the wall, and no separate switchgear model exists.
 *
 * FUEL_LOGISTICS is absent on purpose. It covers tanks, deliveries and bowsers,
 * and the only near-match on disk is the generator that burns the fuel — which
 * would put an engine on screen where a reader expects a tank.
 */
const BY_CATEGORY: Partial<Record<DbCategory, ModelKey>> = {
  AIRCON:           "crac",
  GENERATOR:        "generator",
  UPS:              "ups",
  RECTIFIER:        "rectifier",
  MAINS:            "mains",
  SWITCHGEAR:       "mains",
  IT_LOAD:          "rack",
  ENVIRONMENT:      "sensor",
  FIRE_SUPPRESSION: "fm200",
  SAFETY:           "fm200"
};

/** The model for a registry category, or null where none depicts it. */
export function modelFor(category: string | null | undefined): AssetModel | null {
  if (!category) return null;
  const key = BY_CATEGORY[category.toUpperCase() as DbCategory];
  return key ? MODELS[key] : null;
}

/**
 * People get one model too.
 *
 * Technicians and contractors share it. The difference between them is what
 * they are permitted to do and who employs them — neither of which is visible
 * in a silhouette, so two models would be two downloads to draw the same
 * person. Screens distinguish them with a label and a badge, which is where the
 * distinction actually lives.
 */
export const PERSON_MODEL: AssetModel = MODELS.technician;

/**
 * Every distinct model a set of categories needs, deduplicated.
 *
 * A room holding three air conditioners and two rectifiers loads two models,
 * not five. Callers preloading a screen should ask for this rather than mapping
 * over their assets, or the same file is requested once per machine.
 */
export function modelsFor(categories: readonly (string | null | undefined)[]): AssetModel[] {
  const seen = new Map<string, AssetModel>();
  for (const c of categories) {
    const m = modelFor(c);
    if (m && !seen.has(m.url)) seen.set(m.url, m);
  }
  return [...seen.values()];
}

/** Total bytes a screen would pull, for deciding whether to defer the load. */
export function weightOf(models: readonly AssetModel[]): number {
  return models.reduce((n, m) => n + m.bytes, 0);
}
