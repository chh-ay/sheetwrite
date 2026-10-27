import { type ComponentType, lazy, Suspense, useState } from "react";

import VanillaSnippet from "./snippets/vanilla.mdx";
import { onTabListKey } from "./tabKeys.js";

type SnippetModule = { default: ComponentType };

/** Loads a hidden tab's snippet on first intent, then renders it from the cache. */
function deferredSnippet(load: () => Promise<SnippetModule>) {
  let pending: Promise<SnippetModule> | undefined;
  const preload = () => {
    pending ??= load();
    return pending;
  };
  return { Snippet: lazy(preload), preload };
}

// Kept out of the route file so snippet imports stay behind the landing
// component boundary rather than in the always-loaded route module.
// Only the default tab is eagerly imported; the others load on intent.
const FRAMEWORKS = [
  {
    id: "vanilla",
    label: "Vanilla",
    Snippet: VanillaSnippet,
    preload: () => undefined,
  },
  {
    id: "react",
    label: "React",
    ...deferredSnippet(() => import("./snippets/react.mdx")),
  },
  {
    id: "vue",
    label: "Vue",
    ...deferredSnippet(() => import("./snippets/vue.mdx")),
  },
  {
    id: "svelte",
    label: "Svelte",
    ...deferredSnippet(() => import("./snippets/svelte.mdx")),
  },
] as const;

type FrameworkId = (typeof FRAMEWORKS)[number]["id"];

export function CodeTabs() {
  const [active, setActive] = useState<FrameworkId>("vanilla");
  const current = FRAMEWORKS.find((framework) => framework.id === active) ?? FRAMEWORKS[0];
  return (
    <div className="sw-code-tabs">
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs inside take focus; the tab list itself does not. */}
      <div
        aria-label="Framework"
        className="sw-code-tabs__list"
        onKeyDown={(event) =>
          onTabListKey(
            event,
            FRAMEWORKS.map((framework) => framework.id),
            active,
            setActive,
            (id) => `landing-tab-${id}`,
          )
        }
        role="tablist"
      >
        {FRAMEWORKS.map((framework) => (
          <button
            aria-controls={`landing-code-${framework.id}`}
            aria-selected={framework.id === active}
            data-framework={framework.id}
            id={`landing-tab-${framework.id}`}
            key={framework.id}
            onClick={() => setActive(framework.id)}
            onFocus={framework.preload}
            onPointerEnter={framework.preload}
            role="tab"
            tabIndex={framework.id === active ? 0 : -1}
            type="button"
          >
            {framework.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`landing-tab-${current.id}`}
        className="sw-code-tabs__panel"
        id={`landing-code-${current.id}`}
        role="tabpanel"
      >
        <Suspense fallback={null}>
          <current.Snippet />
        </Suspense>
      </div>
    </div>
  );
}
