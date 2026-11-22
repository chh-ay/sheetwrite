import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { gunzipSync } from "node:zlib";

/** A home directory names one developer's machine; committed files must stay portable. */
const HOME_PATH =
  /\/home\/[^/\s"'`]+\/|\/Users\/[^/\s"'`]+\/|[A-Za-z]:\\{1,2}Users\\{1,2}|~\/learn\//u;
/** The benchmark machines' host names. Split so this file does not name them. */
const HOST_NAME = new RegExp(
  `${["zeph", "yrus"].join("")}|${["chh", "ayy"].join("")}(?:-2)?\\.local`,
  "iu",
);
const LOCKFILE =
  /(?:^|\/)(?:bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)$/u;
const BINARY_BYTE = 0;
const GZIP_MAGIC = [0x1f, 0x8b] as const;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/u;

/** Regular files only: symlinks and submodule gitlinks resolve to directories. */
const REGULAR_FILE_MODE = /^100(?:644|755) /u;
const SYMLINK_MODE = /^120000 /u;

/**
 * Benchmark captures committed before captures recorded a machine label
 * (`bench/src/machine-label.ts`). Each records a capture machine's host name;
 * home-directory paths are still checked in them, and any other file that
 * names a host fails.
 */
const HOST_NAME_CAPTURES: ReadonlySet<string> = new Set([
  "bench/results/capture-attempts/comparison-before-portability.json.gz",
  "bench/results/capture-attempts/formula-054-single-cpu-receipt.json.gz",
  "bench/results/capture-attempts/formula-affinity-npm-11.20.0-054-receipt.json",
  "bench/results/capture-attempts/formula-affinity-npm-11.20.0-060-receipt.json",
  "bench/results/capture-attempts/formula-attempt-1.json",
  "bench/results/capture-attempts/formula-attempt-2.json",
  "bench/results/capture-attempts/formula-before-portability-baseline-receipt.json.gz",
  "bench/results/capture-attempts/formula-cpu-4-6/baseline/capture-runs/formula-engines.json.gz",
  "bench/results/capture-attempts/formula-cpu-4-6/baseline/capture-runs/formula.json",
  "bench/results/capture-attempts/formula-cpu-4-6/baseline/capture-runs/formula-matched.json.gz",
  "bench/results/capture-attempts/formula-cpu-4-6/candidate/capture-runs/formula-engines.json",
  "bench/results/capture-attempts/formula-cpu-4-6/candidate/capture-runs/formula.json",
  "bench/results/capture-attempts/formula-cpu-4-6/candidate/capture-runs/formula-matched.json",
  "bench/results/capture-attempts/formula-cpu-4-6/release-comparison.json.gz",
  "bench/results/capture-attempts/regression-baseline-cancelled-retry-running-receipt.json",
  "bench/results/capture-attempts/regression-baseline-untracked-handoff-receipt.json",
  "bench/results/capture-attempts/xirr-control-scope.json",
  "bench/results/capture-runs/chart-tracking.json",
  "bench/results/capture-runs/core-paths.json",
  "bench/results/capture-runs/data.json",
  "bench/results/capture-runs/formula-engines.json",
  "bench/results/capture-runs/formula.json",
  "bench/results/capture-runs/formula-matched.json",
  "bench/results/capture-runs/interaction.json",
  "bench/results/capture-runs/paged.json",
  "bench/results/capture-runs/pivot.json",
  "bench/results/capture-runs/regression-baseline.json",
  "bench/results/capture-runs/render-scale.json",
  "bench/results/capture-runs/xlsx.json",
  "bench/results/chart-tracking-results.json",
  "bench/results/machines/mac/chart-tracking-results.json",
  "bench/results/machines/mac/pivot-results.json",
  "bench/results/pivot-results.json",
  "bench/results/release-comparison.json",
  "bench/results/releases/0.5.4/capture-runs/core-paths.json",
  "bench/results/releases/0.5.4/capture-runs/data.json",
  "bench/results/releases/0.5.4/capture-runs/formula-engines.json",
  "bench/results/releases/0.5.4/capture-runs/formula.json",
  "bench/results/releases/0.5.4/capture-runs/formula-matched.json",
  "bench/results/releases/0.5.4/capture-runs/interaction.json",
  "bench/results/releases/0.5.4/capture-runs/paged.json",
  "bench/results/releases/0.5.4/capture-runs/regression-baseline.json",
  "bench/results/releases/0.5.4/capture-runs/render-scale.json",
  "bench/results/releases/0.5.4/capture-runs/xlsx.json",
]);

export type LocalPathKind = "home-directory path" | "host name" | "symlink outside the repository";

export interface LocalPathHit {
  path: string;
  line: number;
  text: string;
  kind: LocalPathKind;
}

/**
 * Report each line of a text file that names a home directory or the
 * benchmark machine's host. Gzip files are read decompressed: an archived log
 * or receipt is still committed text.
 */
export function findLocalPaths(path: string, contents: Uint8Array): LocalPathHit[] {
  if (contents[0] === GZIP_MAGIC[0] && contents[1] === GZIP_MAGIC[1]) {
    return findLocalPaths(path, gunzipSync(contents));
  }
  if (LOCKFILE.test(path) || contents.includes(BINARY_BYTE)) return [];
  const text = new TextDecoder().decode(contents);
  if (!HOME_PATH.test(text) && !HOST_NAME.test(text)) return [];
  return text.split("\n").flatMap((line, index): LocalPathHit[] => {
    const kind = HOME_PATH.test(line)
      ? "home-directory path"
      : HOST_NAME.test(line)
        ? "host name"
        : undefined;
    return kind === undefined ? [] : [{ path, line: index + 1, text: line.trim(), kind }];
  });
}

/**
 * Whether a tracked symlink at `path` points outside the repository, where
 * no other checkout has its target.
 */
export function symlinkLeavesRepository(path: string, target: string): boolean {
  if (posix.isAbsolute(target) || WINDOWS_ABSOLUTE.test(target)) return true;
  const resolved = posix.normalize(posix.join(posix.dirname(path), target));
  return resolved === ".." || resolved.startsWith("../");
}

/** Every local path, host name and outward symlink in the files git tracks under `root`. */
export function findRepositoryLeaks(root: string): LocalPathHit[] {
  // `--stage` exposes each entry's file mode and blob.
  const entries = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((entry) => entry.length > 0);
  return entries.flatMap((entry): LocalPathHit[] => {
    const path = entry.slice(entry.indexOf("\t") + 1);
    if (SYMLINK_MODE.test(entry)) {
      const blob = entry.split(" ")[1] ?? "";
      const target = execFileSync("git", ["cat-file", "blob", blob], {
        cwd: root,
        encoding: "utf8",
      });
      return symlinkLeavesRepository(path, target)
        ? [{ path, line: 0, text: target, kind: "symlink outside the repository" }]
        : [];
    }
    if (!REGULAR_FILE_MODE.test(entry)) return [];
    return findLocalPaths(path, readFileSync(`${root}/${path}`)).filter(
      (hit) => !(hit.kind === "host name" && HOST_NAME_CAPTURES.has(hit.path)),
    );
  });
}

if (import.meta.main) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const hits = findRepositoryLeaks(root);
  for (const hit of hits) console.error(`${hit.path}:${hit.line}: ${hit.kind}: ${hit.text}`);
  if (hits.length > 0) {
    console.error(
      "Use a repo-relative path, a <placeholder>, a commit SHA or the machine's hardware instead, and link inside the repository.",
    );
    process.exitCode = 1;
  }
}
