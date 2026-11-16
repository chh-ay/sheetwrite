import { pageMeta } from "@docs/lib/seo.js";
import SvelteSnippet from "@docs/showcases/snippets/svelte-workbench.mdx";
import SvelteSnippetSource from "@docs/showcases/snippets/svelte-workbench.mdx?source";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { FRAMEWORK_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { SvelteWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { type FrameworkPanel, FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";
import svelteWorkbenchStylesheet from "@docs/styles/svelte-workbench.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Edit dispatch tickets offline. IndexedDB stores each pending change. Reconnect to send the queue, or review a version conflict and merge the field update.";

/** The workbench's panels, in the page's static HTML (the workbench renders in the browser). */
const panels: readonly FrameworkPanel[] = [
  {
    title: "No signal. No lost field work.",
    detail:
      "The header holds the connection switch, the count of edits waiting for HQ, the grid's command toolbar, and who is working on the board.",
    controls: ["Go offline or Reconnect", "durable edits waiting for HQ", "Working here"],
  },
  {
    title: "Dispatch Grid",
    detail:
      "Edit a ticket's status in the grid or use the field action. The grid stays editable while the connection is down.",
    controls: ["the dispatch tickets"],
  },
  {
    title: "Field handoff",
    detail:
      "Walks through the steps: take the board offline, edit a ticket without signal, reconnect to drain the durable outbox, and review a version conflict when HQ moved ahead.",
    controls: ["Edit next ticket", "server version"],
  },
  {
    title: "Durable outbox",
    detail:
      "Each offline edit waits in IndexedDB, with its mutation ID, status and base version, until the server acknowledges it.",
    controls: ["the queued edits"],
  },
  {
    title: "Version conflict",
    detail:
      "When HQ moved the server ahead, the panel lists the remote commits since your base version and says whether your queued edits overlap them. Merge & resync rebases and sends them.",
    controls: ["Merge & resync"],
  },
  {
    title: "What happened",
    detail: "A live feed of connection and queue events.",
    controls: ["the activity feed"],
  },
  {
    title: "Recovery scenarios",
    detail:
      "Prove concurrent HQ work, or remount the Svelte island while its outbox is offline: the queued edits survive.",
    controls: ["HQ commits work", "Remount island"],
  },
];

const code = {
  title: "The code behind it",
  Snippet: SvelteSnippet,
  source: SvelteSnippetSource,
};

export const Route = createFileRoute("/svelte")({
  head: () => ({
    meta: pageMeta("Svelte offline workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: svelteWorkbenchStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: SvelteRoute,
});

function SvelteRoute() {
  return (
    <NoHydration>
      <FrameworkPage
        code={code}
        proofArt={FRAMEWORK_PROOF_ART}
        description={description}
        eyebrow="SVELTE / OFFLINE FIELD WORK"
        framework="svelte"
        guide="/docs/frameworks/svelte/"
        packageName="@sheetwrite/svelte"
        panels={panels}
        prompt="Go offline, edit the next ticket, then review the outbox beside the board. Reconnect to send the queued edit."
        proof={[
          {
            title: "Offline ticket edits",
            detail: "The live Grid remains editable while the connection is down.",
          },
          {
            title: "Durable outbox",
            detail: "IndexedDB owns each edit before reconnect drains it in order.",
          },
          {
            title: "Causal collaboration",
            detail:
              "Presence stays on the board. Queue state and server versions appear beside it.",
          },
          {
            title: "Explicit recovery",
            detail: "Version conflicts and remount restoration remain inspectable on demand.",
          },
        ]}
        sourcePath="docs/src/showcases/SvelteShowcase.svelte"
        title="Keep dispatch work safe offline."
      >
        <Island component={SvelteWorkbenchIsland} name="workbench-svelte" props={{}} />
      </FrameworkPage>
    </NoHydration>
  );
}
