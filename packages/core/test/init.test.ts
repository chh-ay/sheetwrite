import { describe, expect, it } from "bun:test";

// Loader state is module-global and sibling suites initialize WASM in this
// shared process, so every pre-init / failure-path assertion runs in a FRESH
// bun process via init-probe.ts. Only post-init behavior is asserted inline.

async function runProbe(mode: "lifecycle" | "retry"): Promise<Record<string, unknown>> {
  const probe = new URL("./init-probe.ts", import.meta.url).pathname;
  const proc = Bun.spawn(["bun", probe, mode], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(exitCode, `probe ${mode} failed:\n${stderr}`).toBe(0);
  return JSON.parse(stdout.trim()) as Record<string, unknown>;
}

describe("initSheetwrite readiness and re-entrancy", () => {
  it("guards pre-init, shares concurrent init, and rejects a conflicting source", async () => {
    const result = await runProbe("lifecycle");

    expect(result.readyBefore).toBe(false);
    expect(result.preInitStore).toMatchObject({ status: "rejected", name: "Error" });
    expect(result.concurrentDifferentSource).toMatchObject({
      status: "rejected",
      code: "initialization-failed",
      operation: "initialize",
    });

    // Success flips readiness; overlapping same-source calls share the
    // in-flight init, and repeats after success stay fulfilled.
    expect(result.concurrentSameSource).toBe("fulfilled");
    expect(result.readyAfter).toBe(true);
    expect(result.repeatFulfilled).toBe(true);

    // A different source AFTER success warns and no-ops (fulfills).
    expect(result.postSuccessDifferentSource).toBe("fulfilled");
    expect(result.storeAfter).toBe(true);
  });

  it("clears the cache on a failed init so a corrected call retries", async () => {
    const result = await runProbe("retry");

    expect(result.firstFailure).toMatchObject({
      status: "rejected",
      code: "initialization-failed",
      operation: "initialize",
    });
    expect(result.readyAfterFailure).toBe(false);
    expect(result.readyAfterRetry).toBe(true);
  });
});
