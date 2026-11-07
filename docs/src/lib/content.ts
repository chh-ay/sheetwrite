import {
  type AnchorHTMLAttributes,
  type ComponentType,
  type LazyExoticComponent,
  lazy,
} from "react";

import { normalizeDocumentHref } from "./document-href.js";
import type { OutlineItem } from "./outline.js";

export interface DocumentFrontmatter {
  title: string;
  description: string;
  /** Declaration kind of a generated API symbol page (`interface`, `function`, …). */
  kind?: string;
  /** The page's outline, collected at build time; see lib/outline.ts. */
  outline?: readonly OutlineItem[];
  /** Set on pages the docs generator writes; see `markGeneratedPages` in lib/generated-content.ts. */
  generated?: boolean;
}

/** Element overrides and build-inserted components a compiled MDX document uses. */
export interface DocumentComponents {
  a?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>;
  /** Install fences become this terminal at build time; see vite.config.ts. */
  PackageCommand?: ComponentType<{ packages: string; note?: string }>;
  /**
   * A formula family's table and filter: loaded with its page on the router
   * site, an island on static pages; see FormulaReference.tsx.
   */
  FormulaReference?: ComponentType<{ family: string }>;
  /** A Performance page's figure, a static HTML asset, loaded with its page; see PerfFigure.tsx. */
  PerfFigure?: LazyExoticComponent<ComponentType<{ name: string }>>;
}

type DocumentComponent = ComponentType<{ components?: DocumentComponents }>;

export interface DocumentModule {
  default: DocumentComponent;
  frontmatter?: DocumentFrontmatter;
  /** Stylesheets of the components the page uses that most pages do not (lib/content-components.ts). */
  stylesheets?: readonly string[];
}

interface DocumentSource {
  component: LazyExoticComponent<DocumentComponent>;
  fallbackTitle: string;
  load: () => Promise<DocumentModule>;
  /** The glob key, `../content/docs/<page>.md`, relative to `docs/src/lib`. */
  key: string;
}

export type DocumentRecord = DocumentFrontmatter & {
  stylesheets: readonly string[];
  /** The page's source file in the repository; generated pages have none. */
  sourcePath: string | undefined;
};

const sourceModules = import.meta.glob<DocumentModule>("../content/docs/**/*.{md,mdx}");

function hrefFromSource(source: string): string {
  const relative = source
    .replace(/^\.\.\/content\/docs\//, "")
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/\/index$/, "");
  return `/docs/${relative}/`.replace(/\/+/g, "/");
}

const DOCUMENT_SOURCES: ReadonlyMap<string, DocumentSource> = new Map(
  Object.entries(sourceModules).map(([source, load]) => {
    const href = hrefFromSource(source);
    const fallbackTitle =
      href.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Sheetwrite";
    return [href, { component: lazy(load), fallbackTitle, load, key: source }];
  }),
);

/** Modules `documentForSplat` has loaded, by page: the static docs render reads them synchronously. */
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
    sourcePath: module.frontmatter?.generated ? undefined : source.key.replace("..", "docs/src"),
    stylesheets: module.stylesheets ?? [],
  };
}

export function documentComponentForSplat(
  splat: string | undefined,
): LazyExoticComponent<DocumentComponent> | undefined {
  return DOCUMENT_SOURCES.get(normalizeDocumentHref(splat))?.component;
}

/**
 * The page's compiled component once its loader ran `documentForSplat`, for a
 * render that must not suspend: the static docs page renders its islands as
 * separate roots, which cannot wait for a lazy article.
 */
export function loadedDocumentComponent(splat: string | undefined): DocumentComponent | undefined {
  return LOADED_MODULES.get(normalizeDocumentHref(splat))?.default;
}
