import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Public exceptions must name a real consumer or a deliberate resource lifetime. */
const PUBLIC_EXPORT_REASONS: Readonly<Record<string, string>> = {
  "CellStore.queryResourceStats": "bench/src/data-bench.ts measures query-owned text and contains-cache construction.",
  "CellStore.resetQueryResourceStats": "bench/src/data-bench.ts starts each query resource sample from zero.",
};
const REPEATABLE_BUFFER_REASONS: Readonly<Record<string, string>> = {
  RangeSnapshot: "Undo/redo retains this opaque resource and reads its source/value projections more than once before disposal.",
};
const IGNORED_DIRECTORIES: Readonly<Record<string, true>> = {
  node_modules: true,
  target: true,
  dist: true,
  pkg: true,
  ".git": true,
  generated: true,
};
const CALLER_EXTENSIONS: Readonly<Record<string, true>> = {
  ".ts": true,
  ".tsx": true,
  ".js": true,
  ".mjs": true,
  ".svelte": true,
  ".vue": true,
  ".md": true,
  ".mdx": true,
};
/** One callable Rust export, including methods implicitly exported by a bindgen impl. */
export interface EngineBinding {
  readonly owner: string;
  readonly rustName: string;
  readonly jsName: string | undefined;
  readonly location: string;
  readonly constructor: boolean;
  readonly copyingBuffer: boolean;
}

/** Mask comments and literals while keeping source offsets stable for diagnostics. */
function maskRust(source: string): string {
  return source.replace(
    /r(#{0,16})"[\s\S]*?"\1|"(?:\\[\s\S]|[^"\\])*"|'(?:\\.|[^'\\])'|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu,
    (token) => token.replace(/[^\n]/gu, " "),
  );
}

function braceEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return index;
  }

  throw new Error("Unbalanced Rust binding block");
}

/** Discover explicit free exports and public methods in exported impl blocks. */
export function engineBindings(source: string, path: string): EngineBinding[] {
  const masked = maskRust(source);
  const owners: Array<{ name: string; start: number; end: number }> = [];
  const implPattern = /#\[(?:wasm_bindgen::prelude::)?wasm_bindgen(?:\([^\]]*\))?\]\s*impl\s+(\w+)\s*\{/gu;
  for (const match of masked.matchAll(implPattern)) {
    const name = match[1];
    if (!name) continue;
    const start = match.index + match[0].lastIndexOf("{");
    owners.push({ name, start, end: braceEnd(masked, start) });
  }

  const bindings: EngineBinding[] = [];
  const methodPattern = /((?:\s*#\[[^\]]*\]\s*)*)pub\s+fn\s+(\w+)\s*\(/gu;
  for (const match of masked.matchAll(methodPattern)) {
    const rustName = match[2];
    if (!rustName) continue;
    const attributes = source.slice(match.index, match.index + (match[1]?.length ?? 0));
    if (/#\[cfg\(test\)\]/u.test(attributes)) continue;
    const owner = owners.find((candidate) => candidate.start < match.index && candidate.end > match.index);
    if (!owner && !/#\[(?:wasm_bindgen::prelude::)?wasm_bindgen/u.test(attributes)) continue;
    const bodyStart = masked.indexOf("{", match.index + match[0].length);
    if (bodyStart < 0) throw new Error(`${path}: export ${rustName} has no body`);
    const bodyEnd = braceEnd(masked, bodyStart);
    const signature = masked.slice(match.index + match[0].length, bodyStart);
    const body = masked.slice(bodyStart, bodyEnd);
    const jsName = /js_name\s*=\s*"?([A-Za-z_][A-Za-z0-9_]*)/u.exec(attributes)?.[1];
    bindings.push({
      owner: owner?.name ?? "module",
      rustName,
      jsName,
      location: `${path}:${source.slice(0, match.index).split("\n").length}`,
      constructor: /\bconstructor\b/u.test(attributes),
      copyingBuffer: /->\s*Vec\s*</u.test(signature) && (/\bgetter\b/u.test(attributes) || /\.clone\s*\(/u.test(body)),
    });
  }

  return bindings;
}

/** Enforce the current camelCase naming and result-buffer ownership contracts. */
export function bindingIssues(bindings: readonly EngineBinding[], callers: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  for (const binding of bindings) {
    if (binding.constructor) continue;
    const symbol = `${binding.owner}.${binding.jsName ?? binding.rustName}`;
    if (!binding.jsName || !/^[a-z][A-Za-z0-9]*$/u.test(binding.jsName)) {
      issues.push(`${binding.location}: ${symbol} needs an explicit camelCase js_name (until #359/#360)`);
    }
    if (binding.jsName && !callers.has(binding.jsName) && !PUBLIC_EXPORT_REASONS[symbol]) {
      issues.push(`${binding.location}: ${symbol} has no packages/docs/tests caller or reasoned allowlist entry`);
    }
    if (binding.copyingBuffer && binding.owner !== "CellStore" && !REPEATABLE_BUFFER_REASONS[binding.owner]) {
      issues.push(`${binding.location}: ${symbol} copies a result buffer; use a take-once method`);
    }
  }

  return issues;
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRECTORIES[entry.name]) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
}

/** Check every Rust crate below packages; generated declarations/docs are not callers. */
export function checkEngineBindings(root: string): string[] {
  const packageFiles = filesUnder(join(root, "packages"));
  const bindings = packageFiles.filter((path) => extname(path) === ".rs").flatMap((path) =>
    engineBindings(readFileSync(path, "utf8"), relative(root, path)),
  );
  const callers = new Set<string>();
  const callerFiles = [...packageFiles, ...filesUnder(join(root, "docs")), ...filesUnder(join(root, "test"))];
  for (const path of callerFiles) {
    const local = relative(root, path).replaceAll("\\", "/");
    if (!CALLER_EXTENSIONS[extname(path)] || path.endsWith(".d.ts") || local.startsWith("docs/src/content/docs/api/")) continue;
    const source = readFileSync(path, "utf8");
    const pattern = extname(path) === ".md" || extname(path) === ".mdx"
      ? /\b([A-Za-z][A-Za-z0-9]*)\b/gu
      : /(?:\?\.|\.)\s*([A-Za-z][A-Za-z0-9]*)\b|\b([A-Za-z][A-Za-z0-9]*)\s*\(/gu;
    for (const match of source.matchAll(pattern)) {
      const name = match[1] ?? match[2];
      if (name) callers.add(name);
    }
  }

  if (bindings.length === 0) return ["No engine bindings found; check Rust source discovery"];
  return bindingIssues(bindings, callers);
}

if (import.meta.main) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const issues = checkEngineBindings(root);
  if (issues.length > 0) {
    process.stderr.write(`${issues.join("\n")}\n`);
    process.exitCode = 1;
  }
}
