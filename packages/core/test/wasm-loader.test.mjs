import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { createLoader } from "../../wasm/loader-state.mjs";

describe("WASM loader lifecycle", () => {
  it("deduplicates one source, rejects a conflicting source, and retries after failure", async () => {
    const gate = Promise.withResolvers();
    const calls = [];
    const loader = createLoader(async (source) => {
      calls.push(source);
      await gate.promise;
    });

    const first = loader.load("deferred");
    const duplicate = loader.load("deferred");
    await expect(loader.load("other")).rejects.toThrow("different source while initialization");
    expect(loader.isLoaded()).toBe(false);
    gate.resolve();
    await Promise.all([first, duplicate]);
    expect(loader.isLoaded()).toBe(true);
    expect(calls).toEqual(["deferred"]);

    await loader.load("other");
    expect(calls).toEqual(["deferred"]);

    let fail = true;
    const retrying = createLoader(async () => {
      if (fail) {
        fail = false;
        throw new Error("transient compile failure");
      }
    });

    await expect(retrying.load("retry")).rejects.toThrow("transient compile failure");
    expect(retrying.isLoaded()).toBe(false);
    await retrying.load("retry");
    expect(retrying.isLoaded()).toBe(true);
  });

  it("lets an in-flight load() own the published source before an engine adopts it", async () => {
    const gate = Promise.withResolvers();
    const calls = [];
    const published = [];
    const loader = createLoader(async (source) => {
      calls.push(source);
      await gate.promise;
    });

    const loading = loader.load("loaded");
    const adopting = loader.adopt("engine", () => published.push("engine"));
    gate.resolve();
    await Promise.all([loading, adopting]);
    expect(loader.isLoaded()).toBe(true);
    expect(published).toEqual([]);
    expect(calls).toEqual(["loaded"]);

    const failing = createLoader(async () => {
      throw new Error("compile failure");
    });
    const failed = failing.load("broken");
    const adopted = failing.adopt("engine", () => published.push("engine"));
    await expect(failed).rejects.toThrow("compile failure");
    await adopted;
    expect(failing.isLoaded()).toBe(true);
    expect(published).toEqual(["engine"]);

    await failing.load("other");
  });

  for (const name of ["wasm", "formulas"]) {
    it(`keeps ${name} published exports on the first adopted module`, async () => {
      const probe = Bun.spawn(
        [process.execPath, new URL("./published-module-probe.mjs", import.meta.url).pathname, name],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(probe.stdout).text(),
        new Response(probe.stderr).text(),
        probe.exited,
      ]);
      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(stdout).toContain(`${name}: published exports keep the first adopted module`);
    });
  }

  // The generated module initializes once per process, so in a full run only the first case
  // reaches init(): the explicit module, which nothing else loads. Coverage runs the packaged
  // default case alone by its name ("packaged default binary").
  for (const source of ["an explicit compiled module", "its packaged default binary"]) {
    it(`initializes the Node loader from ${source}`, async () => {
      const module =
        source === "an explicit compiled module"
          ? await WebAssembly.compile(
              await readFile(new URL("../../wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url)),
            )
          : undefined;
      const loader = await import(
        `../../wasm/loader-node.mjs?${encodeURIComponent(source)}=${Date.now()}`
      );

      expect(loader.isLoaded()).toBe(false);
      await loader.load(module);
      expect(loader.isLoaded()).toBe(true);
    });
  }
});
