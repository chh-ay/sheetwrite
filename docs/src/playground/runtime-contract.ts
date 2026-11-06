/**
 * How the page reaches the playground runtime (runtime.ts) in an example's
 * frame. The runtime is a separate bundle, so the page never loads the
 * packages it imports; once the frame has imported it, it publishes these
 * functions on the frame's global object under {@link RUNTIME_KEY}.
 */

/** A package as an example sees it: the names it exports. */
export type PackageExports = Readonly<Record<string, unknown>>;

/** The functions the runtime publishes in its frame. */
export interface PlaygroundRuntime {
  /** Loads every package an example imports, keyed by its import specifier. */
  loadPackages(specifiers: readonly string[]): Promise<ReadonlyMap<string, PackageExports>>;
  /** Repaints the example's grids with the site theme after the page theme changes. */
  applySiteTheme(): void;
}

/** The global key of the runtime in a frame; `Symbol.for` gives every realm the same key. */
export const RUNTIME_KEY = Symbol.for("sheetwrite.playground.runtime");
