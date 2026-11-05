import { expect, it } from "bun:test";

it("keeps relationships and model pivots through refreshes on the full engine, in its own process", async () => {
  // Engine selection is process-wide, so the full-engine checks run apart.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/queries/test/data-model.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
