import { chromium } from "@playwright/test";

/**
 * Installs the locked Chromium build for the CI jobs that run it on the
 * runner itself (Browser Smoke runs in the Playwright image instead).
 *
 * GitHub's Ubuntu image already has every library Chromium loads.
 * `playwright install --with-deps` adds only fonts, which these checks never
 * look at, and it makes every job depend on the Ubuntu apt mirrors, so an
 * apt mirror outage fails every pull request. So the system packages are
 * installed only when Chromium cannot start without them.
 */
async function run(command: readonly [string, ...string[]]): Promise<void> {
  const child = Bun.spawn([...command], { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  const exit_code = await child.exited;
  if (exit_code !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exit_code}`);
}

/** Why Chromium cannot start, or undefined when it starts. */
async function chromium_start_failure(): Promise<string | undefined> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

await run(["bun", "x", "playwright", "install", "chromium"]);
const failure = await chromium_start_failure();
if (failure !== undefined) {
  console.log(`Chromium cannot start on this machine; installing its system packages.\n${failure}`);
  await run(["bun", "x", "playwright", "install-deps", "chromium"]);
  const retry_failure = await chromium_start_failure();
  if (retry_failure !== undefined)
    throw new Error(`Chromium still cannot start:\n${retry_failure}`);
}
