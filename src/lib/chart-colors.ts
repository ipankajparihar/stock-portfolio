import { HOLDINGS } from "@/data/holdings";

/**
 * Categorical colours for sectors.
 *
 * ## Why these five hues
 * Slots are taken in a fixed, validated order. Green and red are deliberately *excluded*
 * from the categorical set: in this app they are status colours (gain/loss), and a status
 * colour must never double as a series identity — a green "Technology" segment sitting
 * above a green "profit" figure invites exactly the wrong reading.
 *
 * The chosen set (blue, aqua, yellow, violet, magenta) was checked with the palette
 * validator against this app's actual surfaces rather than judged by eye:
 *
 *   light (#ffffff): lightness band PASS · chroma floor PASS · worst adjacent CVD ΔE 47.2
 *   dark  (#131826): lightness band PASS · chroma floor PASS · worst adjacent CVD ΔE 41.3
 *
 * Three light-mode slots fall below 3:1 contrast on white, which obliges the "relief rule":
 * the segments carry visible direct labels AND the full data table is on the same page, so
 * no value is ever encoded by colour alone.
 */

interface SectorHue {
  light: string;
  dark: string;
}

/** Fixed slot order — the CVD-safe sequence, not a cosmetic choice. */
const SECTOR_HUES: SectorHue[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
  { light: "#e87ba4", dark: "#d55181" }, // magenta
];

/**
 * The canonical sector order, derived from the order sectors first appear in the holdings
 * file — a property of the data, not of the current view.
 *
 * This matters: the dashboard sorts sectors by size, and a user can filter rows out. If
 * colour were assigned by position in the *rendered* list, filtering or re-sorting would
 * repaint the survivors and "Technology is blue" would stop being true. Colour follows the
 * entity, never its rank.
 */
const CANONICAL_SECTORS: string[] = [...new Set(HOLDINGS.map((h) => h.sector))];

/**
 * The CSS colour for a sector, as a `light-dark()`-free pair resolved at call time.
 * Returns a CSS custom property reference so the browser swaps light/dark for us.
 */
export function sectorColorVar(sector: string): string {
  return `var(--sector-${slotOf(sector)})`;
}

/** Zero-based palette slot for a sector. Sectors beyond the 5th wrap — see note below. */
function slotOf(sector: string): number {
  const index = CANONICAL_SECTORS.indexOf(sector);
  // A portfolio with more than 5 sectors would need the "Other" bucket treatment rather
  // than generated hues (a 9th generated hue is indistinguishable under CVD). With the
  // current 5 sectors this modulo never actually wraps; it exists so an added sector
  // degrades to a repeated hue rather than crashing.
  return (index === -1 ? 0 : index) % SECTOR_HUES.length;
}

/** Emitted once into the document so the vars exist for both themes. */
export function sectorColorStyles(): string {
  const light = SECTOR_HUES.map((h, i) => `--sector-${i}: ${h.light};`).join(" ");
  const dark = SECTOR_HUES.map((h, i) => `--sector-${i}: ${h.dark};`).join(" ");

  return `:root { ${light} } @media (prefers-color-scheme: dark) { :root { ${dark} } }`;
}
