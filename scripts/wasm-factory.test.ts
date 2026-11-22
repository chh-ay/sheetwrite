import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateWasmFactory } from "./wasm-factory.js";

/** One empty function named `f`: type, function, code and name sections. */
const NAMED_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02,
  0x01, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b, 0x00, 0x0b, 0x04, 0x6e, 0x61, 0x6d, 0x65, 0x01,
  0x04, 0x01, 0x00, 0x01, 0x66,
]);

const GLUE = `/* @ts-self-types="./sheetwrite_wasm.d.ts" */

/**
 * Rust documentation that wasm-bindgen copies into the glue.
 */
export class CellStore {
    /**
     * The kind of the value.
     * @returns {number}
     */
    get kind() {
        return 1;
    }
}
let cachedUint8ArrayMemory0 = null;
export function initSync() {
    return "/** kept: a string, not a comment */";
}
`;

async function generated_factory(glue: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-wasm-factory-"));
  try {
    await mkdir(join(root, "pkg"));
    await writeFile(join(root, "pkg/sheetwrite_wasm_bg.wasm"), NAMED_WASM);
    await writeFile(join(root, "pkg/sheetwrite_wasm.js"), glue);
    await generateWasmFactory(root);
    return await readFile(join(root, "pkg/sheetwrite_wasm_factory.js"), "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("generateWasmFactory", () => {
  it("leaves the Rust documentation out of the shipped glue and keeps the code", async () => {
    const factory = await generated_factory(GLUE);

    expect(factory).not.toContain("Rust documentation");
    expect(factory).not.toContain("@returns");
    expect(factory).toContain("    get kind() {\n        return 1;\n    }");
    expect(factory).toContain('"/** kept: a string, not a comment */"');
  });
});
