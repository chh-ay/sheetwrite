import { expect, it } from "bun:test";

const ROWS = 2_048;
// Shared range nodes keep this recompute within a few MiB; expanding every
// reader-to-member edge needs about 4 million entries and exceeds it.
const RECOMPUTE_GROWTH_LIMIT_BYTES = 16 * 1024 * 1024;

interface DependencyMemoryResult {
  readonly rows: number;
  readonly firstValue: number;
  readonly lastValue: number;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly growthBytes: number;
}

function parseResult(stdout: string): DependencyMemoryResult {
  const value: unknown = JSON.parse(stdout);
  if (typeof value !== "object" || value === null) {
    throw new Error(`Dependency memory probe printed a non-object: ${stdout}`);
  }
  const fields = ["rows", "firstValue", "lastValue", "beforeBytes", "afterBytes", "growthBytes"];
  for (const field of fields) {
    if (typeof Reflect.get(value, field) !== "number") {
      throw new Error(`Dependency memory probe omitted numeric ${field}: ${stdout}`);
    }
  }
  return value as DependencyMemoryResult;
}

it("bounds WASM memory when many formulas read one large range", async () => {
  // A fresh process keeps earlier tests from setting the memory high-water mark.
  const probe = new URL("./dependency-memory-probe.ts", import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, probe], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  expect(exitCode, `Dependency memory probe failed:\n${stderr}`).toBe(0);
  const result = parseResult(stdout);
  expect(result.rows).toBe(ROWS);
  expect(result.firstValue).toBe(ROWS);
  expect(result.lastValue).toBe(ROWS);
  expect(result.afterBytes - result.beforeBytes).toBe(result.growthBytes);
  expect(result.growthBytes).toBeLessThan(RECOMPUTE_GROWTH_LIMIT_BYTES);
});
