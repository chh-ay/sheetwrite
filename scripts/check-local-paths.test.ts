import { expect, it } from "bun:test";

import { findLocalPaths } from "./check-local-paths.js";

const encode = (text: string) => new TextEncoder().encode(text);
// Joined at runtime so this tracked file does not trip the guard it tests.
const homePath = (separator: string, ...parts: string[]) => parts.join(separator);
const LINUX_HOME = homePath("/", "", "home", "someone", "sheetwrite");
const MAC_HOME = homePath("/", "", "Users", "someone", "sheetwrite");
const WINDOWS_HOME = homePath("\\", "C:", "Users", "someone", "sheetwrite");

it("reports Linux, macOS and Windows home-directory paths with their line", () => {
  const contents = encode(
    [
      "portable: bench/src/formula-gate.ts --base <built-base-checkout>",
      `"root": "${LINUX_HOME}"`,
      `cd ${MAC_HOME}`,
      WINDOWS_HOME,
    ].join("\n"),
  );

  expect(findLocalPaths("bench/results/example.json", contents).map((hit) => hit.line)).toEqual([
    2, 3, 4,
  ]);
});

it("skips lockfiles and binary files", () => {
  const leaked = encode(LINUX_HOME);
  expect(findLocalPaths("bun.lock", leaked)).toEqual([]);
  expect(findLocalPaths("assets/image.png", new Uint8Array([...leaked, 0]))).toEqual([]);
});
