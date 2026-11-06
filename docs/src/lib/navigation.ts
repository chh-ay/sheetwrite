import apiNav from "../generated/api-nav.json" with { type: "json" };
// Formula family pages; formula-nav.json is emitted by docs:generate.
import formulaNav from "../generated/formula-nav.json" with { type: "json" };
import type { IconName } from "../icons/icon-names.js";
import { RELEASES, RELEASES_HREF, minorVersion, releaseHref, releaseLabel } from "./releases.js";

interface NavigationEntry {
  label: string;
  /** The entry's sidebar icon, from the Sheetwrite sprite. */
  icon?: IconName;
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

/** The parts of the documentation, one tab each in the top bar. */
export type DocsTabId = "guides" | "api" | "formulas" | "changelog" | "showcases";

/** One top-bar tab: its landing page and icon. */
export interface DocsTab {
  readonly id: DocsTabId;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
}

/** The top-bar tabs, in order. Showcases leaves the documentation. */
export const DOCS_TABS: readonly DocsTab[] = [
  { id: "guides", label: "Guides", href: "/docs/", icon: "tab-guides" },
  { id: "api", label: "API Reference", href: "/docs/api/", icon: "tab-api" },
  {
    id: "formulas",
    label: "Formulas",
    href: "/docs/reference/formula-functions/",
    icon: "tab-formulas",
  },
  { id: "changelog", label: "Changelog", href: RELEASES_HREF, icon: "tab-changelog" },
  { id: "showcases", label: "Showcases", href: "/showcases/", icon: "tab-showcases" },
];

export interface NavigationSection {
  label: string;
  /** The tab whose sidebar lists this section. */
  tab: DocsTabId;
  /** The section's overview page, which lists its pages as cards. */
  href?: string;
  /** The icon of the section's overview row, when it has an overview page. */
  icon?: IconName;
  items: readonly NavigationItem[];
}

/** Each API package's icon, by package name. */
const API_PACKAGE_ICONS: Readonly<Record<string, IconName>> = {
  "@sheetwrite/charts": "chart",
  "@sheetwrite/core": "sheet",
  "@sheetwrite/formulas": "formula",
  "@sheetwrite/queries": "database",
  "@sheetwrite/react": "framework-react",
  "@sheetwrite/svelte": "framework-svelte",
  "@sheetwrite/vue": "framework-vue",
  "@sheetwrite/wasm": "bolt",
  "@sheetwrite/xlsx": "xlsx",
};

/** An API package's icon. Every package has its own; a new one must add it here. */
function apiPackageIcon(name: string): IconName {
  const icon = API_PACKAGE_ICONS[name];
  if (icon === undefined) throw new Error(`No sidebar icon for API package ${name}`);
  return icon;
}

/** Each formula family page's icon, by the family's route slug. */
const FORMULA_FAMILY_ICONS: Readonly<Record<string, IconName>> = {
  array: "spill",
  database: "database",
  "date-time": "clock",
  engineering: "sliders",
  financial: "currency",
  "information-error": "info",
  "logical-control": "logic",
  "lookup-reference": "search",
  math: "plus",
  statistical: "chart",
  text: "type",
};

/** A formula family page's icon. Every family has its own; a new one must add it here. */
function formulaFamilyIcon(href: string): IconName {
  const slug = /\/formula-functions\/([^/]+)\/$/.exec(href)?.[1] ?? "";
  const icon = FORMULA_FAMILY_ICONS[slug];
  if (icon === undefined) throw new Error(`No sidebar icon for formula family ${slug}`);
  return icon;
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
    tab: "guides",
    items: [{ label: "Introduction", href: "/docs/", icon: "book" }],
  },
  {
    label: "Getting started",
    tab: "guides",
    href: "/docs/start/",
    icon: "play",
    items: [
      { label: "Installation", href: "/docs/start/installation/", icon: "package" },
      { label: "First grid", href: "/docs/start/first-grid/", icon: "table" },
      {
        label: "Choose an engine",
        href: "/docs/start/choose-an-engine/",
        icon: "bolt",
        added: RELEASE,
      },
      {
        label: "Upgrade to 0.6.0",
        href: "/docs/start/upgrade-to-0-6-0/",
        icon: "arrow-up",
        added: RELEASE,
      },
      // Not released yet; the label says so beside the 0.6.x version in the header.
      { label: "Upgrade to 0.7.0 (next)", href: "/docs/start/upgrade-to-0-7-0/", icon: "upgrade-next" },
    ],
  },
  {
    label: "Frameworks",
    tab: "guides",
    href: "/docs/frameworks/",
    icon: "frameworks",
    items: [
      { label: "Vanilla", href: "/docs/frameworks/vanilla/", icon: "framework-vanilla" },
      { label: "React", href: "/docs/frameworks/react/", icon: "framework-react" },
      { label: "Vue", href: "/docs/frameworks/vue/", icon: "framework-vue" },
      { label: "Svelte", href: "/docs/frameworks/svelte/", icon: "framework-svelte" },
      { label: "Adapter lifecycle", href: "/docs/frameworks/lifecycle/", icon: "lifecycle" },
    ],
  },
  {
    label: "Concepts",
    tab: "guides",
    href: "/docs/concepts/",
    icon: "lightbulb",
    items: [
      { label: "Runtime ownership", href: "/docs/concepts/runtime-ownership/", icon: "key" },
      {
        label: "Calculation engine",
        href: "/docs/concepts/calculation-engine/",
        icon: "engine",
        updated: RELEASE,
      },
      {
        label: "Documents and operations",
        href: "/docs/concepts/documents-and-operations/",
        icon: "document-ops",
      },
      { label: "Error handling", href: "/docs/concepts/error-handling/", icon: "warning" },
    ],
  },
  {
    label: "Features",
    tab: "guides",
    href: "/docs/features/",
    icon: "sparkle",
    items: [
      {
        label: "Grid",
        href: "/docs/features/grid/",
        icon: "sheet",
        items: [
          {
            label: "Options and presentation",
            href: "/docs/features/grid/options-and-presentation/",
            icon: "sliders",
          },
          {
            label: "Toolbar and ribbon",
            href: "/docs/features/grid/toolbar-and-ribbon/",
            icon: "ribbon",
            added: RELEASE,
          },
          {
            label: "Selection and keyboard",
            href: "/docs/features/grid/selection-and-keyboard/",
            icon: "keyboard",
          },
          {
            label: "Editing and clipboard",
            href: "/docs/features/grid/editing-and-clipboard/",
            icon: "copy",
            updated: RELEASE,
          },
          { label: "Custom editors", href: "/docs/features/grid/custom-editors/", icon: "edit" },
          {
            label: "Resize, merge and fill",
            href: "/docs/features/grid/resize-merge-and-fill/",
            icon: "merge",
          },
          {
            label: "Context menu",
            href: "/docs/features/grid/context-menu/",
            icon: "context-menu",
          },
          { label: "Search", href: "/docs/features/grid/search/", icon: "search" },
          {
            label: "Status bar",
            href: "/docs/features/grid/status-bar/",
            icon: "status-bar",
            added: RELEASE,
          },
          { label: "Touch", href: "/docs/features/grid/touch/", icon: "touch" },
          { label: "Grid methods", href: "/docs/features/grid/grid-methods/", icon: "code" },
        ],
      },
      {
        label: "Formatting",
        href: "/docs/features/formatting/",
        icon: "brush",
        items: [
          {
            label: "Styles and themes",
            href: "/docs/features/formatting/styles/",
            icon: "palette",
          },
          {
            label: "Fonts and alignment",
            href: "/docs/features/formatting/fonts-and-alignment/",
            icon: "type",
            updated: RELEASE,
          },
          {
            label: "Number formats",
            href: "/docs/features/formatting/number-formats/",
            icon: "hash",
          },
          {
            label: "Conditional formats",
            href: "/docs/features/formatting/conditional-formats/",
            icon: "conditional",
          },
        ],
      },
      {
        label: "Data",
        href: "/docs/features/data/",
        icon: "database",
        items: [
          { label: "Data operations", href: "/docs/features/data/data-operations/", icon: "sort" },
          { label: "Datasources", href: "/docs/features/data/datasources/", icon: "server" },
          { label: "Host-owned rows", href: "/docs/features/data/host-owned-rows/", icon: "link" },
          {
            label: "Validation, protection and notes",
            href: "/docs/features/data/validation-protection-and-notes/",
            icon: "shield",
          },
          { label: "Persistence", href: "/docs/features/data/persistence/", icon: "save" },
        ],
      },
      {
        label: "Formulas",
        href: "/docs/features/formulas/",
        icon: "formula",
        items: [
          {
            label: "Authoring and references",
            href: "/docs/features/formulas/authoring-and-references/",
            icon: "cell-reference",
          },
          {
            label: "Operators and reference operators",
            href: "/docs/features/formulas/operators/",
            icon: "plus",
            added: RELEASE,
          },
          {
            label: "Dynamic arrays and spills",
            href: "/docs/features/formulas/dynamic-arrays-and-spills/",
            icon: "spill",
          },
          {
            label: "OFFSET and INDIRECT",
            href: "/docs/features/formulas/offset-and-indirect/",
            icon: "arrow-right",
            added: RELEASE,
          },
          {
            label: "Volatile functions",
            href: "/docs/features/formulas/volatile-functions/",
            icon: "refresh",
            added: RELEASE,
          },
          {
            label: "Iterative calculation",
            href: "/docs/features/formulas/iterative-calculation/",
            icon: "loop",
            added: RELEASE,
          },
          {
            label: "Lookup, criteria and financial rules",
            href: "/docs/features/formulas/lookup-criteria-and-financial/",
            icon: "filter",
          },
          {
            label: "Analysis formulas (full engine)",
            href: "/docs/features/formulas/analysis-formulas/",
            icon: "sigma",
          },
          {
            label: "Custom functions",
            href: "/docs/features/formulas/custom-functions/",
            icon: "function",
          },
          {
            label: "Formula help",
            href: "/docs/features/formulas/formula-help/",
            icon: "info",
          },
        ],
      },
      {
        label: "Analysis",
        href: "/docs/features/analysis/",
        icon: "analysis",
        items: [
          {
            label: "Pivot tables",
            href: "/docs/features/analysis/pivot-tables/",
            icon: "pivot",
            added: RELEASE,
          },
          {
            label: "Charts",
            href: "/docs/features/analysis/charts/",
            icon: "chart",
            added: RELEASE,
          },
          { label: "Dashboards", href: "/docs/features/analysis/dashboards/", icon: "dashboard" },
          { label: "Data model", href: "/docs/features/analysis/data-model/", icon: "layers" },
        ],
      },
      { label: "Collaboration", href: "/docs/features/collaboration/", icon: "users" },
      { label: "Worker rendering", href: "/docs/features/worker-rendering/", icon: "worker" },
      { label: "Accessibility", href: "/docs/features/accessibility/", icon: "accessibility" },
    ],
  },
  {
    label: "Import and export",
    tab: "guides",
    href: "/docs/import-export/",
    icon: "import-export",
    items: [
      { label: "XLSX import", href: "/docs/import-export/xlsx-import/", icon: "upload" },
      { label: "XLSX export", href: "/docs/import-export/xlsx-export/", icon: "download" },
      { label: "CSV and TSV", href: "/docs/import-export/csv-and-tsv/", icon: "file" },
      {
        label: "Kept parts and round trips",
        href: "/docs/import-export/kept-parts-and-round-trips/",
        icon: "restore",
        added: RELEASE,
      },
      {
        label: "Large files and streaming",
        href: "/docs/import-export/large-files-and-streaming/",
        icon: "live",
        updated: RELEASE,
      },
      {
        label: "LibreOffice compatibility",
        href: "/docs/import-export/libreoffice-compatibility/",
        icon: "compare",
        added: RELEASE,
      },
    ],
  },
  {
    label: "Tutorials",
    tab: "guides",
    href: "/docs/tutorials/",
    icon: "graduation",
    items: [
      {
        label: "Excel in JavaScript",
        href: "/docs/tutorials/excel-in-javascript/",
        icon: "framework-vanilla",
        added: RELEASE,
      },
      {
        label: "Excel in React",
        href: "/docs/tutorials/excel-in-react/",
        icon: "framework-react",
        added: RELEASE,
      },
      {
        label: "Excel in Vue",
        href: "/docs/tutorials/excel-in-vue/",
        icon: "framework-vue",
        added: RELEASE,
      },
      {
        label: "Excel in Svelte",
        href: "/docs/tutorials/excel-in-svelte/",
        icon: "framework-svelte",
        added: RELEASE,
      },
      {
        label: "Excel in Node.js",
        href: "/docs/tutorials/excel-in-nodejs/",
        icon: "terminal",
        added: RELEASE,
      },
      {
        label: "Spreadsheet app with the ribbon",
        href: "/docs/tutorials/spreadsheet-app-with-ribbon/",
        icon: "laptop",
        added: RELEASE,
      },
    ],
  },
  {
    label: "Performance",
    tab: "guides",
    href: "/docs/performance/",
    icon: "gauge",
    items: [
      { label: "Render", href: "/docs/performance/render/", icon: "monitor" },
      { label: "Data engine", href: "/docs/performance/data-engine/", icon: "rows" },
      { label: "Core write path", href: "/docs/performance/core-write-path/", icon: "write" },
      { label: "Formula engine", href: "/docs/performance/formula-engine/", icon: "formula-engine" },
      { label: "XLSX codec", href: "/docs/performance/xlsx-codec/", icon: "xlsx" },
      { label: "Delivery size", href: "/docs/performance/delivery-size/", icon: "weight" },
      { label: "Memory", href: "/docs/performance/memory/", icon: "memory" },
      {
        label: "Release comparison",
        href: "/docs/performance/release-comparison/",
        icon: "versions",
      },
      {
        label: "Benchmark protocol",
        href: "/docs/performance/benchmark-protocol/",
        icon: "clock",
      },
    ],
  },
  {
    label: "Reference",
    tab: "api",
    items: [
      { label: "API contract", href: "/docs/reference/api-contract/", icon: "book" },
      { label: "Document operations", href: "/docs/reference/document-operations/", icon: "file" },
      { label: "Events", href: "/docs/reference/events/", icon: "live" },
      {
        label: "Compatibility limits",
        href: "/docs/reference/compatibility-limits/",
        icon: "warning",
      },
      {
        label: "Compatibility results",
        href: "/docs/reference/compatibility-results/",
        icon: "check",
      },
      {
        label: "Package entry points",
        href: "/docs/reference/package-entry-points/",
        icon: "layers",
      },
      { label: "Moved pages", href: "/docs/reference/moved-guides/", icon: "arrow-right" },
    ],
  },
  {
    // Generated from package exports; api-nav.json is emitted by docs:generate.
    label: API_PACKAGES_LABEL,
    tab: "api",
    items: [
      { label: "All entry points", href: "/docs/api/", icon: "package" },
      ...apiNav.map((entry) => ({ ...entry, icon: apiPackageIcon(entry.label) })),
    ],
  },
  {
    label: "Formula functions",
    tab: "formulas",
    items: [
      { label: "Overview", href: "/docs/reference/formula-functions/", icon: "formula" },
      ...formulaNav.map((entry) => ({ ...entry, icon: formulaFamilyIcon(entry.href) })),
      {
        label: "Excel function coverage",
        href: "/docs/reference/excel-function-coverage/",
        icon: "check",
      },
    ],
  },
  {
    label: "Release notes",
    tab: "changelog",
    items: [
      { label: "All releases", href: RELEASES_HREF, icon: "history" },
      ...RELEASES.map((release) => ({
        label: releaseLabel(release),
        href: releaseHref(release.version),
        icon: "release" as const,
      })),
    ],
  },
];

