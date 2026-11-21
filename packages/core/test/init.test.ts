import { describe, expect, it } from "bun:test";

// Loader state is module-global and sibling suites initialize WASM in this
// shared process, so init-probe.ts runs each mode in a fresh bun process.
async function runProbe(mode: "lifecycle" | "retry"): Promise<void> {
  const probe = new URL("./init-probe.ts", import.meta.url).pathname;
  const proc = Bun.spawn(["bun", probe, mode], { stdout: "ignore", stderr: "pipe" });
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(exitCode, `probe ${mode} failed:\n${stderr}`).toBe(0);
}

describe("initSheetwrite readiness and re-entrancy", () => {
  it("guards pre-init, shares concurrent init, and rejects a conflicting source", async () => {
    await runProbe("lifecycle");
  });

  it("clears the cache on a failed init so a corrected call retries", async () => {
    await runProbe("retry");
  });
});
