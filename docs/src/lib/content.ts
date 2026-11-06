import {
  type AnchorHTMLAttributes,
  type ComponentType,
  type LazyExoticComponent,
  lazy,
} from "react";

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
  component: LazyExoticComponent<DocumentComponent>;
  fallbackTitle: string;
  load: () => Promise<DocumentModule>;
}

export type DocumentRecord = DocumentFrontmatter & { stylesheets: readonly string[] };

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
    return [href, { component: lazy(load), fallbackTitle, load }];
  }),
);

export function normalizeDocumentHref(splat: string | undefined): string {
  const path = splat?.replace(/^\/+|\/+$/g, "") ?? "";
  return `/docs/${path}${path.length === 0 ? "" : "/"}`;
}

export async function documentForSplat(
  splat: string | undefined,
): Promise<DocumentRecord | undefined> {
  const source = DOCUMENT_SOURCES.get(normalizeDocumentHref(splat));
  if (source === undefined) return undefined;
  const module = await source.load();
  return {
    title: module.frontmatter?.title ?? source.fallbackTitle,
    description: module.frontmatter?.description ?? "Sheetwrite documentation.",
    kind: module.frontmatter?.kind,
    outline: module.frontmatter?.outline ?? [],
    stylesheets: module.stylesheets ?? [],
  };
}

export function documentComponentForSplat(
  splat: string | undefined,
): LazyExoticComponent<DocumentComponent> | undefined {
  return DOCUMENT_SOURCES.get(normalizeDocumentHref(splat))?.component;
}
