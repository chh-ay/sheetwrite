/**
 * QA script: rechecks the external links that the first pass did not get a
 * 200 for, one at a time with a browser user agent, so rate limits (429) and
 * bot blocks (403) do not hide the real status.
 *
 *   bun recheck-external.ts <links-directory>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ExternalLink {
  readonly url: string;
  readonly status: string;
  readonly pages: readonly string[];
}

const [directory = ""] = process.argv.slice(2);
if (directory === "") throw new Error("Usage: bun recheck-external.ts <links-directory>");
const PAUSE_MS = 400;
const RATE_LIMIT_PAUSE_MS = 60_000;
const TIMEOUT_MS = 20_000;
const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US",
};

const links = JSON.parse(readFileSync(join(directory, "external.json"), "utf8")) as ExternalLink[];
const pending = links.filter((link) => !link.status.startsWith("200"));
const results: ExternalLink[] = [];
for (const link of pending) {
  let status = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(link.url, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      await response.body?.cancel();
      status = `${response.status}${response.redirected ? ` (redirected to ${response.url})` : ""}`;
      if (response.status !== 429) break;
      await Bun.sleep(RATE_LIMIT_PAUSE_MS);
    } catch (error) {
      status = `request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  results.push({ ...link, status });
  await Bun.sleep(PAUSE_MS);
}
writeFileSync(join(directory, "external-recheck.json"), JSON.stringify(results, null, 2));
const failures = results.filter((result) => !result.status.startsWith("200"));
process.stdout.write(`rechecked: ${results.length}, still not 200: ${failures.length}\n`);
for (const failure of failures) {
  process.stdout.write(`${failure.status}  ${failure.url}  (${failure.pages.slice(0, 3).join(", ")})\n`);
}
