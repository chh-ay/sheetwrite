import { readFile } from "node:fs/promises";

/**
 * Shows whether a Rust change altered the generated code of a packaged engine.
 *
 *   bun scripts/wasm-compare.ts <before.wasm> <after.wasm>
 *
 * Prints the size and hash of every section of both files. The change counts
 * as code-neutral (docs/contributing/rust.md) when the code section is
 * byte-identical and the data section has the same length; then the only
 * differing data bytes are the line and column numbers that panic locations
 * store, which move whenever source lines move. Exits 1 otherwise.
 */
interface Section {
  name: string;
  body: Uint8Array;
}

const SECTION_NAMES = [
  "custom",
  "type",
  "import",
  "function",
  "table",
  "memory",
  "global",
  "export",
  "start",
  "element",
  "code",
  "data",
  "datacount",
];

/** An unsigned LEB128 number at `offset`, and the offset after it. */
function readLeb(bytes: Uint8Array, offset: number): [value: number, next: number] {
  let value = 0;
  let shift = 0;
  let at = offset;
  for (;;) {
    const byte = bytes[at];
    if (byte === undefined) throw new Error(`truncated number at byte ${offset}`);
    at += 1;
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if ((byte & 0x80) === 0) return [value, at];
  }
}

function sections(bytes: Uint8Array): Section[] {
  const found: Section[] = [];
  let at = 8;
  while (at < bytes.length) {
    const id = bytes[at] ?? 0;
    const [size, start] = readLeb(bytes, at + 1);
    const body = bytes.subarray(start, start + size);
    let name = SECTION_NAMES[id] ?? `section ${id}`;
    if (id === 0) {
      const [nameLength, nameStart] = readLeb(body, 0);
      name = `custom "${new TextDecoder().decode(body.subarray(nameStart, nameStart + nameLength))}"`;
    }
    found.push({ name, body });
    at = start + size;
  }
  return found;
}

function hash(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Differing bytes and the number of separate runs they form. */
function differences(before: Uint8Array, after: Uint8Array): { bytes: number; runs: number } {
  let bytes = 0;
  let runs = 0;
  let inRun = false;
  for (let index = 0; index < before.length; index += 1) {
    const differs = before[index] !== after[index];
    if (differs) bytes += 1;
    if (differs && !inRun) runs += 1;
    inRun = differs;
  }
  return { bytes, runs };
}

const [beforePath, afterPath] = process.argv.slice(2);
if (beforePath === undefined || afterPath === undefined) {
  throw new Error("usage: bun scripts/wasm-compare.ts <before.wasm> <after.wasm>");
}

const before = sections(new Uint8Array(await readFile(beforePath)));
const after = sections(new Uint8Array(await readFile(afterPath)));
const rows = ["| Section | Before | After |", "|---|---|---|"];
const names = [...new Set([...before, ...after].map(({ name }) => name))];
for (const name of names) {
  const left = before.find((section) => section.name === name);
  const right = after.find((section) => section.name === name);
  const describe = (section: Section | undefined): string =>
    section === undefined ? "absent" : `${section.body.length} B \`${hash(section.body)}\``;
  rows.push(`| ${name} | ${describe(left)} | ${describe(right)} |`);
}
process.stdout.write(`${rows.join("\n")}\n`);

const code = [before, after].map((list) => list.find(({ name }) => name === "code")?.body);
const data = [before, after].map((list) => list.find(({ name }) => name === "data")?.body);
const sameCode = code[0] !== undefined && code[1] !== undefined && hash(code[0]) === hash(code[1]);
const sameDataLength =
  data[0] !== undefined && data[1] !== undefined && data[0].length === data[1].length;

if (sameDataLength && data[0] !== undefined && data[1] !== undefined) {
  const { bytes, runs } = differences(data[0], data[1]);
  process.stdout.write(`Data section: ${bytes} bytes differ, in ${runs} runs.\n`);
}
if (sameCode && sameDataLength) {
  process.stdout.write("Code-neutral: identical code section, data section of the same length.\n");
} else {
  process.stdout.write("Not code-neutral: run the formula gate on both machines.\n");
  process.exitCode = 1;
}
