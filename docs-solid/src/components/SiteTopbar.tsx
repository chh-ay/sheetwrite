import releaseFacts from "@docs/generated/release-facts.json" with { type: "json" };
import { type JSX, Show } from "solid-js";

import { Island } from "../islands/Island.js";
import { BrandMark } from "./BrandMark.js";
import { ThemeToggle } from "./ThemeToggle.js";

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";

interface SiteTopbarProps {
  /** The current page's path; the docs section is marked current on every docs page. */
  readonly pathname: string;
  /** The documentation search control. */
  readonly search?: JSX.Element;
  /** Controls after the theme toggle, such as the documentation menu button. */
  readonly trailing: JSX.Element;
}

/**
 * The site header of the docs pages: brand, Docs, Showcases, Releases, GitHub
 * and the theme toggle, with the search and the menu button. The landing page
 * and the showcases are other documents here, so their links are plain
 * anchors.
 */
export function SiteTopbar(props: SiteTopbarProps) {
  return (
    <header class="sw-header" data-has-search={props.search !== undefined}>
      <a aria-label="Sheetwrite home" class="sw-header__brand" href="/">
        <BrandMark />
        <span>Sheetwrite</span>
      </a>
      <nav aria-label="Site" class="sw-header__nav" id="site-nav" popover="auto">
        <a aria-current={props.pathname === "/docs/" ? "page" : "true"} href="/docs/">
          Docs
        </a>
        <a href="/showcases/">Showcases</a>
        <a href={releaseFacts.releasesHref}>
          Releases
          <span class="sw-header__version">v{releaseFacts.latest.version}</span>
        </a>
        <a class="sw-header__nav-github" href={REPOSITORY_URL}>
          GitHub
        </a>
      </nav>
      <Show when={props.search}>
        <div class="sw-header__search">{props.search}</div>
      </Show>
      <div class="sw-header__actions">
        <a class="sw-header__link" href={REPOSITORY_URL}>
          GitHub
        </a>
        <Island component={ThemeToggle} name="theme" props={{}} />
        {props.trailing}
      </div>
    </header>
  );
}
