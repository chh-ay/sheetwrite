import { readFile } from "node:fs/promises";

import { compareRelocations } from "./wasm-relocations.js";

/**
 * Shows whether a Rust change altered the generated code of a packaged engine.
 *
 *   bun scripts/wasm-compare.ts <before.wasm> <after.wasm>
 *   bun scripts/wasm-compare.ts --relocations [--module <new>=<old>]... <before.wasm> <after.wasm>
 *
 * Prints the size and hash of every section of both files. The change counts
 * as code-neutral (docs/contributing/rust.md) when the code section is
 * byte-identical and the data section has the same length; then the only
 * differing data bytes are the line and column numbers that panic locations
 * store, which move whenever source lines move. Exits 1 otherwise.
 *
 * `--relocations` is for a change that only moves Rust items into other
 * modules or files, which renumbers functions and moves data. It passes when
 * the builds run the same instructions (scripts/wasm-relocations.ts);
 * `--module calc::parser=calc` names a module that the move created.
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
function read_leb(bytes: Uint8Array, offset: number): [value: number, next: number] {
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
    const [size, start] = read_leb(bytes, at + 1);
    const body = bytes.subarray(start, start + size);
    let name = SECTION_NAMES[id] ?? `section ${id}`;
    if (id === 0) {
      const [name_length, name_start] = read_leb(body, 0);
      name = `custom "${new TextDecoder().decode(body.subarray(name_start, name_start + name_length))}"`;
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
  let in_run = false;
  for (let index = 0; index < before.length; index += 1) {
    const differs = before[index] !== after[index];
    if (differs) bytes += 1;
    if (differs && !in_run) runs += 1;
    in_run = differs;
  }
  return { bytes, runs };
}

const args = process.argv.slice(2);
const is_relocations = args.includes("--relocations");
const modules = args
  .filter((_, at) => args[at - 1] === "--module")
  .map((spec): [string, string] => {
    const [moved, original] = spec.split("=");
    if (moved === undefined || original === undefined)
      throw new Error(`--module ${spec}: expected <new>=<old>`);
    return [moved, original];
  });
const [before_path, after_path] = args.filter(
  (arg, at) => !arg.startsWith("--") && args[at - 1] !== "--module",
);
if (before_path === undefined || after_path === undefined) {
  throw new Error(
    "usage: bun scripts/wasm-compare.ts [--relocations [--module <new>=<old>]...] <before.wasm> <after.wasm>",
  );
}

const before_bytes = new Uint8Array(await readFile(before_path));
const after_bytes = new Uint8Array(await readFile(after_path));
const before = sections(before_bytes);
const after = sections(after_bytes);
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
const same_code = code[0] !== undefined && code[1] !== undefined && hash(code[0]) === hash(code[1]);
const same_data_length =
  data[0] !== undefined && data[1] !== undefined && data[0].length === data[1].length;

if (same_data_length && data[0] !== undefined && data[1] !== undefined) {
  const { bytes, runs } = differences(data[0], data[1]);
  process.stdout.write(`Data section: ${bytes} bytes differ, in ${runs} runs.\n`);
}
if (same_code && same_data_length) {
  process.stdout.write("Code-neutral: identical code section, data section of the same length.\n");
} else if (is_relocations) {
  const report = compareRelocations(before_bytes, after_bytes, modules);
  process.stdout.write(`${report.lines.join("\n")}\n`);
  if (!report.isSameCode) process.exitCode = 1;
} else {
  process.stdout.write("Not code-neutral: run the formula gate on both machines.\n");
  process.exitCode = 1;
}
