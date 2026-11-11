import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { FRAMEWORK_PROOF_ART } from "../showcases/art/proof-art.js";
import { VueWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import artStylesheet from "../showcases/art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import bandStylesheet from "../styles/showcases/workbench-band.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import vueWorkbenchStylesheet from "@docs/styles/vue-workbench.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Reject a protected workbook edit, inspect the exact policy issue, authorize the finance role, and commit the same mutation through Vue-owned state.";

export const Route = createFileRoute("/vue")({
  head: () => ({
    meta: pageMeta("Vue business workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      { rel: "stylesheet", href: vueWorkbenchStylesheet },
      { rel: "stylesheet", href: bandStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: VueRoute,
});

function VueRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        proofArt={FRAMEWORK_PROOF_ART}
        description={description}
        eyebrow="VUE / BUSINESS WORKFLOW"
        framework="vue"
        guide="/docs/frameworks/vue/"
        packageName="@sheetwrite/vue"
        prompt="Attempt the protected G1 edit in the Total column as Reviewer. Inspect the rejection, authorize Finance lead, then commit the same edit."
        proof={[
          {
            title: "Policy result beside the mutation",
            detail:
              "The selected cell, access rule, rejection, role change, and accepted commit stay in one causal view.",
          },
          {
            title: "Vue-native authority",
            detail:
              "Reactive props drive the published adapter while every workbook change crosses the real Grid API.",
          },
          {
            title: "Attached workbook tools",
            detail:
              "The selected-cell note editor and adapter event feed stay accessible while native tabs own sheet lifecycle.",
          },
          {
            title: "Host acknowledgement",
            detail: "Accepted edits enter the real pending queue before the host version advances.",
          },
        ]}
        sourcePath="docs/src/showcases/VueWorkbench.ts"
        title="A governed edit, from rejection to commit."
      >
        <Island component={VueWorkbenchIsland} name="workbench-vue" props={{}} />
      </FrameworkPage>
    </NoHydration>
  );
}
