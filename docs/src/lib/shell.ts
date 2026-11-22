/**
 * The docs shell's behaviour that needs no component (components/DocsShell.tsx
 * renders it all as static markup): the theme toggle, the documentation menu,
 * the search opener (lib/search-opener.ts, loaded on pages with search) and
 * the outline's current section. The islands client runs it on every page; the
 * sidebar's scroll position is set by an inline script before first paint
 * (lib/shell-ids.ts).
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

function current_theme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** The toggle offers the other theme: its label and icon follow the current one. */
function show_theme(button: HTMLElement, theme: Theme): void {
  const label = `Use ${theme === "dark" ? "light" : "dark"} theme`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.querySelector("use")?.setAttribute("href", iconHref(theme === "dark" ? "sun" : "moon"));
}

function install_theme_toggle(): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-theme-toggle]")) {
    // The page was rendered for the dark theme; the head script may have chosen light.
    show_theme(button, current_theme());
    button.addEventListener("click", () => {
      const next = current_theme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      writePreference("sheetwrite-theme", next);
      show_theme(button, next);
    });
  }
}

/**
 * The documentation menu: its button opens the drawer as a modal dialog,
 * which brings the focus trap, Escape and focus restore; the backdrop and the
 * close button close it, and so does the viewport growing to fit the sidebar.
 */
function install_navigation_menu(): void {
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

/** Room kept around the current outline entry when the rail scrolls to it. */
const RAIL_ENTRY_MARGIN_PX = 24;

/** Scrolls the outline rail, never the page, so `link` is in view with some room around it. */
function scroll_rail_to(rail: HTMLElement, link: HTMLElement): void {
  const rail_box = rail.getBoundingClientRect();
  const link_box = link.getBoundingClientRect();
  if (link_box.top < rail_box.top + RAIL_ENTRY_MARGIN_PX) {
    rail.scrollTop -= rail_box.top + RAIL_ENTRY_MARGIN_PX - link_box.top;
  } else if (link_box.bottom > rail_box.bottom - RAIL_ENTRY_MARGIN_PX) {
    rail.scrollTop += link_box.bottom - rail_box.bottom + RAIL_ENTRY_MARGIN_PX;
  }
}

/**
 * Marks which ends of the rail hide entries (`data-more="start end"`), so the
 * stylesheet fades that edge: overlay scroll bars show no sign of the rest.
 */
function mark_rail_edges(rail: HTMLElement): void {
  const hidden = [
    rail.scrollTop > 1 ? "start" : "",
    rail.scrollTop + rail.clientHeight < rail.scrollHeight - 1 ? "end" : "",
  ].filter(Boolean);
  if (hidden.length === 0) delete rail.dataset.more;
  else rail.dataset.more = hidden.join(" ");
}

/**
 * The outline marks the section being read (the last heading above the
 * reading line, or at the page's end the last on screen), and lists only
 * entries whose heading is shown: the symbol filter hides groups.
 */
function install_outline(): void {
  const outlines = Array.from(document.querySelectorAll<HTMLElement>(".sw-toc, .sw-toc-inline"));
  // Every entry each outline was rendered with, so a group the filter shows again comes back.
  const lists = outlines.flatMap((outline) => {
    const list = outline.querySelector("ul");
    return list === null ? [] : [{ list, entries: Array.from(list.children) }];
  });
  if (lists.length === 0) return;
  const target_of = (link: HTMLAnchorElement) =>
    document.getElementById(decodeURIComponent(link.hash.slice(1)));
  const is_shown = (entry: Element): boolean => {
    const link = entry.querySelector("a");
    const target = link === null ? null : target_of(link);
    return target !== null && target.closest("[hidden]") === null;
  };

  const show_visible_entries = (): void => {
    for (const { list, entries } of lists) {
      const shown = entries.filter(is_shown);
      const unchanged =
        shown.length === list.children.length &&
        shown.every((entry, index) => list.children[index] === entry);
      if (!unchanged) list.replaceChildren(...shown);
    }
  };

  const rail = outlines.find((outline) => outline.matches(".sw-toc"));
  let frame = 0;
  let shown_current: HTMLAnchorElement | undefined;
  const mark_current = (): void => {
    frame = 0;
    const { scrollHeight: scroll_height } = document.documentElement;
    const at_end = window.scrollY + window.innerHeight >= scroll_height - PAGE_END_SLACK_PX;
    const line = at_end ? window.innerHeight : READING_LINE_PX;
    const rail_links = Array.from(rail?.querySelectorAll<HTMLAnchorElement>("li a") ?? []);
    let current = rail_links[0];
    for (const link of rail_links) {
      const target = target_of(link);
      if (target === null || target.getBoundingClientRect().top > line) break;
      current = link;
    }
    for (const link of rail_links) {
      if (link === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
    // A long outline scrolls inside its sticky column: the entry being read
    // stays in view there. Only a change of entry moves the rail, so a reader
    // who scrolls the rail to look ahead keeps their place.
    if (rail !== undefined && current !== undefined && current !== shown_current) {
      shown_current = current;
      scroll_rail_to(rail, current);
    }
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(mark_current);
  };

  show_visible_entries();
  mark_current();
  window.addEventListener("scroll", schedule, { passive: true });
  if (rail !== undefined) {
    const mark_edges = (): void => mark_rail_edges(rail);
    mark_edges();
    rail.addEventListener("scroll", mark_edges, { passive: true });
    // The rail's height (viewport) and its list's height (filtered entries) both move the edges.
    const edges = new ResizeObserver(mark_edges);
    edges.observe(rail);
    const rail_list = rail.querySelector("ul");
    if (rail_list !== null) edges.observe(rail_list);
  }
  const article = document.querySelector("#main-content article.sw-prose");
  if (article !== null) {
    new MutationObserver(() => {
      show_visible_entries();
      schedule();
    }).observe(article, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }
}

export function installDocsShell(): void {
  install_theme_toggle();
  // Only pages with the search control (docs pages and the 404 page) load its opener.
  if (document.querySelector("[data-search-open]") !== null) void import("./search-opener.js");
  if (document.querySelector(".sw-docs") === null) return;
  install_navigation_menu();
  install_outline();
}
