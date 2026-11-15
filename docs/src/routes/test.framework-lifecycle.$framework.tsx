import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { FrameworkLifecycleFixture } from "../test-fixtures/framework-lifecycle/FrameworkLifecycleFixture.js";

export const Route = createFileRoute("/test/framework-lifecycle/$framework")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: FrameworkLifecyclePage,
});

function FrameworkLifecyclePage() {
  const params = Route.useParams();
  return (
    <NoHydration>
      <div class="sw-test-fixture">
        <Island
          name="test-framework-lifecycle"
          component={FrameworkLifecycleFixture}
          props={{ framework: params().framework }}
        />
      </div>
    </NoHydration>
  );
}
