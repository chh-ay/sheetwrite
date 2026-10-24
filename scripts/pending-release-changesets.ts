import { appendFile, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Package names that pending changesets will release. A develop commit with
 * such changesets changed package files after the last version commit, so its
 * tarballs differ from the versions already on npm: publication waits for the
 * version commit instead of failing on the registry integrity check.
 * Empty changesets (docs, CI) name no package and do not block publication.
 */
export async function pendingReleasePackages(changesetDirectory: string): Promise<string[]> {
  const names = new Set<string>();
  for (const file of await readdir(changesetDirectory)) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const source = await readFile(join(changesetDirectory, file), "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n?---/.exec(source)?.[1] ?? "";
    for (const match of frontmatter.matchAll(/^\s*["']?(@sheetwrite\/[\w-]+)["']?\s*:/gm)) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}

if (import.meta.main) {
  const pending = await pendingReleasePackages(resolve(import.meta.dir, "../.changeset"));
  if (pending.length > 0) {
    console.log(`Publication waits for the version commit: ${pending.join(", ")}`);
  }
  const output = process.env.GITHUB_OUTPUT;
  if (output !== undefined) await appendFile(output, `pending=${pending.length > 0}\n`);
}
