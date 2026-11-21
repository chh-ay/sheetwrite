/**
 * QA script: checks the docs' links into the chh-ay/sheetwrite repository with
 * the authenticated GitHub API instead of page fetches, which GitHub rate
 * limits (429). A blob or edit link must name a file on its branch; a new-issue
 * link must name an issue template that exists. Other links get a paced
 * browser-like fetch. Writes one line per URL as it goes.
 *
 *   bun check-github-links.ts <links-directory>
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ExternalLink {
  readonly url: string;
  readonly status: string;
  readonly pages: readonly string[];
}

const [directory = ""] = process.argv.slice(2);
if (directory === "") throw new Error("Usage: bun check-github-links.ts <links-directory>");
const REPOSITORY = "chh-ay/sheetwrite";
const PAUSE_MS = 1_500;
const TIMEOUT_MS = 20_000;
const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US",
};
const output = join(directory, "external-recheck.tsv");
writeFileSync(output, "status\turl\tpages\n");

const fileExists = new Map<string, boolean>();
/** Whether `path` exists on `ref`, through `gh api` (cached). */
async function repositoryFileExists(ref: string, path: string): Promise<boolean> {
  const key = `${ref}:${path}`;
  const known = fileExists.get(key);
  if (known !== undefined) return known;
  const process = Bun.spawnSync(["gh", "api", `repos/${REPOSITORY}/contents/${path}?ref=${ref}`, "--silent"]);
  const found = process.exitCode === 0;
  fileExists.set(key, found);
  return found;
}

async function status(url: URL): Promise<string> {
  const repositoryPath = new RegExp(`^/${REPOSITORY}/(blob|edit)/([^/]+)/(.+)$`).exec(url.pathname);
  if (url.hostname === "github.com" && repositoryPath !== null) {
    const [, , ref = "", path = ""] = repositoryPath;
    return (await repositoryFileExists(ref, decodeURIComponent(path))) ? "200 (file exists)" : "404 (no such file)";
  }
  if (url.hostname === "github.com" && url.pathname === `/${REPOSITORY}/issues/new`) {
    const template = url.searchParams.get("template");
    if (template === null) return "200 (blank issue form)";
    return (await repositoryFileExists("develop", `.github/ISSUE_TEMPLATE/${template}`))
      ? "200 (template exists)"
      : "404 (no such template)";
  }
  await Bun.sleep(PAUSE_MS);
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await response.body?.cancel();
    return `${response.status}${response.redirected ? ` (redirected to ${response.url})` : ""}`;
  } catch (error) {
    return `request failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const links = JSON.parse(readFileSync(join(directory, "external.json"), "utf8")) as ExternalLink[];
let failures = 0;
for (const link of links.filter((item) => !item.status.startsWith("200"))) {
  const result = await status(new URL(link.url));
  if (!result.startsWith("200")) failures += 1;
  appendFileSync(output, `${result}\t${link.url}\t${link.pages.slice(0, 3).join(" ")}\n`);
}
process.stdout.write(`done; not 200: ${failures}\n`);
