import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { CollaborationFixture } from "../test-fixtures/collaboration/CollaborationFixture.js";

export const Route = createFileRoute("/test/collaboration")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: CollaborationPage,
});

function CollaborationPage() {
  return (
    <NoHydration>
      <main class="sw-test-fixture">
        <Island name="test-collaboration" component={CollaborationFixture} props={{}} />
      </main>
    </NoHydration>
  );
}
