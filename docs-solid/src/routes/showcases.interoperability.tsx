import compatibilityData from "@docs/generated/compatibility.json";
import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { InteropFlowDiagram } from "../art/diagrams.js";
import { Island } from "../islands/Island.js";
import { InteropStage } from "../showcases/interop/InteropStage.js";
import { InteropLabs } from "../showcases/interop/labs/InteropLabs.js";
import { SpillProof } from "../showcases/interop/SpillProof.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import {
  ADVERSARIAL_FIXTURES,
  POSITIVE_FIXTURES,
} from "../showcases/scenarios/interop-fixtures.js";
import InteroperabilitySnippet from "../showcases/snippets/interoperability.mdx";
import InteroperabilitySnippetSource from "../showcases/snippets/interoperability.mdx?source";

import artStylesheet from "../art/art.css?url";
import stylesheet from "../styles/showcases/interoperability.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

const description =
  "XLSX round-trips, independent fixture files, CSV/TSV, fidelity warnings and resource limits, all running Sheetwrite's published APIs in your browser.";

export const Route = createFileRoute("/showcases/interoperability")({
  head: () => ({
    meta: pageMeta("Spreadsheet interoperability — Sheetwrite showcases", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: InteroperabilityShowcase,
});

function InteroperabilityShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{
          title: "The code behind it",
          Snippet: InteroperabilitySnippet,
          source: InteroperabilitySnippetSource,
        }}
        explain={
          <ShowcaseSection
            figure={<InteropFlowDiagram />}
            id="interoperability-flow"
            title="Where a file goes, and where it stops"
          >
            <p>
              An XLSX file goes through unzip with limits, then XML parsing, into a workbook the
              grid shows. A hostile or oversized file stops at unzip or parsing with a typed error,{" "}
              <code>xlsx-import-failed</code> or <code>xlsx-resource-limit</code>, and nothing is
              imported.
            </p>
            <p>
              Export writes XLSX, CSV or TSV. Import and export both list anything not kept, by code
              and cell.
            </p>
          </ShowcaseSection>
        }
        eyebrow="Spreadsheet interoperability"
        facts={[
          { label: "Source workbooks", value: POSITIVE_FIXTURES.length.toLocaleString("en") },
          { label: "Hostile inputs", value: ADVERSARIAL_FIXTURES.length.toLocaleString("en") },
          {
            label: "Compatibility records",
            value: compatibilityData.records.length.toLocaleString("en"),
          },
        ]}
        guide={{
          href: "/docs/import-export/xlsx-export/",
          label: "Read the XLSX interchange guide",
        }}
        id="interoperability"
        stage={<Island component={InteropStage} name="showcase-interop" props={{}} />}
        task="Load a workbook into a live grid, change it, then export it to XLSX, import it again and compare every cell."
        title="Open the workbook. Change it. Bring it back intact."
      >
        <Island component={SpillProof} name="showcase-interop-spill" props={{}} />
        {/* The labs sit below the stage: their code (the checked compatibility
            results among it) loads when the reader reaches for them. */}
        <Island
          component={InteropLabs}
          hydrate="interaction"
          hydrateAtLoadWith="compatibility"
          name="showcase-interop-labs"
          props={{}}
        />
      </ShowcasePage>
    </NoHydration>
  );
}