/** The sections a tab's sidebar lists. */
export function tabSections(tab: DocsTabId): readonly NavigationSection[] {
  return DOCS_NAVIGATION.filter((section) => section.tab === tab);
}

/**
 * The tab a documentation page belongs to: the tab of its navigation section,
 * or, for pages outside the navigation (generated API symbols, moved pages),
 * the tab whose landing path prefixes it.
 */
export function tabForHref(activeHref: string | undefined): DocsTabId {
  const section = nearestNavigationItem(activeHref)?.section;
  const tab = DOCS_NAVIGATION.find((entry) => entry.label === section)?.tab;
  if (tab !== undefined) return tab;
  if (activeHref?.startsWith("/docs/api/")) return "api";
  if (activeHref?.startsWith("/docs/reference/formula-functions/")) return "formulas";
  if (activeHref?.startsWith(RELEASES_HREF)) return "changelog";
  return "guides";
}

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

/**
 * Reading order for previous/next links: every authored page in sidebar
 * order, with a section's overview page before the pages it lists.
 */
const READING_ORDER: readonly NavigationPage[] = navigationPages(
  AUTHORED_NAVIGATION.flatMap((section) =>
    section.href === undefined
      ? section.items
      : [{ label: section.label, href: section.href }, ...section.items],
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
export const SHOWCASE_NAVIGATION: readonly [NavigationPage, ...NavigationPage[]] = [
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

/** Where a page sits in the navigation tree. */
export interface NavigationLocation {
  section: string;
  /** The section's overview page, when it has one. */
  sectionHref?: string;
  /** Groups between the section and the page, outermost first. */
  ancestors: readonly NavigationItem[];
  label: string;
  href: string;
}

/**
 * Deepest navigation entry whose href contains the current page, with the
 * groups above it, so the sidebar can open exactly that path and the header
 * can show it.
 */
export function nearestNavigationItem(
  activeHref: string | undefined,
): NavigationLocation | undefined {
  if (activeHref === undefined) return undefined;
  let nearest: NavigationLocation | undefined;
  const visit = (
    section: NavigationSection,
    item: NavigationItem,
    ancestors: NavigationItem[],
  ): void => {
    const { href } = item;
    if (href !== undefined) {
      const matches = activeHref === href || (href !== "/docs/" && activeHref.startsWith(href));
      if (matches && (nearest === undefined || href.length > nearest.href.length)) {
        nearest = {
          section: section.label,
          sectionHref: section.href,
          ancestors: [...ancestors],
          label: item.label,
          href,
        };
      }
    }
    if (item.items === undefined) return;
    ancestors.push(item);
    for (const child of item.items) visit(section, child, ancestors);
    ancestors.pop();
  };
  for (const section of DOCS_NAVIGATION) {
    // A section's overview matches only itself: its URL is a prefix of its
    // pages' URLs, but those belong to their own entries.
    if (section.href === activeHref) {
      return {
        section: section.label,
        sectionHref: section.href,
        ancestors: [],
        label: section.label,
        href: section.href,
      };
    }
    for (const item of section.items) visit(section, item, []);
  }
  return nearest;
}

/** One step of a page's trail; the page itself has no link. */
export interface Crumb {
  href?: string;
  label: string;
}

/**
 * Trail for the page header and the breadcrumb structured data. Section, group
 * and package names come from the same navigation model the sidebar renders,
 * so the two never disagree about where a page sits; the page's own name ends
 * the trail.
 */
export function breadcrumbsFor(activeHref: string | undefined, title: string): readonly Crumb[] {
  const trail: Crumb[] = [{ href: "/docs/", label: "Documentation" }];
  // The overview is the destination itself.
  if (activeHref === undefined || activeHref === "/docs/") return trail;
  const nearest = nearestNavigationItem(activeHref);
  if (nearest === undefined) return [...trail, { label: title }];
  // A section's index page carries the section's name; one crumb is enough.
  if (nearest.section === title) return [...trail, { label: title }];
  trail.push({ label: nearest.section, href: nearest.sectionHref });
  for (const group of nearest.ancestors) trail.push({ href: group.href, label: group.label });
  // The entry the page itself belongs to is not a step above it.
  if (nearest.href !== activeHref) trail.push({ href: nearest.href, label: nearest.label });
  return [...trail, { label: title }];
}
