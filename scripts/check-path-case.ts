import { execFileSync } from "node:child_process";

/**
 * Module files a resolver reaches without their written extension: an import of
 * `./Flight.js` also tries `Flight.ts` and `Flight.tsx`.
 */
const MODULE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/u;

export interface PathCaseClash {
  /** What the clashing paths share once case (and a module extension) is ignored. */
  readonly key: string;
  readonly paths: readonly string[];
}

/**
 * Find tracked paths a case-insensitive file system (macOS, Windows) cannot tell
 * apart: two paths, or two directories on the way to them, that differ only by
 * case, and two modules in one directory whose names differ only by case once
 * their extensions are dropped, because import resolution tries each extension.
 */
export function findPathCaseClashes(paths: readonly string[]): PathCaseClash[] {
  const spellings = new Map<string, Set<string>>();
  const record = (key: string, path: string): void => {
    const known = spellings.get(key);
    if (known) known.add(path);
    else spellings.set(key, new Set([path]));
  };
  for (const path of paths) {
    const segments = path.split("/");
    for (let end = 1; end <= segments.length; end++) {
      const prefix = segments.slice(0, end).join("/");
      record(prefix.toLowerCase(), prefix);
    }
    if (MODULE_EXTENSION.test(path)) {
      const stem = path.replace(MODULE_EXTENSION, "");
      record(`${stem.toLowerCase()}.<module>`, stem);
    }
  }
  return [...spellings]
    .filter(([, spelled]) => spelled.size > 1)
    .map(([key, spelled]) => ({ key, paths: [...spelled].sort() }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

if (import.meta.main) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path.length > 0);
  const clashes = findPathCaseClashes(tracked);
  for (const clash of clashes) {
    console.error(`paths differ only by case: ${clash.paths.join(", ")}`);
  }
  if (clashes.length > 0) {
    console.error("Rename one of them: a case-insensitive file system resolves both to one file.");
    process.exitCode = 1;
  }
}
