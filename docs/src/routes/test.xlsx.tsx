import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { XlsxFixture } from "../test-fixtures/xlsx/XlsxFixture.js";

export const Route = createFileRoute("/test/xlsx")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: XlsxFixturePage,
});

function XlsxFixturePage() {
  return (
    <NoHydration>
      <main class="sw-test-fixture">
        <Island name="test-xlsx" component={XlsxFixture} props={{}} />
      </main>
    </NoHydration>
  );
}
