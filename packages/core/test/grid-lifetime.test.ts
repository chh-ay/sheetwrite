import { expect, it } from "bun:test";

// Objects held by other suites in the shared `bun test` process can keep a
// referent alive, so the collection runs in a fresh process (grid-lifetime-probe.ts).
it("frees a destroyed grid, its store and its owner-scoped caches", async () => {
  const probe = Bun.spawn(
    [
      process.execPath,
      "--preload",
      "./test-setup.ts",
      "./packages/core/test/grid-lifetime-probe.ts",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);

  expect(exitCode, `grid lifetime probe failed:\n${stderr}`).toBe(0);
  expect(JSON.parse(stdout.trim())).toEqual({ tracked: 40, retained: [] });
});
