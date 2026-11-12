/**
 * The docs shell's behaviour that needs no component (components/DocsShell.tsx
 * renders it all as static markup): the theme toggle, the documentation menu,
 * the search shortcut and the outline's current section. The islands client
 * runs it on every page; the sidebar's scroll position is set by an inline
 * script before first paint (lib/shell-ids.ts).
 */
import { iconHref } from "@docs/icons/icon-href.js";
import { writePreference } from "@docs/lib/preference-storage.js";

import { NAVIGATION_DIALOG_ID } from "./shell-ids.js";

/** Keep the sidebar only when it fits beside the reading panel; smaller viewports use the drawer. */
const RAIL_VIEWPORT_QUERY = "(min-width: 64rem)";

/**
 * Where a section counts as being read: just below the sticky header. The
 * current entry is the last one whose heading is above this line.
 */
const READING_LINE_PX = 96;
/** Distance from the page end that counts as scrolled to the end. */
const PAGE_END_SLACK_PX = 2;

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The toggle offers the other theme: its label and icon follow the current one. */
function showTheme(button: HTMLElement, theme: Theme): void {
  const label = `Use ${theme === "dark" ? "light" : "dark"} theme`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.querySelector("use")?.setAttribute("href", iconHref(theme === "dark" ? "sun" : "moon"));
}

function installThemeToggle(): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-theme-toggle]")) {
    // The page was rendered for the dark theme; the head script may have chosen light.
    showTheme(button, currentTheme());
    button.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      writePreference("sheetwrite-theme", next);
      showTheme(button, next);
    });
  }
}

/**
 * The documentation menu: its button opens the drawer as a modal dialog,
 * which brings the focus trap, Escape and focus restore; the backdrop and the
 * close button close it, and so does the viewport growing to fit the sidebar.
 */
function installNavigationMenu(): void {
  const dialog = document.getElementById(NAVIGATION_DIALOG_ID);
  const toggle = document.querySelector<HTMLElement>(`[aria-controls="${NAVIGATION_DIALOG_ID}"]`);
  if (!(dialog instanceof HTMLDialogElement) || toggle === null) return;
  toggle.addEventListener("click", () => {
    dialog.showModal();
    toggle.setAttribute("aria-expanded", "true");
    // The current page can sit far down a long section list.
    requestAnimationFrame(() => {
      dialog
        .querySelector<HTMLElement>('a[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
  });
  dialog.addEventListener("close", () => toggle.setAttribute("aria-expanded", "false"));
  dialog.addEventListener("click", (event) => {
    // Only the backdrop targets the dialog itself: its children fill it.
    if (event.target === dialog) dialog.close();
  });
  dialog
    .querySelector(".sw-nav-dialog__head button")
    ?.addEventListener("click", () => dialog.close());
  window.matchMedia(RAIL_VIEWPORT_QUERY).addEventListener("change", (event) => {
    if (event.matches) dialog.close();
  });
}

/** Apple platforms name the Command key; others use Ctrl. */
function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * Search opens from ⌘K or Ctrl K anywhere, and from "/" outside text fields.
 * The search island hydrates on first use, so the shortcut presses its button:
 * the islands client holds that press until the island is ready.
 */
function installSearchShortcut(): void {
  const button = document.querySelector<HTMLElement>("[data-search-open]");
  if (button === null) return;
  const keyCap = button.querySelector("kbd");
  if (keyCap !== null && !isApplePlatform()) keyCap.textContent = "Ctrl K";
  window.addEventListener("keydown", (event) => {
    const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
    const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!commandK && !slash) return;
    const target = event.target;
    // "/" keeps typing semantics inside fields; Ctrl+K may not.
    if (slash && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    event.preventDefault();
    button.click();
  });
}

/**
 * The outline marks the section being read (the last heading above the
 * reading line, or at the page's end the last on screen), and lists only
 * entries whose heading is shown: the symbol filter hides groups.
 */
function installOutline(): void {
  const outlines = Array.from(document.querySelectorAll<HTMLElement>(".sw-toc, .sw-toc-inline"));
  // Every entry each outline was rendered with, so a group the filter shows again comes back.
  const lists = outlines.flatMap((outline) => {
    const list = outline.querySelector("ul");
    return list === null ? [] : [{ list, entries: Array.from(list.children) }];
  });
  if (lists.length === 0) return;
  const targetOf = (link: HTMLAnchorElement) =>
    document.getElementById(decodeURIComponent(link.hash.slice(1)));
  const isShown = (entry: Element): boolean => {
    const link = entry.querySelector("a");
    const target = link === null ? null : targetOf(link);
    return target !== null && target.closest("[hidden]") === null;
  };

  const showVisibleEntries = (): void => {
    for (const { list, entries } of lists) {
      const shown = entries.filter(isShown);
      const unchanged =
        shown.length === list.children.length &&
        shown.every((entry, index) => list.children[index] === entry);
      if (!unchanged) list.replaceChildren(...shown);
    }
  };

  let frame = 0;
  const markCurrent = (): void => {
    frame = 0;
    const { scrollHeight } = document.documentElement;
    const atEnd = window.scrollY + window.innerHeight >= scrollHeight - PAGE_END_SLACK_PX;
    const line = atEnd ? window.innerHeight : READING_LINE_PX;
    const rail = outlines.find((outline) => outline.matches(".sw-toc"));
    const railLinks = Array.from(rail?.querySelectorAll<HTMLAnchorElement>("li a") ?? []);
    let current = railLinks[0];
    for (const link of railLinks) {
      const target = targetOf(link);
      if (target === null || target.getBoundingClientRect().top > line) break;
      current = link;
    }
    for (const link of railLinks) {
      if (link === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(markCurrent);
  };

  showVisibleEntries();
  markCurrent();
  window.addEventListener("scroll", schedule, { passive: true });
  const article = document.querySelector("#main-content article.sw-prose");
  if (article !== null) {
    new MutationObserver(() => {
      showVisibleEntries();
      schedule();
    }).observe(article, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }
}

export function installDocsShell(): void {
  installThemeToggle();
  // Every page with the search control (docs pages and the 404 page).
  installSearchShortcut();
  if (document.querySelector(".sw-docs") === null) return;
  installNavigationMenu();
  installOutline();
}
