// A picture in a docs page: a labelled diagram (framed, or bare inside an
// existing figure) or a section card's illustration. Pages get it from
// lib/rehype-docs-pictures.ts; the placements are in docs-pictures.ts.
import type { JSX } from "solid-js";

import { DOCS_CARD_ART, DOCS_DIAGRAMS } from "./docs-art.js";
import { MECHANISM_DIAGRAMS } from "./docs-mechanisms.js";

/** Every diagram a docs page can place, by name. */
const DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  ...DOCS_DIAGRAMS,
  ...MECHANISM_DIAGRAMS,
};

/**
 * One docs picture. `card` draws a section card's illustration in the card's
 * art box; `name` draws a diagram, in its own frame unless `bare` (the page's
 * figure frames it).
 */
export default function DocsPicture(
  props: Readonly<{ name?: string; card?: string; bare?: string }>,
): JSX.Element {
  if (props.card !== undefined) {
    const Card = DOCS_CARD_ART[props.card];
    if (Card === undefined) throw new Error(`No docs card art named "${props.card}"`);
    return <Card class="sw-card__art" />;
  }
  const Diagram = props.name === undefined ? undefined : DIAGRAMS[props.name];
  if (Diagram === undefined) throw new Error(`No docs diagram named "${props.name}"`);
  return props.bare === "true" ? (
    <Diagram />
  ) : (
    <figure class="sw-art-figure">
      <Diagram />
    </figure>
  );
}
