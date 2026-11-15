import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { FormulasEngineFixture } from "../test-fixtures/formulas-engine/FormulasEngineFixture.js";

const FIXTURE_PAGE_PADDING = "24px";

export const Route = createFileRoute("/test/formulas-engine")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: FormulasEngineFixturePage,
});

function FormulasEngineFixturePage() {
  return (
    <NoHydration>
      <main style={{ padding: FIXTURE_PAGE_PADDING }}>
        <h1>Formula engine browser fixture</h1>
        <Island name="test-formulas-engine" component={FormulasEngineFixture} props={{}} />
      </main>
    </NoHydration>
  );
}
