import { createFileRoute } from "@tanstack/react-router";
import { pageMeta } from "../lib/seo.js";
import { SvelteShowcaseIsland } from "../showcases/AdapterIslands.js";
import { ShowcasePage } from "../showcases/ShowcasePage.js";
import svelteWorkbenchStylesheet from "../styles/svelte-workbench.css?url";

const description =
  "Edit dispatch tickets offline. IndexedDB stores each pending change. Reconnect to send the queue, or review a version conflict and merge the field update.";

export const Route = createFileRoute("/svelte")({
  head: () => ({
    meta: pageMeta("Svelte offline workbench — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: svelteWorkbenchStylesheet }],
  }),
  component: SvelteShowcaseRoute,
});

function SvelteShowcaseRoute() {
  return (
    <ShowcasePage
      active="svelte"
      description={description}
      eyebrow="SVELTE / OFFLINE FIELD WORK"
      guide="/docs/frameworks/svelte/"
      packageName="@sheetwrite/svelte"
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
          detail: "Presence stays on the board. Queue state and server versions appear beside it.",
        },
        {
          title: "Explicit recovery",
          detail: "Version conflicts and remount restoration remain inspectable on demand.",
        },
      ]}
      prompt="Go offline, edit the next ticket, then review the outbox beside the board. Reconnect to send the queued edit."
      sourcePath="docs/src/showcases/SvelteShowcase.svelte"
      title="Keep dispatch work safe offline."
    >
      <SvelteShowcaseIsland />
    </ShowcasePage>
  );
}
