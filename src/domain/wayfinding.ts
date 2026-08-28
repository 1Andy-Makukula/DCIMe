import type { DbCategory } from "@/domain/categories";

// ─────────────────────────────────────────────────────────────────────────────
// WAYFINDING — one signature colour per subject, used everywhere that subject
// appears.
//
// WHY
// The platform was grey because STATUS had claimed the whole colour budget.
// Red, amber and green were the only colours in the product, so nothing else
// could be coloured without reading as an alarm — and a screen where the only
// colour is an alarm is a screen where everything looks equally important,
// which is the same as nothing looking important.
//
// This is a second, independent channel. Status answers IS IT WELL. Wayfinding
// answers WHAT IS IT. Once cyan always means the air conditioning and violet
// always means the UPS, a reader stops parsing labels to work out where they
// are — the colour has already told them, before they read a word.
//
// THE RULE THAT KEEPS THE CHANNELS APART
// Domain colour appears ONLY as an icon or a thin rail — identity at the edge
// of a component. Status owns the filled chip and the figure itself. So a
// coloured rail can never be read as a verdict, whatever its hue, and a wall
// of tiles never becomes a wall of red.
//
// Colour is never the only signal either: every domain also carries its name
// and its own icon. The palette accelerates people who can use it and costs
// nothing to people who cannot.
//
// WHY THE CLASS NAMES ARE WRITTEN OUT IN FULL
// Tailwind scans source text. `text-domain-${id}` is invisible to it and the
// utility is never generated, so the colour silently does not appear. Every
// class below is therefore a literal string.
// ─────────────────────────────────────────────────────────────────────────────

export type DomainId =
  | "thermal" | "utility" | "generator" | "ups"
  | "rectifier" | "load" | "safety" | "people";

export interface DomainTone {
  /** The icon itself. */
  icon: string;
  /** A soft backing behind the icon. */
  iconBg: string;
  /** A thin rail along a tile or card — the identity stripe. */
  rail: string;
  /** A border in the domain hue, for a selected or active card. */
  border: string;
  /** The raw token, for charts and canvas which need a value not a class. */
  token: string;
}

export const DOMAIN_TONE: Record<DomainId, DomainTone> = {
  thermal: {
    icon:   "text-domain-thermal",
    iconBg: "bg-domain-thermal-soft",
    rail:   "bg-domain-thermal",
    border: "border-domain-thermal",
    token:  "var(--color-domain-thermal)"
  },
  utility: {
    icon:   "text-domain-utility",
    iconBg: "bg-domain-utility-soft",
    rail:   "bg-domain-utility",
    border: "border-domain-utility",
    token:  "var(--color-domain-utility)"
  },
  generator: {
    icon:   "text-domain-generator",
    iconBg: "bg-domain-generator-soft",
    rail:   "bg-domain-generator",
    border: "border-domain-generator",
    token:  "var(--color-domain-generator)"
  },
  ups: {
    icon:   "text-domain-ups",
    iconBg: "bg-domain-ups-soft",
    rail:   "bg-domain-ups",
    border: "border-domain-ups",
    token:  "var(--color-domain-ups)"
  },
  rectifier: {
    icon:   "text-domain-rectifier",
    iconBg: "bg-domain-rectifier-soft",
    rail:   "bg-domain-rectifier",
    border: "border-domain-rectifier",
    token:  "var(--color-domain-rectifier)"
  },
  load: {
    icon:   "text-domain-load",
    iconBg: "bg-domain-load-soft",
    rail:   "bg-domain-load",
    border: "border-domain-load",
    token:  "var(--color-domain-load)"
  },
  safety: {
    icon:   "text-domain-safety",
    iconBg: "bg-domain-safety-soft",
    rail:   "bg-domain-safety",
    border: "border-domain-safety",
    token:  "var(--color-domain-safety)"
  },
  people: {
    icon:   "text-domain-people",
    iconBg: "bg-domain-people-soft",
    rail:   "bg-domain-people",
    border: "border-domain-people",
    token:  "var(--color-domain-people)"
  }
};

/**
 * Anything with no domain — a mixed room, an unrecognised category.
 *
 * Neutral rather than a spare colour: inventing a hue for "several things at
 * once" would put a confident signature on a card whose whole point is that it
 * does not have one.
 */
export const DOMAIN_NEUTRAL: DomainTone = {
  icon:   "text-neutral-400",
  iconBg: "bg-neutral-100",
  rail:   "bg-neutral-300",
  border: "border-neutral-300",
  token:  "var(--color-neutral-400)"
};

/**
 * Registry category → domain.
 *
 * Deliberately the same grouping as CATEGORIES in domain/categories.ts, whose
 * ids these keys match. A second, different grouping would mean an air
 * conditioner could be cyan on one screen and something else on another.
 */
const BY_DB_CATEGORY: Record<DbCategory, DomainId> = {
  AIRCON:           "thermal",
  ENVIRONMENT:      "thermal",
  MAINS:            "utility",
  SWITCHGEAR:       "utility",
  GENERATOR:        "generator",
  FUEL_LOGISTICS:   "generator",
  UPS:              "ups",
  RECTIFIER:        "rectifier",
  IT_LOAD:          "load",
  FIRE_SUPPRESSION: "safety",
  SAFETY:           "safety"
};

/** The domain for a registry category, or null where it is unrecognised. */
export function domainOfCategory(dbCategory: string | null | undefined): DomainId | null {
  if (!dbCategory) return null;
  return BY_DB_CATEGORY[dbCategory.toUpperCase() as DbCategory] ?? null;
}

/** The tone for a browsable category id — the ids used in CATEGORIES. */
export function toneOfDomain(id: string | null | undefined): DomainTone {
  if (!id) return DOMAIN_NEUTRAL;
  return DOMAIN_TONE[id as DomainId] ?? DOMAIN_NEUTRAL;
}

/** The tone for a raw registry category, resolved through its domain. */
export function toneOfCategory(dbCategory: string | null | undefined): DomainTone {
  const domain = domainOfCategory(dbCategory);
  return domain ? DOMAIN_TONE[domain] : DOMAIN_NEUTRAL;
}

/**
 * The one domain a mixed set belongs to, or null when it is genuinely mixed.
 *
 * A room holding seven air conditioners is a thermal room and is coloured as
 * one. A room holding a UPS, a rectifier and two air conditioners is not any
 * of them, and colouring it after whichever happened to be most numerous would
 * be a confident claim about a room that does not have a single subject.
 */
export function dominantDomain(
  categories: readonly (string | null | undefined)[]
): DomainId | null {
  const seen = new Set<DomainId>();
  for (const c of categories) {
    const d = domainOfCategory(c);
    if (d) seen.add(d);
  }
  return seen.size === 1 ? [...seen][0] : null;
}
