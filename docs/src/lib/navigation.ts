import apiNav from "../generated/api-nav.json";

export interface NavigationItem {
  label: string;
  href: string;
}

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
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
      { label: "What's new in 0.5.0", href: "/docs/start/whats-new/" },
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
    // Generated from package exports; api-nav.json is emitted by docs:generate.
    label: API_PACKAGES_LABEL,
    items: [{ label: "All entry points", href: "/docs/api/" }, ...apiNav],
  },
];

/**
 * Reading order for previous/next links: every authored entry in sidebar
 * order. Generated API packages are excluded so a reader never gets a "Next"
 * that hops between hundreds of generated entry points.
 */
const READING_ORDER: readonly NavigationItem[] = DOCS_NAVIGATION.filter(
  (section) => section.label !== API_PACKAGES_LABEL,
).flatMap((section) => section.items);

export interface DocumentNeighbours {
  previous?: NavigationItem;
  next?: NavigationItem;
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
export const SHOWCASE_NAVIGATION: readonly NavigationItem[] = [
  { label: "Vanilla", href: "/vanilla/" },
  { label: "React", href: "/react/" },
  { label: "Vue", href: "/vue/" },
  { label: "Svelte", href: "/svelte/" },
];
