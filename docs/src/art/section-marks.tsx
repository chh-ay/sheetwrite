// Section marks for the docs tabs' landing pages (Guides, API reference,
// Formulas, Changelog): one 48-unit mark each, shown only in that page's
// header, so no other page carries their bytes. Colours are site tokens.
import type { JSX } from "solid-js";

/** The landing pages that show a section mark. */
export type SectionMarkName = "guides" | "api" | "formulas" | "changelog";

// Every mark draws on one grid: a 40-unit tile from 4 to 44, its picture
// inside 12–36 on both axes so it sits on the tile's optical centre, and
// 2-unit strokes (1.5 only for the formula grid's inner rules).
const MARK_MARKUP: Readonly<Record<SectionMarkName, string>> = {
  guides: `<rect x="4" y="4" width="40" height="40" rx="10" style="fill:var(--sw-accent-soft)"/><path d="M13 12h12l6 6v18H13z" style="fill:var(--sw-surface-1);stroke:currentColor;stroke-width:2;stroke-linejoin:round"/><path d="M25 12v6h6M17 24h9M17 29h6" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"/><path d="M27 31l3 3 5-6" style="fill:none;stroke:var(--sw-accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/>`,
  api: `<rect x="4" y="4" width="40" height="40" rx="10" style="fill:var(--sw-info-soft)"/><path d="M19 15c-4 0-4 3-4 6s-2 3-3 3c1 0 3 0 3 3s0 6 4 6M29 15c4 0 4 3 4 6s2 3 3 3c-1 0-3 0-3 3s0 6-4 6" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"/><circle cx="24" cy="24" r="3" style="fill:var(--sw-info)"/>`,
  formulas: `<rect x="4" y="4" width="40" height="40" rx="10" style="fill:var(--sw-violet-soft)"/><rect x="12" y="13" width="24" height="22" rx="3" style="fill:var(--sw-surface-1);stroke:currentColor;stroke-width:2"/><path d="M12 20h24M20 13v22" style="fill:none;stroke:currentColor;stroke-width:1.5"/><rect x="22.5" y="22.5" width="11" height="10" rx="1" style="fill:none;stroke:var(--sw-violet);stroke-width:2;stroke-dasharray:3 2"/><path d="M14.5 16.5h3" style="stroke:var(--sw-violet);stroke-width:2;stroke-linecap:round"/>`,
  changelog: `<rect x="4" y="4" width="40" height="40" rx="10" style="fill:var(--sw-warning-soft)"/><path d="M17 15v18" style="stroke:currentColor;stroke-width:2;stroke-linecap:round"/><circle cx="17" cy="15" r="2.5" style="fill:var(--sw-warning);stroke:var(--sw-warning);stroke-width:2"/><circle cx="17" cy="24" r="2.5" style="fill:var(--sw-surface-1);stroke:currentColor;stroke-width:2"/><circle cx="17" cy="33" r="2.5" style="fill:var(--sw-surface-1);stroke:currentColor;stroke-width:2"/><path d="M24 15h11M24 24h8M24 33h10" style="stroke:currentColor;stroke-width:2;stroke-linecap:round"/>`,
};

/** A section mark: decorative, sized by its box (2.5rem in the page header). */
export function SectionMark(props: Readonly<{ name: SectionMarkName }>): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      class="sw-section-mark"
      focusable="false"
      innerHTML={MARK_MARKUP[props.name]}
      viewBox="0 0 48 48"
    />
  );
}
