import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { PrefetchFixture } from "../test-fixtures/prefetch/PrefetchFixture.js";

export const Route = createFileRoute("/test/prefetch")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: PrefetchPage,
});

function PrefetchPage() {
  return (
    <NoHydration>
      <Island name="test-prefetch" component={PrefetchFixture} props={{}} />
    </NoHydration>
  );
}
