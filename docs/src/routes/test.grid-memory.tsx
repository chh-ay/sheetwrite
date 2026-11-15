import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { GridMemoryFixture } from "../test-fixtures/grid-memory/GridMemoryFixture.js";

const PAGE_STYLE = { padding: "16px" };

export const Route = createFileRoute("/test/grid-memory")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: GridMemoryPage,
});

function GridMemoryPage() {
  return (
    <NoHydration>
      <main style={PAGE_STYLE}>
        <Island name="test-grid-memory" component={GridMemoryFixture} props={{}} />
      </main>
    </NoHydration>
  );
}
