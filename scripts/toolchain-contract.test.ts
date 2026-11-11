import { expect, it } from "bun:test";
import { brotliDecompressSync } from "node:zlib";

it("rejects the invalid Brotli block switch from CVE-2026-111497", () => {
  // Public Node/Bun regression input; the vulnerable decoder reports -9.
  const invalid = Buffer.from("200010414141fcffff07002228f00b60f7f41f000000", "hex");
  expect(() => brotliDecompressSync(invalid)).toThrow(
    expect.objectContaining({ code: "ERR__ERROR_FORMAT_BLOCK_SWITCH", errno: -17 }),
  );
});
