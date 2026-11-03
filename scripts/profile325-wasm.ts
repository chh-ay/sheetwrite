import { readFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const path = process.argv[2];
if (!path) throw new Error("Pass a WASM path");
const bytes = readFileSync(path);
let offset = 8;
function unsigned(): number {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[offset++];
    if (byte === undefined) throw new Error("Truncated WASM integer");
    value += (byte & 127) * 2 ** shift;
    if (byte < 128) return value;
    shift += 7;
  }
}
function text(): string {
  const length = unsigned();
  const value = bytes.subarray(offset, offset + length).toString("utf8");
  offset += length;
  return value;
}
let imports = 0;
let codeHash = "";
const sizes = new Map<number, number>();
const names = new Map<number, string>();
while (offset < bytes.length) {
  const section = bytes[offset++];
  const length = unsigned();
  const end = offset + length;
  if (section === 2) {
    const count = unsigned();
    for (let index = 0; index < count; index++) {
      text(); text();
      const kind = bytes[offset++];
      if (kind === 0) { unsigned(); imports++; }
      else if (kind === 1) { offset++; const flags = unsigned(); unsigned(); if (flags & 1) unsigned(); }
      else if (kind === 2) { const flags = unsigned(); unsigned(); if (flags & 1) unsigned(); }
      else if (kind === 3) { offset += 2; }
      else if (kind === 4) { unsigned(); unsigned(); }
      else throw new Error(`Unexpected import kind ${kind}`);
    }
  } else if (section === 10) {
    codeHash = createHash("sha256").update(bytes.subarray(offset, end)).digest("hex");
    const count = unsigned();
    for (let index = 0; index < count; index++) {
      const size = unsigned();
      sizes.set(imports + index, size);
      offset += size;
    }
  } else if (section === 0 && text() === "name") {
    while (offset < end) {
      const subsection = bytes[offset++];
      const subsectionLength = unsigned();
      const subsectionEnd = offset + subsectionLength;
      if (subsection === 1) {
        const count = unsigned();
        for (let index = 0; index < count; index++) names.set(unsigned(), text());
      }
      offset = subsectionEnd;
    }
  }
  offset = end;
}
const evalAst = [...names].filter(([, name]) => name.includes("eval_ast")).map(([index, name]) => ({ index, name, bytes: sizes.get(index) }));
process.stdout.write(`${JSON.stringify({ raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length, codeHash, evalAst, functions: [...sizes].map(([index, size]) => ({ index, bytes: size, name: names.get(index) })) })}\n`);
