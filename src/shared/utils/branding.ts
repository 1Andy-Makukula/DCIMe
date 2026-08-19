// src/shared/utils/branding.ts
// Single source of truth for customer-facing naming.
//
// Internal identifiers (sites.site_code values, telemetry asset_ids) are wire
// values matched against rows already in the database — they are deliberately
// NOT renamed here. Everything the operator actually reads on screen, in an
// export filename or in a WhatsApp report resolves through this module.

export const BRAND_NAME = "Sintech";
export const PRODUCT_NAME = "DCIMe";
export const BRAND_PRODUCT = `${BRAND_NAME} ${PRODUCT_NAME}`;
export const BRAND_EMAIL_DOMAIN = "sintech.zm";
export const PRODUCT_TAGLINE = `${BRAND_NAME} Data Center Management Engine`;

/**
 * The wordmark, split where it is styled.
 *
 * It renders as "DCIMe_Engine" with the suffix in the brand colour, and was
 * hand-written as JSX in four separate layouts — so renaming the product meant
 * finding all four. Consumers use <Wordmark/> from @/shared/ui instead.
 */
export const PRODUCT_STEM   = PRODUCT_NAME;   // "DCIMe"
export const PRODUCT_SUFFIX = "_Engine";
export const PRODUCT_WORDMARK = `${PRODUCT_STEM}${PRODUCT_SUFFIX}`;

/**
 * The electricity utility feeding the sites.
 *
 * The build named a specific national operator throughout the UI, which ties a
 * generic product to one country's deployment. The label is presentation only:
 * the WIRE VALUE in telemetry_logs.active_power_source is still 'ZESCO' for
 * historical rows, and whatsappReportFormatter still accepts it as an input —
 * renaming that requires a data migration, not a string change.
 */
export const UTILITY_NAME       = "Utility";
export const UTILITY_GRID_LABEL = `${UTILITY_NAME} Grid`;
export const UTILITY_MAINS_LABEL = `${UTILITY_NAME.toUpperCase()} MAINS`;

/**
 * telemetry_logs.asset_id the daily checklist is archived under.
 *
 * Renamed from the original operator-specific value by
 * 20260825_neutral_identifiers.sql, which moves the existing rows across at the
 * same time. Code and data must change together — either alone leaves the
 * application searching for an id that no longer exists.
 */
export const DAILY_CHECKLIST_ASSET_ID = "DAILY_CHECKLIST";
export const DAILY_CHECKLIST_LABEL = "DAILY_CHECKLIST";

/** Internal site_code -> presentation label. */
export const SITE_LABELS: Record<string, string> = {
  SITE_01: "Site 1",
  SITE_02: "Site 2",
  SITE_03: "Site 3"
};

export const DEFAULT_SITE_LABEL = SITE_LABELS.SITE_01;

const SITE_PATTERNS = Object.entries(SITE_LABELS).map(([code, label]) => ({
  label,
  re: new RegExp(`\\b${code}\\b`, "i")
}));

/**
 * Resolve anything that identifies a site — a site_code ("SITE_02"), a stored
 * site_name ("Site 1") or a legacy free-text site_id — to its
 * generic presentation label.
 *
 * Unknown values pass through unchanged so sites added later still render
 * their own name instead of collapsing onto the fallback.
 */
export function siteLabel(
  value?: string | null,
  fallback: string = DEFAULT_SITE_LABEL
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const direct = SITE_LABELS[trimmed.toUpperCase()];
  if (direct) return direct;

  const matched = SITE_PATTERNS.find(p => p.re.test(trimmed));
  return matched ? matched.label : trimmed;
}

/** Filesystem-safe variant for export filenames ("Site 1" -> "Site_1"). */
export function siteFileLabel(value?: string | null): string {
  return siteLabel(value).replace(/\s+/g, "_");
}
