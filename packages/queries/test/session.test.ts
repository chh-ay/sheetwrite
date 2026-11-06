import { expect, it } from "bun:test";

it("refreshes saved queries through the queries add-on, in its own process", async () => {
  // Add-ons install once per page and the first install of a name wins, so the
  // session checks install this package's add-on in a process of their own.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/queries/test/session.own-process.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
