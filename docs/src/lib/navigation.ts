import apiNav from "../generated/api-nav.json";
import { RELEASES, RELEASES_HREF, minorVersion, releaseDate, releaseHref } from "./releases.js";

interface NavigationEntry {
  label: string;
  /** Release that added the page; it shows "New" for each patch of that minor release. */
  added?: string;
  /** Release that changed the page substantially; it shows "Updated" likewise. */
  updated?: string;
}

/** An entry a link can point at: previous/next and cross-links need a page. */
export interface NavigationPage extends NavigationEntry {
  readonly href: string;
  items?: readonly NavigationItem[];
}

/** A group that nests entries to any depth, with no page of its own. */
interface NavigationGroup extends NavigationEntry {
  href?: undefined;
  items: readonly NavigationItem[];
}

/**
 * One sidebar entry. A page may also be a group; an entry needs a page, a
 * group or both, so a bad entry does not compile.
 */
export type NavigationItem = NavigationPage | NavigationGroup;

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
}

function isPage(item: NavigationItem): item is NavigationPage {
  return item.href !== undefined;
}

/** The one generated section; reading order and the sidebar both name it. */
const API_PACKAGES_LABEL = "API packages";

export const DOCS_NAVIGATION: readonly NavigationSection[] = [
  {
    label: "Start",
    items: [
      { label: "Overview", href: "/docs/" },
      { label: "Installation", href: "/docs/start/installation/" },
      { label: "First grid", href: "/docs/start/first-grid/" },
      { label: "Performance", href: "/docs/guides/performance-resources/" },
    ],
  },
  {
    label: "Understand",
    items: [
      { label: "Runtime ownership", href: "/docs/concepts/runtime-ownership/" },
      { label: "Calculation engine", href: "/docs/concepts/calculation-engine/" },
      { label: "Adapter lifecycle", href: "/docs/frameworks/lifecycle/" },
      { label: "Error handling", href: "/docs/reference/events-errors/" },
    ],
  },
  {
    label: "Frameworks",
    items: [
      { label: "Vanilla", href: "/docs/frameworks/vanilla/" },
      { label: "React", href: "/docs/frameworks/react/" },
      { label: "Vue", href: "/docs/frameworks/vue/" },
      { label: "Svelte", href: "/docs/frameworks/svelte/" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Configuration", href: "/docs/guides/configuration/" },
      { label: "Interaction", href: "/docs/guides/interaction/" },
      { label: "Data operations", href: "/docs/guides/data-operations/" },
      { label: "Host-owned rows", href: "/docs/guides/host-owned-rows/" },
      { label: "Formulas", href: "/docs/guides/formulas/" },
      { label: "Analysis formulas", href: "/docs/guides/analysis-formulas/" },
      { label: "Iterative calculation", href: "/docs/guides/iterative-calculation/" },
      { label: "Styling", href: "/docs/guides/styling/" },
      { label: "Persistence", href: "/docs/guides/persistence/" },
      { label: "Collaboration", href: "/docs/guides/collaboration/" },
      { label: "Worker rendering", href: "/docs/guides/worker-rendering/" },
      { label: "XLSX export", href: "/docs/guides/xlsx-export/" },
      { label: "Accessibility", href: "/docs/guides/accessibility/" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "API contract", href: "/docs/reference/api-contract/" },
      { label: "Formula functions", href: "/docs/reference/formula-functions/" },
      { label: "Document operations", href: "/docs/reference/document-operations/" },
      { label: "Compatibility limits", href: "/docs/reference/compatibility-limits/" },
      { label: "Compatibility results", href: "/docs/reference/compatibility-results/" },
      { label: "Moved guides", href: "/docs/reference/moved-guides/" },
    ],
  },
  {
    label: "Releases",
    items: [
      { label: "All releases", href: RELEASES_HREF },
      ...RELEASES.map((release) => ({
        label: `${release.version} · ${releaseDate(release)}`,
        href: releaseHref(release.version),
      })),
    ],
  },
  {
    // Generated from package exports; api-nav.json is emitted by docs:generate.
    label: API_PACKAGES_LABEL,
    items: [{ label: "All entry points", href: "/docs/api/" }, ...apiNav],
  },
];

/** Depth-first pages of a tree, in the order a reader sees them in the sidebar. */
export function navigationPages(items: readonly NavigationItem[]): NavigationPage[] {
  const pages: NavigationPage[] = [];
  const visit = (item: NavigationItem): void => {
    if (isPage(item)) pages.push(item);
    for (const child of item.items ?? []) visit(child);
  };
  for (const item of items) visit(item);
  return pages;
}

/**
 * Reading order for previous/next links: every authored page in sidebar
 * order. Generated API packages are excluded so a reader never gets a "Next"
 * that hops between hundreds of generated entry points.
 */
const READING_ORDER: readonly NavigationPage[] = navigationPages(
  DOCS_NAVIGATION.filter((section) => section.label !== API_PACKAGES_LABEL).flatMap(
    (section) => section.items,
  ),
);

export type NavigationBadge = "new" | "updated";

/**
 * Badge for an entry in the given release. A group shows the strongest badge
 * of its pages, so a collapsed group still tells the reader something inside
 * it changed. Badges compare minor versions, so patch releases keep them and
 * the next minor release removes them.
 */
export function navigationBadge(
  item: NavigationItem,
  release: string,
): NavigationBadge | undefined {
  const minor = minorVersion(release);
  const sameMinor = (version: string | undefined) =>
    version !== undefined && minorVersion(version) === minor;

  if (sameMinor(item.added)) return "new";

  let badge: NavigationBadge | undefined = sameMinor(item.updated) ? "updated" : undefined;
  for (const child of item.items ?? []) {
    const childBadge = navigationBadge(child, release);
    if (childBadge === "new") return "new";
    badge ??= childBadge;
  }
  return badge;
}

export interface DocumentNeighbours {
  previous?: NavigationPage;
  next?: NavigationPage;
}

/**
 * Neighbours of a page that is itself a sidebar entry. Generated symbol pages
 * and anything else outside the reading order have none: their neighbours
 * would be unrelated packages rather than the next step in a guide.
 */
export function documentNeighbours(activeHref: string | undefined): DocumentNeighbours {
  if (activeHref === undefined) return {};
  const index = READING_ORDER.findIndex((item) => item.href === activeHref);
  if (index === -1) return {};
  const neighbours: DocumentNeighbours = {};
  const previous = READING_ORDER[index - 1];
  const next = READING_ORDER[index + 1];
  if (previous !== undefined) neighbours.previous = previous;
  if (next !== undefined) neighbours.next = next;
  return neighbours;
}

/**
 * Framework workbench deep links. The global topbar links to /showcases/
 * instead; these power in-page cross-links (ShowcasePage next/prev) and the
 * landing/hub link graphs. Every href here is a preserved public URL.
 */
export const SHOWCASE_NAVIGATION: readonly NavigationPage[] = [
  { label: "Vanilla", href: "/vanilla/" },
  { label: "React", href: "/react/" },
  { label: "Vue", href: "/vue/" },
  { label: "Svelte", href: "/svelte/" },
];

/**
 * Pages that select the full formula engine. A page can select its engine only
 * before the first engine loads, so links to these pages always open a fresh
 * document instead of a client-side navigation.
 */
const FULL_ENGINE_PATHS: readonly string[] = ["/showcases/formulas/", "/test/formulas-engine/"];

export function opensFreshDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  return FULL_ENGINE_PATHS.includes(path.endsWith("/") ? path : `${path}/`);
}
