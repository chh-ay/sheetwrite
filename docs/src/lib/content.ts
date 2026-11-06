import { type AnchorHTMLAttributes, type ComponentType, use } from "react";

import type { OutlineItem } from "./outline.js";

export interface DocumentFrontmatter {
  title: string;
  description: string;
  /** Declaration kind of a generated API symbol page (`interface`, `function`, …). */
  kind?: string;
  /** The page's outline, collected at build time; see lib/outline.ts. */
  outline?: readonly OutlineItem[];
}

/** Element overrides and build-inserted components a compiled MDX document uses. */
export interface DocumentComponents {
  a?: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>;
  /** Install fences become this terminal at build time; see vite.config.ts. */
  PackageCommand?: ComponentType<{ packages: string; note?: string }>;
  /** A formula family's table and filter; see FormulaReference.tsx. */
  FormulaReference?: ComponentType<{ family: string }>;
}

type DocumentComponent = ComponentType<{ components?: DocumentComponents }>;

export interface DocumentModule {
  default: DocumentComponent;
  frontmatter?: DocumentFrontmatter;
  /** Stylesheets of the components the page uses that most pages do not (lib/content-components.ts). */
  stylesheets?: readonly string[];
}

interface DocumentSource {
  fallbackTitle: string;
  load: () => Promise<DocumentModule>;
}

export type DocumentRecord = DocumentFrontmatter & { stylesheets: readonly string[] };

const sourceModules = import.meta.glob<DocumentModule>("../content/docs/**/*.{md,mdx}");

function hrefFromSource(source: string): string {
  const relative = source
    .replace(/^\.\.\/content\/docs\//, "")
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/(^|\/)index$/, "");
  return `/docs/${relative}/`.replace(/\/+/g, "/");
}

const DOCUMENT_SOURCES: ReadonlyMap<string, DocumentSource> = new Map(
  Object.entries(sourceModules).map(([source, load]) => {
    const href = hrefFromSource(source);
    const fallbackTitle =
      href.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Sheetwrite";
    return [href, { fallbackTitle, load }];
  }),
);

export function normalizeDocumentHref(splat: string | undefined): string {
  const path = splat?.replace(/^\/+|\/+$/g, "") ?? "";
  return `/docs/${path}${path.length === 0 ? "" : "/"}`;
}

/** Document modules already loaded, by href: they render without suspending. */
const loadedModules = new Map<string, DocumentModule>();
/** One load per document, shared by the route loader and the page render. */
const moduleLoads = new Map<string, Promise<DocumentModule>>();

function loadModule(href: string, source: DocumentSource): Promise<DocumentModule> {
  let load = moduleLoads.get(href);
  if (load === undefined) {
    load = source.load().then((module) => {
      loadedModules.set(href, module);
      return module;
    });
    moduleLoads.set(href, load);
  }
  return load;
}

export async function documentForSplat(
  splat: string | undefined,
): Promise<DocumentRecord | undefined> {
  const href = normalizeDocumentHref(splat);
  const source = DOCUMENT_SOURCES.get(href);
  if (source === undefined) return undefined;
  const module = await loadModule(href, source);
  return {
    title: module.frontmatter?.title ?? source.fallbackTitle,
    description: module.frontmatter?.description ?? "Sheetwrite documentation.",
    kind: module.frontmatter?.kind,
    outline: module.frontmatter?.outline ?? [],
    stylesheets: module.stylesheets ?? [],
  };
}

/** Whether a documentation page exists at the splat. */
export function hasDocument(splat: string | undefined): boolean {
  return DOCUMENT_SOURCES.has(normalizeDocumentHref(splat));
}

/**
 * The page's compiled document, read while rendering. The route loader has
 * already loaded it on the server and on client navigations, so the article
 * renders in the same pass and the prerendered page holds it in full. Only
 * the first render after a page load waits for the module, while hydration
 * keeps the server's article on screen.
 */
export function useDocumentComponent(splat: string | undefined): DocumentComponent | undefined {
  const href = normalizeDocumentHref(splat);
  const source = DOCUMENT_SOURCES.get(href);
  if (source === undefined) return undefined;
  return (loadedModules.get(href) ?? use(loadModule(href, source))).default;
}
