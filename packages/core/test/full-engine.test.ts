import { expect, it } from "bun:test";

// Together the suites take a few seconds, more than the default 5 s on a loaded machine.
const FULL_ENGINE_SUITES_TIMEOUT_MS = 30_000;

// Initialization gives every grid of this suite's process a host function, which
// the other suites must not see, so it runs in a process of its own.
const OWN_PROCESS = new Set(["packages/core/test/custom-functions.full-engine.ts"]);

/** Runs `suites` with `bun test` in a new process and returns its failures. */
async function failuresOf(root: string, suites: readonly string[]) {
  const probe = Bun.spawn([process.execPath, "test", ...suites.map((suite) => `./${suite}`)], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  return { suites, exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] };
}

// The `*.full-engine.ts` files select the full engine (`@sheetwrite/formulas`).
// Engine selection is process-wide, so they run apart from the default-engine
// suites: together in one process, except the ones in `OWN_PROCESS`.
it(
  "passes every full-engine suite in processes of their own",
  async () => {
    const root = new URL("../../..", import.meta.url).pathname;
    const suites = [...new Bun.Glob("packages/core/test/*.full-engine.ts").scanSync({ cwd: root })];
    const shared = suites.filter((suite) => !OWN_PROCESS.has(suite));
    const groups = [
      shared,
      ...suites.filter((suite) => OWN_PROCESS.has(suite)).map((suite) => [suite]),
    ];
    expect(shared.length).toBeGreaterThan(0);

    const results = await Promise.all(groups.map((group) => failuresOf(root, group)));

    expect(results).toEqual(groups.map((group) => ({ suites: group, exitCode: 0, failures: [] })));
  },
  FULL_ENGINE_SUITES_TIMEOUT_MS,
);
