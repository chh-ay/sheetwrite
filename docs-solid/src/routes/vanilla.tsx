import { pageMeta } from "@docs/lib/seo.js";
import { ENGINE_ROWS } from "@docs/showcases/scenarios/engine.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { VANILLA_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";
import { VanillaWorkbench } from "../showcases/frameworks/vanilla/VanillaWorkbench.js";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import vanillaStylesheet from "@docs/styles/vanilla-workbench.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Edit a revenue pipeline with the core Grid API: switch the renderer, load rows from a paged source, and import or export a workbook.";

export const Route = createFileRoute("/vanilla")({
  head: () => ({
    meta: pageMeta("Vanilla engine workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      { rel: "stylesheet", href: vanillaStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: VanillaRoute,
});

function VanillaRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        description={description}
        eyebrow="VANILLA / ENGINE WORKBENCH"
        framework="vanilla"
        guide="/docs/frameworks/vanilla/"
        packageName="@sheetwrite/core"
        proofArt={VANILLA_PROOF_ART}
        prompt="Edit a Close date cell, switch Main thread to Web Worker, then destroy and create the Grid. Host state shows each ownership boundary."
        proof={[
          {
            title: "Explicit lifecycle",
            detail:
              "createWorkbench and destroy() bound every generation: no listeners, chrome, or canvas survive teardown.",
          },
          {
            title: "Construction-bound truth",
            detail:
              "Renderer and data path rebuild the grid and live in the URL; read-only flips on the running instance.",
          },
          {
            title: "Host-owned paging",
            detail:
              "The page source, its latency, and its abort path are host code; allocation stats read back from the store.",
          },
          {
            title: "Honest Worker fallback",
            detail:
              "A failed Worker boot emits renderer-fallback and keeps painting on the main thread. Requested and active renderers are always visible.",
          },
        ]}
        sourcePath="docs/src/showcases/vanilla-workbench.ts"
        title="Control the Grid lifecycle."
      >
        <Island
          component={VanillaWorkbench}
          name="workbench-vanilla"
          props={{ rows: ENGINE_ROWS }}
        />
      </FrameworkPage>
    </NoHydration>
  );
}
