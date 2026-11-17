import { pageMeta } from "@docs/lib/seo.js";
import VueSnippet from "@docs/showcases/snippets/vue-workbench.mdx";
import VueSnippetSource from "@docs/showcases/snippets/vue-workbench.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { FRAMEWORK_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { VueWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { type FrameworkPanel, FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";
import vueWorkbenchStylesheet from "@docs/styles/vue-workbench.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Reject a protected workbook edit, inspect the exact policy issue, authorize the finance role, and commit the same mutation through Vue-owned state.";

/** The workbench's panels, in the page's static HTML (the workbench renders in the browser). */
const panels: readonly FrameworkPanel[] = [
  {
    title: "Purchase order review",
    detail:
      "The header sets the role the host acts as and attempts the protected edit: 999 in G1, in the Total column. The challenge readout shows where that edit stands.",
    controls: ["Acting as Reviewer or Finance lead", "Challenge", "Attempt 999 as reviewer"],
  },
  {
    title: "Validation",
    detail:
      "The selected cell resolves its workbook rule before any commit. Select a Status or Quantity cell to inspect its validation rule.",
    controls: ["the rule of the selected cell"],
  },
  {
    title: "Protection",
    detail:
      "Override the protected G1 total in three steps: attempt it as Reviewer, authorize Finance lead, then commit the same edit. The policy result names the rule that refused it.",
    controls: ["Attempt", "Authorize", "Commit", "Authorize finance lead"],
  },
  {
    title: "Change",
    detail:
      "The policy outcome and the host's work side by side: the cell, the commits waiting for the host, and the host version. A rejected attempt leaves the cell as it was.",
    controls: ["Cell", "Pending", "Host"],
  },
  {
    title: "Notes",
    detail: "Write a note on the selected cell, then save it or clear it.",
    controls: ["Selected-cell note", "Save note", "Clear"],
  },
  {
    title: "Format the live selection",
    detail:
      "Use the grid's toolbar above the rows. Style changes enter the same host queue as edits.",
    controls: ["Bold", "Italic", "Borders", "More commands"],
  },
  {
    title: "Sheet operations",
    detail:
      "Rename, add or open a sheet through the public Grid API. The tab strip above the rows drives the same workbook.",
    controls: ["Active sheet name", "Rename", "Add archive sheet", "Open suppliers"],
  },
  {
    title: "Host persistence",
    detail:
      "Local changes stay pending until the host acknowledges them. Sync to host acknowledges the queued commits in order and advances the host version once for each.",
    controls: ["Pending", "Host version", "Generation", "Sync to host"],
    link: { href: "/showcases/database/", label: "Durable proof" },
  },
  {
    title: "Renderer and adapter",
    detail:
      "A renderer change rebuilds the Vue-owned grid; live props do not. The settings make the grid read-only or switch the mutation policy, and the bindings list the props the adapter receives.",
    controls: [
      "Canvas · main thread",
      "Worker · off thread",
      "Read only",
      "Policy",
      "Vue bindings",
    ],
  },
  {
    title: "Adapter events",
    detail:
      "The events the adapter emits as you work: ready, edit begin and commit, sheet changes, and rejected edits.",
    controls: ["@ready", "@edit-begin", "@edit-commit", "@active-sheet-change"],
  },
];

const code = {
  title: "The code behind it",
  Snippet: VueSnippet,
  source: VueSnippetSource,
};

export const Route = createFileRoute("/vue")({
  head: () => ({
    meta: pageMeta("Vue business workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: vueWorkbenchStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: VueRoute,
});

function VueRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        code={code}
        proofArt={FRAMEWORK_PROOF_ART}
        description={description}
        eyebrow="VUE / BUSINESS WORKFLOW"
        framework="vue"
        guide="/docs/frameworks/vue/"
        packageName="@sheetwrite/vue"
        panels={panels}
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
