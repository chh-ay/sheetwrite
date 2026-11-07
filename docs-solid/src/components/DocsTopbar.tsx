import { DOCS_TABS, type DocsTabId } from "@docs/lib/navigation.js";
import { For } from "solid-js";

import { Island } from "../islands/Island.js";
import { NAVIGATION_DIALOG_ID } from "../lib/shell-ids.js";
import { BrandMark } from "./BrandMark.js";
import { NavigationSections } from "./DocsNavigation.js";
import { DocsSearch } from "./DocsSearch.js";
import { Icon } from "./Icon.js";

/*
 * The documentation top bar, ported from docs/src/components/DocsTopbar.tsx,
 * with the theme toggle and the menu (DocsNavigationMenu.tsx) as static
 * markup; lib/shell.ts gives them their behaviour. Search is an island.
 */

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";

/** Switches between the light and dark theme; the server renders the dark theme's button. */
function ThemeToggle() {
  return (
    <button
      aria-label="Use light theme"
      class="sw-icon-button"
      data-theme-toggle=""
      title="Use light theme"
      type="button"
    >
      <Icon name="sun" size="md" />
    </button>
  );
}

/**
 * The documentation menu: the button that opens the drawer, and the drawer, a
 * modal dialog with the same navigation as the sidebar (focus trap, Escape and
 * focus restore come from the dialog).
 */
function NavigationMenu(props: { readonly activeHref?: string; readonly tab: DocsTabId }) {
  return (
    <>
      <button
        aria-controls={NAVIGATION_DIALOG_ID}
        aria-expanded="false"
        aria-haspopup="dialog"
        class="sw-icon-button sw-nav-toggle"
        type="button"
      >
        <Icon name="menu" size="md" />
        <span class="sw-visually-hidden">Documentation menu</span>
      </button>
      <dialog aria-label="Documentation" class="sw-nav-dialog" id={NAVIGATION_DIALOG_ID}>
        <div class="sw-nav-dialog__head">
          <span class="sw-nav-dialog__title">Documentation</span>
          <button aria-label="Close documentation menu" class="sw-icon-button" type="button">
            <Icon name="close" size="md" />
          </button>
        </div>
        <NavigationSections activeHref={props.activeHref} tab={props.tab} />
      </dialog>
    </>
  );
}

/**
 * The tabs for each part of the docs on the left; search, GitHub and the theme
 * on the right. Where the sidebar does not fit, the bar also carries the brand
 * and the menu button, and the tabs move to a second row that scrolls sideways.
 */
export function DocsTopbar(props: { readonly activeTab: DocsTabId; readonly activeHref?: string }) {
  return (
    <header class="sw-docs-bar">
      <a aria-label="Sheetwrite home" class="sw-docs-bar__brand" href="/">
        <BrandMark />
        <span>Sheetwrite</span>
      </a>
      <nav aria-label="Documentation sections" class="sw-docs-tabs">
        <For each={DOCS_TABS}>
          {(tab) => (
            <a
              aria-current={
                tab.id !== props.activeTab
                  ? undefined
                  : props.activeHref === tab.href
                    ? "page"
                    : "true"
              }
              href={tab.href}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </a>
          )}
        </For>
      </nav>
      <div class="sw-docs-bar__actions">
        <Island component={DocsSearch} hydrate="interaction" name="search" props={{}} />
        <a class="sw-docs-bar__link" href={REPOSITORY_URL}>
          GitHub
        </a>
        <ThemeToggle />
        <NavigationMenu activeHref={props.activeHref} tab={props.activeTab} />
      </div>
    </header>
  );
}
