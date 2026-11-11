import { chromium } from "@playwright/test";

/**
 * Installs the locked Chromium build for the CI jobs that run it on the
 * runner itself (Browser Smoke runs in the Playwright image instead).
 *
 * GitHub's Ubuntu image already has every library Chromium loads.
 * `playwright install --with-deps` added only fonts, which these checks never
 * look at, and it made every job depend on the Ubuntu apt mirrors: when the
 * runners could not resolve azure.archive.ubuntu.com, every pull request
 * failed for hours. So the system packages are installed only when Chromium
 * cannot start without them.
 */
async function run(command: readonly [string, ...string[]]): Promise<void> {
  const child = Bun.spawn([...command], { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

/** Why Chromium cannot start, or undefined when it starts. */
async function chromiumStartFailure(): Promise<string | undefined> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

await run(["bun", "x", "playwright", "install", "chromium"]);
const failure = await chromiumStartFailure();
if (failure !== undefined) {
  console.log(`Chromium cannot start on this machine; installing its system packages.\n${failure}`);
  await run(["bun", "x", "playwright", "install-deps", "chromium"]);
  const retryFailure = await chromiumStartFailure();
  if (retryFailure !== undefined) throw new Error(`Chromium still cannot start:\n${retryFailure}`);
}
