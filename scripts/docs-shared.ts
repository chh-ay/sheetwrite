import { access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export const repositoryRoot = resolve(import.meta.dir, "..");
export const contentRoot = join(repositoryRoot, "docs/src/content/docs");
export const generatedDataRoot = join(repositoryRoot, "docs/src/generated");
export const generatedManifestPath = join(generatedDataRoot, "public-api.json");
export const docsContractPath = join(generatedDataRoot, "docs-contract.json");

export const MIGRATION_ROUTES = {
  "docs/README.md": "/docs/start/installation/",
  "docs/getting-started.md": "/docs/start/installation/",
  "docs/concepts.md": "/docs/concepts/runtime-ownership/",
  "docs/configuration.md": "/docs/features/grid/options-and-presentation/",
  "docs/framework-integration.md": "/docs/frameworks/lifecycle/",
  "docs/interaction.md": "/docs/features/grid/selection-and-keyboard/",
  "docs/data-operations.md": "/docs/features/data/data-operations/",
  "docs/formulas.md": "/docs/features/formulas/authoring-and-references/",
  "docs/collaboration.md": "/docs/features/collaboration/",
  "docs/worker-rendering.md": "/docs/features/worker-rendering/",
  "docs/styling.md": "/docs/features/formatting/styles/",
  "docs/accessibility.md": "/docs/features/accessibility/",
} as const;

export const PACKAGE_DIRECTORIES: Readonly<Record<string, string>> = {
  "@sheetwrite/charts": "packages/charts",
  "@sheetwrite/core": "packages/core",
  "@sheetwrite/formulas": "packages/formulas",
  "@sheetwrite/queries": "packages/queries",
  "@sheetwrite/react": "packages/react",
  "@sheetwrite/svelte": "packages/svelte",
  "@sheetwrite/vue": "packages/vue",
  "@sheetwrite/wasm": "packages/wasm",
  "@sheetwrite/xlsx": "packages/xlsx",
};

export const REQUIRED_SEARCH_TARGETS = [
  { term: "rendererKind", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  {
    term: "onGridChange",
    packageName: "@sheetwrite/core",
    subpath: "./adapter",
    owner: "GridAdapterEventHandlers",
  },
  { term: "applyTransaction", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
  { term: "getCellAtPoint", packageName: "@sheetwrite/core", subpath: ".", owner: "Grid" },
] as const;

export interface ExpectedFile {
  path: string;
  content: string;
}

export interface MarkdownDocument {
  path: string;
  content: string;
}

export interface Fence {
  language: string;
  meta: string;
  code: string;
  line: number;
}

export function posix(path: string): string {
  return path.split(sep).join("/");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
