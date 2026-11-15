import releaseFacts from "@docs/generated/release-facts.json" with { type: "json" };

import { BrandMark } from "./BrandMark.js";
import { Icon } from "./Icon.js";
import { ThemeToggle } from "./ThemeToggle.js";

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";

type Section = "docs" | "showcases" | "releases" | undefined;

function currentSection(pathname: string): Section {
  if (pathname.startsWith(releaseFacts.releasesHref)) return "releases";
  if (pathname.startsWith("/docs/")) return "docs";
  if (pathname.startsWith("/showcases/")) return "showcases";
  return undefined;
}

/**
 * The site header outside the documentation, ported from
 * docs/src/components/SiteTopbar.tsx: brand, Docs, Showcases, Releases, GitHub
 * and the theme toggle. On phones the site links open from the menu button as
 * a native popover (open, close, Escape, light dismiss and focus come from the
 * browser, without script). The theme toggle's behaviour is in lib/shell.ts.
 */
export function SiteTopbar(props: { readonly pathname: string }) {
  const section = () => currentSection(props.pathname);
  // A section's own page is the destination; deeper pages are inside the section.
  const marker = (name: Exclude<Section, undefined>, href: string) =>
    section() !== name ? undefined : props.pathname === href ? "page" : "true";

  return (
    <header class="sw-header" data-has-search="false">
      <a aria-label="Sheetwrite home" class="sw-header__brand" href="/">
        <BrandMark />
        <span>Sheetwrite</span>
      </a>
      <nav aria-label="Site" class="sw-header__nav" id="site-nav" popover="auto">
        <a aria-current={marker("docs", "/docs/")} href="/docs/">
          Docs
        </a>
        <a aria-current={marker("showcases", "/showcases/")} href="/showcases/">
          Showcases
        </a>
        <a
          aria-current={marker("releases", releaseFacts.releasesHref)}
          href={releaseFacts.releasesHref}
        >
          Releases
          <span class="sw-header__version">v{releaseFacts.latest.version}</span>
        </a>
        <a class="sw-header__nav-github" href={REPOSITORY_URL}>
          GitHub
        </a>
      </nav>
      <div class="sw-header__actions">
        <a class="sw-header__link" href={REPOSITORY_URL}>
          GitHub
        </a>
        <ThemeToggle />
        <button
          aria-label="Site menu"
          class="sw-icon-button sw-header__menu"
          popovertarget="site-nav"
          type="button"
        >
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
