import apiNav from "../generated/api-nav.json" with { type: "json" };
// Formula family pages; formula-nav.json is emitted by docs:generate.
import formulaNav from "../generated/formula-nav.json" with { type: "json" };
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

/** Narrows a linkable entry without copying its authored metadata. */
function isPage(item: NavigationItem): item is NavigationPage {
  return item.href !== undefined;
}

/** The one generated section; the authored sections leave it out. */
const API_PACKAGES_LABEL = "API packages";

/** Release whose pages carry New and Updated badges in this tree. */
const RELEASE = "0.6.0";

export const DOCS_NAVIGATION: readonly NavigationSection[] = [
  {
    label: "Overview",
    items: [{ label: "Overview", href: "/docs/" }],
  },
  {
    label: "Getting started",
    items: [
      { label: "Installation", href: "/docs/start/installation/" },
      { label: "First grid", href: "/docs/start/first-grid/" },
      { label: "Choose an engine", href: "/docs/start/choose-an-engine/", added: RELEASE },
      { label: "Upgrade to 0.6.0", href: "/docs/start/upgrade-to-0-6-0/", added: RELEASE },
    ],
  },
  {
    label: "Frameworks",
    items: [
      { label: "Vanilla", href: "/docs/frameworks/vanilla/" },
      { label: "React", href: "/docs/frameworks/react/" },
      { label: "Vue", href: "/docs/frameworks/vue/" },
      { label: "Svelte", href: "/docs/frameworks/svelte/" },
      { label: "Adapter lifecycle", href: "/docs/frameworks/lifecycle/" },
    ],
  },
  {
    label: "Concepts",
    items: [
      { label: "Runtime ownership", href: "/docs/concepts/runtime-ownership/" },
      {
        label: "Calculation engine",
        href: "/docs/concepts/calculation-engine/",
        updated: RELEASE,
      },
      { label: "Documents and operations", href: "/docs/concepts/documents-and-operations/" },
      { label: "Error handling", href: "/docs/concepts/error-handling/" },
    ],
  },
  {
    label: "Features",
    items: [
      {
        label: "Grid",
        href: "/docs/features/grid/",
        items: [
          {
            label: "Options and presentation",
            href: "/docs/features/grid/options-and-presentation/",
          },
          {
            label: "Toolbar and ribbon",
            href: "/docs/features/grid/toolbar-and-ribbon/",
            added: RELEASE,
          },
          { label: "Selection and keyboard", href: "/docs/features/grid/selection-and-keyboard/" },
          {
            label: "Editing and clipboard",
            href: "/docs/features/grid/editing-and-clipboard/",
            updated: RELEASE,
          },
          { label: "Custom editors", href: "/docs/features/grid/custom-editors/" },
          { label: "Resize, merge and fill", href: "/docs/features/grid/resize-merge-and-fill/" },
          { label: "Context menu", href: "/docs/features/grid/context-menu/" },
          { label: "Search", href: "/docs/features/grid/search/" },
          { label: "Status bar", href: "/docs/features/grid/status-bar/", added: RELEASE },
          { label: "Touch", href: "/docs/features/grid/touch/" },
          { label: "Grid methods", href: "/docs/features/grid/grid-methods/" },
        ],
      },
      {
        label: "Formatting",
        href: "/docs/features/formatting/",
        items: [
          { label: "Styles and themes", href: "/docs/features/formatting/styles/" },
          {
            label: "Fonts and alignment",
            href: "/docs/features/formatting/fonts-and-alignment/",
            updated: RELEASE,
          },
          { label: "Number formats", href: "/docs/features/formatting/number-formats/" },
          { label: "Conditional formats", href: "/docs/features/formatting/conditional-formats/" },
        ],
      },
      {
        label: "Data",
        href: "/docs/features/data/",
        items: [
          { label: "Data operations", href: "/docs/features/data/data-operations/" },
          { label: "Datasources", href: "/docs/features/data/datasources/" },
          { label: "Host-owned rows", href: "/docs/features/data/host-owned-rows/" },
          {
            label: "Validation, protection and notes",
            href: "/docs/features/data/validation-protection-and-notes/",
          },
          { label: "Persistence", href: "/docs/features/data/persistence/" },
        ],
      },
      {
        label: "Formulas",
        href: "/docs/features/formulas/",
        items: [
          {
            label: "Authoring and references",
            href: "/docs/features/formulas/authoring-and-references/",
          },
          {
            label: "Operators and reference operators",
            href: "/docs/features/formulas/operators/",
            added: RELEASE,
          },
          {
            label: "Dynamic arrays and spills",
            href: "/docs/features/formulas/dynamic-arrays-and-spills/",
          },
          {
            label: "OFFSET and INDIRECT",
            href: "/docs/features/formulas/offset-and-indirect/",
            added: RELEASE,
          },
          {
            label: "Volatile functions",
            href: "/docs/features/formulas/volatile-functions/",
            added: RELEASE,
          },
          {
            label: "Iterative calculation",
            href: "/docs/features/formulas/iterative-calculation/",
            added: RELEASE,
          },
          {
            label: "Lookup, criteria and financial rules",
            href: "/docs/features/formulas/lookup-criteria-and-financial/",
          },
          {
            label: "Analysis formulas (full engine)",
            href: "/docs/features/formulas/analysis-formulas/",
          },
        ],
      },
      {
        label: "Analysis",
        href: "/docs/features/analysis/",
        items: [
          { label: "Pivot tables", href: "/docs/features/analysis/pivot-tables/", added: RELEASE },
          { label: "Charts", href: "/docs/features/analysis/charts/", added: RELEASE },
        ],
      },
      { label: "Collaboration", href: "/docs/features/collaboration/" },
      { label: "Worker rendering", href: "/docs/features/worker-rendering/" },
      { label: "Accessibility", href: "/docs/features/accessibility/" },
    ],
  },
  {
    label: "Import and export",
    items: [
      { label: "XLSX import", href: "/docs/import-export/xlsx-import/" },
      { label: "XLSX export", href: "/docs/import-export/xlsx-export/" },
      { label: "CSV and TSV", href: "/docs/import-export/csv-and-tsv/" },
      {
        label: "Kept parts and round trips",
        href: "/docs/import-export/kept-parts-and-round-trips/",
        added: RELEASE,
      },
      {
        label: "Large files and streaming",
        href: "/docs/import-export/large-files-and-streaming/",
        updated: RELEASE,
      },
      {
        label: "LibreOffice compatibility",
        href: "/docs/import-export/libreoffice-compatibility/",
        added: RELEASE,
      },
    ],
  },
  {
    label: "Tutorials",
    items: [
      {
        label: "Excel in JavaScript",
        href: "/docs/tutorials/excel-in-javascript/",
        added: RELEASE,
      },
      { label: "Excel in React", href: "/docs/tutorials/excel-in-react/", added: RELEASE },
      { label: "Excel in Vue", href: "/docs/tutorials/excel-in-vue/", added: RELEASE },
      { label: "Excel in Svelte", href: "/docs/tutorials/excel-in-svelte/", added: RELEASE },
      { label: "Excel in Node.js", href: "/docs/tutorials/excel-in-nodejs/", added: RELEASE },
      {
        label: "Spreadsheet app with the ribbon",
        href: "/docs/tutorials/spreadsheet-app-with-ribbon/",
        added: RELEASE,
      },
    ],
  },
  {
    label: "Performance",
    items: [
      {
        label: "Overview",
        href: "/docs/performance/",
        items: [
          { label: "Render", href: "/docs/performance/render/" },
          { label: "Data engine", href: "/docs/performance/data-engine/" },
          { label: "Core write path", href: "/docs/performance/core-write-path/" },
          { label: "Formula engine", href: "/docs/performance/formula-engine/" },
          { label: "XLSX codec", href: "/docs/performance/xlsx-codec/" },
          { label: "Delivery size", href: "/docs/performance/delivery-size/" },
          { label: "Memory", href: "/docs/performance/memory/" },
          { label: "Benchmark protocol", href: "/docs/performance/benchmark-protocol/" },
        ],
      },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "API contract", href: "/docs/reference/api-contract/" },
      {
        label: "Formula functions",
        href: "/docs/reference/formula-functions/",
        items: formulaNav,
      },
      { label: "Document operations", href: "/docs/reference/document-operations/" },
      { label: "Events", href: "/docs/reference/events/" },
      { label: "Compatibility limits", href: "/docs/reference/compatibility-limits/" },
      { label: "Compatibility results", href: "/docs/reference/compatibility-results/" },
      { label: "Package entry points", href: "/docs/reference/package-entry-points/" },
      { label: "Moved pages", href: "/docs/reference/moved-guides/" },
    ],
  },
  {
    // Generated from package exports; api-nav.json is emitted by docs:generate.
    label: API_PACKAGES_LABEL,
    items: [{ label: "All entry points", href: "/docs/api/" }, ...apiNav],
  },
  {
    label: "Release notes",
    items: [
      { label: "All releases", href: RELEASES_HREF },
      ...RELEASES.map((release) => ({
        label: `${release.version} · ${releaseDate(release)}`,
        href: releaseHref(release.version),
      })),
    ],
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
 * The authored sections, in sidebar order. The generated API packages are
 * left out, so a reader never gets a "Next" link that hops between hundreds of
 * generated entry points, and llms.txt lists only authored guides.
 */
export const AUTHORED_NAVIGATION: readonly NavigationSection[] = DOCS_NAVIGATION.filter(
  (section) => section.label !== API_PACKAGES_LABEL,
);

/** Reading order for previous/next links: every authored page in sidebar order. */
const READING_ORDER: readonly NavigationPage[] = navigationPages(
  AUTHORED_NAVIGATION.flatMap((section) => section.items),
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
