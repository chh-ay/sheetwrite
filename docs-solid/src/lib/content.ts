import { normalizeDocumentHref } from "@docs/lib/document-href.js";
import type { OutlineItem } from "@docs/lib/outline.js";
import { type Component, type JSX, lazy } from "solid-js";

export interface DocumentFrontmatter {
  title: string;
  description: string;
  kind?: string;
  outline?: readonly OutlineItem[];
  /** Set on pages the docs generator writes; they have no source to edit. */
  generated?: boolean;
}

/** Element overrides and build-inserted components a compiled page uses. */
export interface DocumentComponents {
  a: Component<JSX.AnchorHTMLAttributes<HTMLAnchorElement>>;
  PackageCommand: Component<{ packages: string; note?: string }>;
  PerfFigure: Component<{ name: string }>;
}

type DocumentComponent = Component<{ components: DocumentComponents }>;

export interface DocumentModule {
  default: DocumentComponent;
  frontmatter?: DocumentFrontmatter;
  stylesheets?: readonly string[];
}

export interface DocumentRecord {
  title: string;
  description: string;
  kind: string | undefined;
  outline: readonly OutlineItem[];
  sourcePath: string | undefined;
  stylesheets: readonly string[];
}

/**
 * The three pages of the comparison, from the docs site's content, and the
 * installation guide, which exercises Tabs (not measured).
 */
const sourceModules = import.meta.glob<DocumentModule>([
  "../../../docs/src/content/docs/start/first-grid.mdx",
  "../../../docs/src/content/docs/api/core.md",
  "../../../docs/src/content/docs/performance/render.md",
  "../../../docs/src/content/docs/start/installation.mdx",
]);

function hrefFromSource(source: string): string {
  const relative = source
    .replace(/^.*\/content\/docs\//, "")
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/\/index$/, "");
  return `/docs/${relative}/`;
}

const DOCUMENT_SOURCES = new Map(
  Object.entries(sourceModules).map(([source, load]) => [
    hrefFromSource(source),
    {
      load,
      component: lazy(load),
      sourcePath: source.replace(/^.*\/docs\/src\//, "docs/src/"),
    },
  ]),
);

const LOADED_MODULES = new Map<string, DocumentModule>();

export async function documentForSplat(
  splat: string | undefined,
): Promise<DocumentRecord | undefined> {
  const href = normalizeDocumentHref(splat);
  const source = DOCUMENT_SOURCES.get(href);
  if (source === undefined) return undefined;
  const module = await source.load();
  LOADED_MODULES.set(href, module);
  return {
    title: module.frontmatter?.title ?? href,
    description: module.frontmatter?.description ?? "Sheetwrite documentation.",
    kind: module.frontmatter?.kind,
    outline: module.frontmatter?.outline ?? [],
    sourcePath: module.frontmatter?.generated ? undefined : source.sourcePath,
    stylesheets: module.stylesheets ?? [],
  };
}

/** The page's component once its loader has loaded the module (in this JS context). */
export function loadedDocumentComponent(splat: string | undefined): DocumentComponent | undefined {
  return LOADED_MODULES.get(normalizeDocumentHref(splat))?.default;
}

/** The page's component, loaded on first render: the hydrating client has no loader-run module. */
export function documentComponentForSplat(
  splat: string | undefined,
): DocumentComponent | undefined {
  return DOCUMENT_SOURCES.get(normalizeDocumentHref(splat))?.component;
}
