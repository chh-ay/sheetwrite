import { expect, it } from "bun:test";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import {
  findLocalPaths,
  findRepositoryLeaks,
  symlinkLeavesRepository,
} from "./check-local-paths.js";

const encode = (text: string) => new TextEncoder().encode(text);
// Joined at runtime so this tracked file does not trip the guard it tests.
const home_path = (separator: string, ...parts: string[]) => parts.join(separator);
const LINUX_HOME = home_path("/", "", "home", "someone", "sheetwrite");
const MAC_HOME = home_path("/", "", "Users", "someone", "sheetwrite");
const WINDOWS_HOME = home_path("\\", "C:", "Users", "someone", "sheetwrite");
const TILDE_CHECKOUT = home_path("/", "~", "learn", "sheetwrite");
const HOST = ["zeph", "yrus"].join("");
const MAC_HOST = ["Chh", "ayy"].join("");

it("reports Linux, macOS, Windows and tilde home-directory paths with their line", () => {
  const contents = encode(
    [
      "portable: bench/src/formula-gate.ts --base <built-base-checkout>",
      `"root": "${LINUX_HOME}"`,
      `cd ${MAC_HOME}`,
      WINDOWS_HOME,
      `cd ${TILDE_CHECKOUT}`,
    ].join("\n"),
  );

  expect(findLocalPaths("bench/results/example.json", contents).map((hit) => hit.line)).toEqual([
    2, 3, 4, 5,
  ]);
});

it("reports the benchmark machines' host names in any letter case", () => {
  const contents = encode(
    [
      `"host": "${HOST}"`,
      "Linux benchmark machine (i9-12900H)",
      `ssh hypr-${HOST.toUpperCase()}`,
      `"machine": "${MAC_HOST}.local"`,
      `"machine": "${MAC_HOST.toLowerCase()}-2.LOCAL"`,
      "local machine",
    ].join("\n"),
  );

  expect(
    findLocalPaths("bench/results/example.json", contents).map(({ line, kind }) => ({
      line,
      kind,
    })),
  ).toEqual([
    { line: 1, kind: "host name" },
    { line: 3, kind: "host name" },
    { line: 4, kind: "host name" },
    { line: 5, kind: "host name" },
  ]);
});

it("skips lockfiles and binary files", () => {
  const leaked = encode(LINUX_HOME);
  expect(findLocalPaths("bun.lock", leaked)).toEqual([]);
  expect(findLocalPaths("assets/image.png", new Uint8Array([...leaked, 0]))).toEqual([]);
});

it("reads gzip archives as the text they contain", () => {
  const archived = gzipSync(encode(`portable\n"root": "${LINUX_HOME}"\n`));
  expect(findLocalPaths("bench/results/receipt.json.gz", archived)).toEqual([
    {
      path: "bench/results/receipt.json.gz",
      line: 2,
      text: `"root": "${LINUX_HOME}"`,
      kind: "home-directory path",
    },
  ]);
});

it("reports symlinks whose target is outside the repository", () => {
  const link = "test/bundler-fixtures/first-paint/next/node_modules";
  expect(symlinkLeavesRepository(link, "../../next/node_modules")).toBe(false);
  expect(symlinkLeavesRepository(link, "app")).toBe(false);
  expect(symlinkLeavesRepository(link, `${MAC_HOME}/node_modules`)).toBe(true);
  expect(symlinkLeavesRepository(link, "../../../../../node_modules")).toBe(true);
  expect(symlinkLeavesRepository(link, `${WINDOWS_HOME}\\node_modules`)).toBe(true);
});

it("finds no local path, host name or outward symlink in the tracked files", () => {
  expect(findRepositoryLeaks(resolve(import.meta.dir, ".."))).toEqual([]);
});
