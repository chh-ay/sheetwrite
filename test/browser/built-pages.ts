import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The built site, where scripts/serve-docs.ts serves it from (DOCS_OUTPUT_DIR may be absolute). */
const SITE = resolve(ROOT, process.env.DOCS_OUTPUT_DIR ?? "docs/dist/client");

/** The address of every built page whose HTML matches `pattern`. */
export function builtPagesMatching(pattern: RegExp, directory = SITE): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return builtPagesMatching(pattern, path);
    if (entry.name !== "index.html" || !pattern.test(readFileSync(path, "utf8"))) return [];
    return [`/${relative(SITE, directory)}/`.replace(/^\/\/$/, "/")];
  });
}
