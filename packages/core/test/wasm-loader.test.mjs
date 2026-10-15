import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { createLoader } from "../../wasm/loader-state.mjs";

describe("WASM loader lifecycle", () => {
  it("deduplicates one source, rejects a conflicting source, and retries after failure", async () => {
    const gate = Promise.withResolvers();
    const calls = [];
    let fail = true;
    const loader = createLoader(async (source) => {
      calls.push(source);
      if (source === "deferred") await gate.promise;
      if (source === "retry" && fail) {
        fail = false;
        throw new Error("transient compile failure");
      }
    });

    const first = loader.load("deferred");
    const duplicate = loader.load("deferred");
    await expect(loader.load("other")).rejects.toThrow("different source while initialization");
    expect(loader.isLoaded()).toBe(false);
    gate.resolve();
    await Promise.all([first, duplicate]);
    expect(loader.isLoaded()).toBe(true);
    expect(calls).toEqual(["deferred"]);

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      await loader.load("other");
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings).toEqual([
      "Sheetwrite: load() called with a different source after initialization; keeping the first module.",
    ]);

    const retrying = createLoader(async (source) => {
      calls.push(source);
      if (source === "retry" && fail) {
        fail = false;
        throw new Error("transient compile failure");
      }
    });

    fail = true;
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

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
      await failing.load("other");
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings).toHaveLength(1);
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

  it("initializes the Node loader from its packaged default binary", async () => {
    const loader = await import(`../../wasm/loader-node.mjs?coverage-default=${Date.now()}`);

    expect(loader.isLoaded()).toBe(false);
    await loader.load();
    expect(loader.isLoaded()).toBe(true);
  });

  it("initializes the Node loader from an explicit compiled module", async () => {
    const bytes = await readFile(
      new URL("../../wasm/pkg/sheetwrite_wasm_bg.wasm", import.meta.url),
    );
    const module = await WebAssembly.compile(bytes);
    const loader = await import(`../../wasm/loader-node.mjs?coverage-explicit=${Date.now()}`);

    expect(loader.isLoaded()).toBe(false);
    await loader.load(module);
    expect(loader.isLoaded()).toBe(true);
  });

  for (const name of ["wasm", "formulas"]) {
    it(`creates isolated ${name} instances from the first instance's compiled module`, async () => {
      const { createEngine } = await import(`../../${name}/loader-node.mjs`);
      const first = await createEngine();
      const module = first.getModule();
      expect(module).toBeInstanceOf(WebAssembly.Module);
      const second = await createEngine(module);
      expect(second.getModule()).toBe(module);
      expect(second.getMemory()).not.toBe(first.getMemory());
      const left = new first.CellStore();
      const right = new second.CellStore();

      try {
        left.addSheet(1, 10);
        right.addSheet(1, 10);
        left.setNumber(0, 0, 0, 42);
        right.setNumber(0, 0, 0, 7);
        const a = left.getCell(0, 0, 0);
        const b = right.getCell(0, 0, 0);

        try {
          expect(a.num).toBe(42);
          expect(b.num).toBe(7);
        } finally {
          a.free();
          b.free();
        }
      } finally {
        left.free();
        right.free();
      }
    });
  }
});
