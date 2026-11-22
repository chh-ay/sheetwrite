import { expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { resolve } from "node:path";

import { machineLabel } from "../src/machine-label.js";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");

it("names a machine by its platform and CPU model", () => {
  expect(machineLabel({}, "linux", "12th Gen Intel(R) Core(TM) i9-12900H")).toBe("linux-i9-12900h");
  expect(machineLabel({}, "darwin", "Apple M5 Pro")).toBe("mac-m5-pro");
  expect(machineLabel({}, "linux", "AMD Ryzen 9 7950X 16-Core Processor")).toBe(
    "linux-ryzen-9-7950x",
  );
  expect(machineLabel({}, "linux", "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz")).toBe(
    "linux-xeon-platinum-8370c",
  );
  expect(machineLabel({}, "win32", "")).toBe("windows-unknown-cpu");
});

it("takes SHEETWRITE_BENCH_MACHINE over the derived label", () => {
  expect(
    machineLabel({ SHEETWRITE_BENCH_MACHINE: " linux-i9-12900h " }, "darwin", "Apple M5 Pro"),
  ).toBe("linux-i9-12900h");
  expect(machineLabel({ SHEETWRITE_BENCH_MACHINE: "" }, "darwin", "Apple M5 Pro")).toBe(
    "mac-m5-pro",
  );
});

it("gives one machine the same label in every process, without its host or user name", () => {
  const label = () =>
    Bun.spawnSync(
      ["bun", "-e", 'console.log((await import("./src/machine-label.ts")).machineLabel())'],
      {
        cwd: resolve(import.meta.dir, ".."),
        env: { ...process.env, SHEETWRITE_BENCH_MACHINE: "" },
        stdout: "pipe",
      },
    )
      .stdout.toString()
      .trim();
  const first = label();
  expect(first).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)+$/u);
  expect(label()).toBe(first);
  expect(first).toBe(machineLabel({}));
  for (const name of [hostname(), userInfo().username]) {
    expect(first.toLowerCase()).not.toContain(name.toLowerCase());
  }
});

it("records no host name in any capture", () => {
  const sources = [
    ...readdirSync(resolve(REPOSITORY_ROOT, "bench/src")).map((file) => `bench/src/${file}`),
    ...readdirSync(resolve(REPOSITORY_ROOT, "scripts")).map((file) => `scripts/${file}`),
  ].filter((path) => path.endsWith(".ts"));
  const readers = sources.filter((path) =>
    /\bhostname\(\)/u.test(readFileSync(resolve(REPOSITORY_ROOT, path), "utf8")),
  );
  expect(readers).toEqual([]);
});
