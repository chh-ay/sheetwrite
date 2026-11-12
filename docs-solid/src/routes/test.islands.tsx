import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";
import { NoHydration } from "solid-js/web";

import { type ActivationControl, ActivationFixture } from "../islands/ActivationFixture.js";
import { Island } from "../islands/Island.js";

/** Each control's own island, so every test's key press is that island's first input. */
const FIXTURES: readonly { name: string; control: ActivationControl }[] = [
  { name: "button-enter", control: "button" },
  { name: "button-space", control: "button" },
  { name: "link", control: "link" },
  { name: "checkbox", control: "checkbox" },
  { name: "text", control: "text" },
];

/** Interaction islands for test/browser/island-activation.spec.ts; not linked from the site. */
export const Route = createFileRoute("/test/islands")({
  head: () => ({
    meta: [
      { title: "Island activation — Sheetwrite tests" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IslandActivationPage,
});

function IslandActivationPage() {
  return (
    <NoHydration>
      <main id="main-content">
        <h1>Island activation</h1>
        <For each={FIXTURES}>
          {(fixture) => (
            <Island
              component={ActivationFixture}
              hydrate="interaction"
              name="activation-fixture"
              props={fixture}
            />
          )}
        </For>
      </main>
    </NoHydration>
  );
}
