// src/config/sites/index.ts
//
// What remains of the site configuration after V2.1 Stage 1.
//
// This file used to export SITE_BLUEPRINTS — two JSON documents describing 47
// assets, 14 rooms, 324 readings and the walking round, and the only place any
// of that existed. equipment_parameters had been built to hold it and was never
// loaded, so the file was the live source for the technician's whole capture
// path.
//
// It is all in the database now: the registry holds the assets and their
// readings, `rooms` holds the rooms, `walking_path` holds the round, and
// `parameter_excel_targets` holds where each reading lands in the workbooks.
// src/shared/api/siteModel.ts serves them in the shape the screens expect.
//
// The blueprints are in git history if a value ever needs re-deriving, and
// 20260837_registry_seed.sql writes every one of them out in full.

/**
 * Used when site context has not resolved yet — for a cache key or a filename,
 * never to decide what equipment exists. A site with no rows in the registry
 * has no equipment, and quietly borrowing another site's was the bug that made
 * SANDBOX show Site 1's assets.
 */
export const DEFAULT_SITE_CODE = "SITE_01";
