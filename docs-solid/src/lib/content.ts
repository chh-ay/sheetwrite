import { normalizeDocumentHref } from "@docs/lib/document-href.js";
import type { OutlineItem } from "@docs/lib/outline.js";
import type { Component } from "solid-js";

export interface DocumentFrontmatter {
  title: string;
  description: string;
  /** Declaration kind of a generated API symbol page (`interface`, `function`, …). */
  kind?: string;
  /** The page's outline, collected at build time; see docs/src/lib/outline.ts. */
  outline?: readonly OutlineItem[];
  /** Set on pages the docs generator writes; they have no source to edit. */
  generated?: boolean;
}

/** Build-inserted components a compiled page uses. */
export interface DocumentComponents {
  /** Install fences become this terminal at build time; see docs/vite.config.ts. */
  PackageCommand: Component<{ packages: string; note?: string }>;
  /** A formula family's table and filter. */
  FormulaReference: Component<{ family: string }>;
  /** A Performance page's figure, static markup from the docs generator. */
  PerfFigure: Component<{ name: string }>;
}

type DocumentComponent = Component<{ components: DocumentComponents }>;

export interface DocumentModule {
  default: DocumentComponent;
  frontmatter?: DocumentFrontmatter;
  /** Stylesheets of the components the page uses that most pages do not. */
  stylesheets?: readonly string[];
}

export interface DocumentRecord {
  title: string;
  description: string;
  kind: string | undefined;
  outline: readonly OutlineItem[];
  /** The page's source file in the repository; generated pages have none. */
  sourcePath: string | undefined;
  stylesheets: readonly string[];
}

/** Every docs page, from the docs site's content (generated pages included). */
const sourceModules = import.meta.glob<DocumentModule>(
  "../../../docs/src/content/docs/**/*.{md,mdx}",
);

function hrefFromSource(source: string): string {
  const relative = source
    .replace(/^.*\/content\/docs\//, "")
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/(?:^|\/)index$/, "");
  return relative.length === 0 ? "/docs/" : `/docs/${relative}/`;
}

const DOCUMENT_SOURCES = new Map(
  Object.entries(sourceModules).map(([source, load]) => {
    const href = hrefFromSource(source);
    return [
      href,
      {
        load,
        fallbackTitle: href.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Sheetwrite",
        sourcePath: source.replace(/^.*\/docs\/src\//, "docs/src/"),
      },
    ];
  }),
);

/** Modules `documentForSplat` has loaded, by page: the static page renders them synchronously. */
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
    title: module.frontmatter?.title ?? source.fallbackTitle,
    description: module.frontmatter?.description ?? "Sheetwrite documentation.",
    kind: module.frontmatter?.kind,
    outline: module.frontmatter?.outline ?? [],
    sourcePath: module.frontmatter?.generated ? undefined : source.sourcePath,
    stylesheets: module.stylesheets ?? [],
  };
}

/**
 * The page's compiled component once its loader ran `documentForSplat`. Pages
 * render once, at build time, so they never wait for a lazy module.
 */
export function loadedDocumentComponent(splat: string | undefined): DocumentComponent | undefined {
  return LOADED_MODULES.get(normalizeDocumentHref(splat))?.default;
}
