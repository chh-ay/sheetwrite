import { type ComponentType, lazy, Suspense } from "react";

type SnippetModule = { default: ComponentType };

/** How far below the viewport the engine cards start loading their code. */
const NEAR_VIEWPORT_MARGIN = "600px 0px";
/** The section whose approach loads the snippet code. */
const ENGINES_SECTION = ".sw-lp-engines";

let sectionNear: Promise<void> | undefined;

/**
 * Resolves once the engines section comes within {@link NEAR_VIEWPORT_MARGIN}
 * of the viewport. On the server it resolves at once.
 */
function whenSectionNear(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (sectionNear !== undefined) return sectionNear;
  const { promise, resolve } = Promise.withResolvers<void>();
  sectionNear = promise;
  const section = document.querySelector(ENGINES_SECTION);
  if (section === null || !("IntersectionObserver" in window)) {
    resolve();
    return promise;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      resolve();
    },
    { rootMargin: NEAR_VIEWPORT_MARGIN },
  );
  observer.observe(section);
  return promise;
}

/**
 * A snippet the server renders in full, highlighted at build time. In the
 * browser its code stays out of the first load: the server HTML is kept, and
 * the module loads and hydrates when the section nears the viewport. The
 * code hovers attach to the server HTML, so they work before that.
 */
function nearSnippet(load: () => Promise<SnippetModule>) {
  const Snippet = lazy(() => whenSectionNear().then(load));
  return function NearSnippet() {
    return (
      <Suspense fallback={null}>
        <Snippet />
      </Suspense>
    );
  };
}

/** Setup code of the default engine, in the engine choice card. */
export const EngineDefaultSnippet = nearSnippet(() => import("./snippets/engine-default.mdx"));
/** Setup code of the full engine, in the engine choice card. */
export const EngineFullSnippet = nearSnippet(() => import("./snippets/engine-full.mdx"));
