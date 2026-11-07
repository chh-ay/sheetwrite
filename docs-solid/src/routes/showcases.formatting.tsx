import { pageMeta } from "@docs/lib/seo.js";
import { FORMAT_OPTIONS, STYLE_COMMANDS } from "@docs/showcases/scenarios/formatting.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { FormattingImported } from "../showcases/formatting/FormattingImported.js";
import { FONT_FAMILIES, FormattingStage } from "../showcases/formatting/FormattingStage.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import FormattingSnippet from "../showcases/snippets/formatting.mdx";

import stylesheet from "../styles/showcases/formatting.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/formatting")({
  head: () => ({
    meta: pageMeta(
      "Formatting & number formats — Sheetwrite showcases",
      "Style a live operating budget: typography, alignment, borders, conditional formatting, mixed per-cell number formats, and an executable XLSX round-trip proof.",
    ),
    links: [
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: FormattingShowcase,
});

function FormattingShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "How it is built", Snippet: FormattingSnippet }}
        eyebrow="Formatting"
        facts={[
          { label: "Number formats", value: FORMAT_OPTIONS.length.toLocaleString("en") },
          { label: "Style commands", value: STYLE_COMMANDS.length.toLocaleString("en") },
          { label: "Fonts", value: FONT_FAMILIES.length.toLocaleString("en") },
        ]}
        guide={{ href: "/docs/features/formatting/styles/", label: "Read the styling guide" }}
        id="formatting"
        stage={
          <Island
            component={FormattingStage}
            name="showcase-formatting"
            props={{
              formats: FORMAT_OPTIONS.map((option) => ({ label: option.label, code: option.code })),
              styleCommands: [...STYLE_COMMANDS],
            }}
          />
        }
        task="Shape the type of an operating budget, make its numbers legible, then prove the workbook keeps its formatting through XLSX."
        title="Formatting and number formats"
      >
        <Island component={FormattingImported} name="showcase-formatting-imported" props={{}} />
        <ShowcaseSection id="formatting-notes" title="How formatting behaves">
          <ul>
            <li>
              Georgia, Arial and Courier New coexist with the theme font, and an unavailable family
              falls back to it. The ledger also shows bold, italic, underline, strike, wrap, three
              alignments and independently styled border sides.
            </li>
            <li>
              Number formats change the display, not the stored numbers. G3 opts out of a currency
              column with General; G15 inherits the column default. Negative variances keep a minus
              sign as well as their conditional fill.
            </li>
            <li>
              The controls are host UI calling <code>grid.styleRange</code>. For independent file
              fixtures and fidelity boundaries, open{" "}
              <a href="/showcases/interoperability/">spreadsheet interoperability</a>.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
