import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";
import { NoHydration } from "solid-js/web";

import { DocsSearch } from "../components/DocsSearch.js";
import { Icon, type IconName } from "../components/Icon.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { Island } from "../islands/Island.js";

/**
 * Prerendered to /404.html, which static hosts serve for every URL without a
 * page (the deployment supplies the 404 status). The prerenderer rejects 404
 * responses, so the page renders here with a normal status.
 */
export const Route = createFileRoute("/404")({
  head: () => ({
    meta: [{ title: "Page not found — Sheetwrite" }, { name: "robots", content: "noindex" }],
  }),
  component: SiteNotFound,
});

const DESTINATIONS: readonly { href: string; label: string; detail: string; icon: IconName }[] = [
  { href: "/docs/", label: "Documentation", detail: "Guides, concepts and the API", icon: "book" },
  {
    href: "/showcases/",
    label: "Showcases",
    detail: "Live examples on the engine",
    icon: "sparkle",
  },
  { href: "/", label: "Home", detail: "What Sheetwrite is", icon: "sheet" },
];

/**
 * The site page for any URL without a page: the site's page head, search
 * (an island, as on docs pages) and the three places most readers go next,
 * each a 44 px target.
 */
function SiteNotFound() {
  return (
    <NoHydration>
      <div class="sw-showcase-frame">
        <SiteTopbar pathname="/404/" />
        <main class="sw-showcase-page sw-not-found" id="main-content">
          <header class="sw-not-found__head">
            <p class="sw-not-found__eyebrow">404</p>
            <h1>Page not found</h1>
            <p class="sw-not-found__lead">
              This page does not exist, or it moved. Search the documentation, or go on from one of
              these.
            </p>
          </header>
          <div class="sw-not-found__search">
            <Island component={DocsSearch} hydrate="interaction" name="search" props={{}} />
          </div>
          <nav aria-label="Where to go" class="sw-not-found__links">
            <For each={DESTINATIONS}>
              {(destination) => (
                <a class="sw-not-found__link" href={destination.href}>
                  <Icon name={destination.icon} size="md" />
                  <span>{destination.label}</span>
                  <small aria-hidden="true">{destination.detail}</small>
                </a>
              )}
            </For>
          </nav>
        </main>
      </div>
    </NoHydration>
  );
}
