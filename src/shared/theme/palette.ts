// ─────────────────────────────────────────────────────────────────────────────
// palette.ts — the JS-side handle on src/styles/brand.css.
//
// Tailwind classes cover markup, but charts, SVG attributes and canvas take
// colours as VALUES. Without this module those places hardcode hexes, and the
// brand stops being changeable from one place — which is exactly how #FF0000
// ended up in 105 files.
//
// Nothing here defines a colour. Every entry points at a custom property that
// brand.css owns, so editing brand.css still changes everything.
// ─────────────────────────────────────────────────────────────────────────────

type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

const ref = (role: string, shade: Shade) => `var(--color-${role}-${shade})`;

/**
 * For anything the browser resolves itself: CSS `style={{...}}` and SVG
 * presentation attributes such as recharts' `fill` / `stroke`.
 */
export const color = {
  brand:  (s: Shade = 500) => ref("brand",  s),
  danger: (s: Shade = 500) => ref("danger", s),
  warn:   (s: Shade = 500) => ref("warn",   s),
  ok:     (s: Shade = 500) => ref("ok",     s),
  info:   (s: Shade = 500) => ref("info",   s)
};

/** Categorical chart series. Position carries no severity meaning. */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--color-series-${i + 1})`);

/**
 * Resolved hex, for the places a `var()` string is not accepted —
 * canvas 2D `fillStyle`, WebGL, anything writing pixels directly.
 *
 * Reads the live computed value, so it still tracks brand.css. Cached: this
 * forces style resolution and would otherwise run on every frame.
 */
const resolved = new Map<string, string>();
export function hex(cssVar: string, fallback = "#000000"): string {
  const name = cssVar.replace(/^var\(|\)$/g, "");
  const hit = resolved.get(name);
  if (hit) return hit;
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const out = v || fallback;
  resolved.set(name, out);
  return out;
}
