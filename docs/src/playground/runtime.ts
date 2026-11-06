import { RUNNABLE_IMPORTS, type RunnableImport } from "../lib/runnable-code.js";
import { siteGridTheme } from "../showcases/site-grid-theme.js";
import { type PackageExports, type PlaygroundRuntime, RUNTIME_KEY } from "./runtime-contract.js";

import coreStylesUrl from "@sheetwrite/core/styles.css?url";

/**
 * The module side of a runnable example. It runs inside the example's frame,
 * not in the page: the build bundles it on its own (as a worker bundle, see
 * run-example.ts), and the frame imports it by its address, so the page
 * never loads the engine and the frame gets its own copy of every package
 * the example imports. Each run starts in a new frame, so an example can
 * choose its engine, and a reset leaves nothing behind.
 */

/** A grid the example made; only its theme is used here. */
interface ThemedGrid {
  setTheme(theme: object): void;
}

/** The grids the example made, each with the theme the example gave it. */
const grids = new Map<ThemedGrid, object | undefined>();

/** A stylesheet in the frame, resolved once it has loaded. */
function linkStylesheet(href: string): Promise<void> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error(`Could not load ${href}`)), {
      once: true,
    });
  });
  document.head.append(link);
  return loaded;
}

/**
 * Core with the site's grid theme as the default, so the example's grid
 * matches the page in light and dark. A theme the example passes still wins.
 */
async function coreWithSiteTheme(): Promise<PackageExports> {
  const core = await import("@sheetwrite/core");
  const themed = <Options extends { theme?: object }>(options: Options): Options => ({
    ...options,
    theme: { ...siteGridTheme(), ...options.theme },
  });
  const track = <Created extends ThemedGrid>(grid: Created, theme: object | undefined) => {
    grids.set(grid, theme);
    return grid;
  };
  return {
    ...core,
    createGrid: (host: HTMLElement, options: Parameters<typeof core.createGrid>[1]) =>
      track(core.createGrid(host, themed(options)), options.theme),
    createGridFromSnapshot: (
      host: HTMLElement,
      snapshot: unknown,
      options?: Parameters<typeof core.createGridFromSnapshot>[2],
    ) => track(core.createGridFromSnapshot(host, snapshot, themed(options ?? {})), options?.theme),
  };
}

/** The packages an example can import, and how the frame loads each one. */
const PACKAGES: Readonly<Record<RunnableImport, () => Promise<PackageExports>>> = {
  "@sheetwrite/core": coreWithSiteTheme,
  "@sheetwrite/core/styles.css": async () => {
    await linkStylesheet(coreStylesUrl);
    return {};
  },
  "@sheetwrite/formulas": () => import("@sheetwrite/formulas"),
  "@sheetwrite/charts": () => import("@sheetwrite/charts"),
};

/** Whether a runnable example may import `specifier`. */
function isRunnableImport(specifier: string): specifier is RunnableImport {
  return (RUNNABLE_IMPORTS as readonly string[]).includes(specifier);
}

async function loadPackages(
  specifiers: readonly string[],
): Promise<ReadonlyMap<string, PackageExports>> {
  const runnable = specifiers.filter(isRunnableImport);
  const unknown = specifiers.find((specifier) => !isRunnableImport(specifier));
  if (unknown !== undefined) {
    throw new Error(
      `Try it can import only ${RUNNABLE_IMPORTS.join(", ")}. This example imports ${unknown}.`,
    );
  }
  const loaded = await Promise.all(
    runnable.map(async (specifier) => [specifier, await PACKAGES[specifier]()] as const),
  );
  return new Map(loaded);
}

function applySiteTheme(): void {
  for (const [grid, theme] of grids) grid.setTheme({ ...siteGridTheme(), ...theme });
}

Reflect.set(globalThis, RUNTIME_KEY, { loadPackages, applySiteTheme } satisfies PlaygroundRuntime);
