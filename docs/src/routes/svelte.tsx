import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { FRAMEWORK_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { SvelteWorkbenchIsland } from "../showcases/frameworks/FrameworkMount.js";
import { FrameworkPage } from "../showcases/frameworks/FrameworkPage.js";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import heroStylesheet from "@docs/styles/showcase-capability-hero.css?url";
import svelteWorkbenchStylesheet from "@docs/styles/svelte-workbench.css?url";
import stageStylesheet from "@docs/styles/workbench-stage.css?url";

const description =
  "Edit dispatch tickets offline. IndexedDB stores each pending change. Reconnect to send the queue, or review a version conflict and merge the field update.";

export const Route = createFileRoute("/svelte")({
  head: () => ({
    meta: pageMeta("Svelte offline workbench — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: stageStylesheet },
      { rel: "stylesheet", href: heroStylesheet },
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
        proofArt={FRAMEWORK_PROOF_ART}
        description={description}
        eyebrow="SVELTE / OFFLINE FIELD WORK"
        framework="svelte"
        guide="/docs/frameworks/svelte/"
        packageName="@sheetwrite/svelte"
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
