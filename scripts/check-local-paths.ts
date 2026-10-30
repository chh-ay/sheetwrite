import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** A home directory names one developer's machine; committed files must stay portable. */
const HOME_PATH = /\/home\/[^/\s"'`]+\/|\/Users\/[^/\s"'`]+\/|[A-Za-z]:\\{1,2}Users\\{1,2}/u;
const LOCKFILE =
  /(?:^|\/)(?:bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)$/u;
const BINARY_BYTE = 0;
const GZIP_MAGIC = [0x1f, 0x8b] as const;

/** Regular files only: symlinks and submodule gitlinks resolve to directories. */
const REGULAR_FILE_MODE = /^100(?:644|755) /u;

export interface LocalPathHit {
  path: string;
  line: number;
  text: string;
}

/**
 * Report each line of a text file that names a home directory. Gzip files are
 * read decompressed: an archived log or receipt is still committed text.
 */
export function findLocalPaths(path: string, contents: Uint8Array): LocalPathHit[] {
  if (contents[0] === GZIP_MAGIC[0] && contents[1] === GZIP_MAGIC[1]) {
    return findLocalPaths(path, gunzipSync(contents));
  }
  if (LOCKFILE.test(path) || contents.includes(BINARY_BYTE)) return [];
  const text = new TextDecoder().decode(contents);
  if (!HOME_PATH.test(text)) return [];
  return text
    .split("\n")
    .flatMap((line, index) =>
      HOME_PATH.test(line) ? [{ path, line: index + 1, text: line.trim() }] : [],
    );
}

if (import.meta.main) {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  // `--stage` exposes each entry's file mode.
  const tracked = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((entry) => REGULAR_FILE_MODE.test(entry))
    .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  const hits = tracked.flatMap((path) => findLocalPaths(path, readFileSync(`${root}/${path}`)));
  for (const hit of hits)
    console.error(`${hit.path}:${hit.line}: home-directory path: ${hit.text}`);
  if (hits.length > 0) {
    console.error("Use a repo-relative path, a <placeholder>, or a commit SHA instead.");
    process.exitCode = 1;
  }
}
