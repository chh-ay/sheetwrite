/**
 * QA script: typechecks every ts, tsx, vue and svelte fence in the docs content
 * against the built packages. Partial fences get the prelude they name (or the
 * core prelude), with names the fence declares itself removed from the prelude.
 * Writes one result per fence to results.json.
 *
 *   bun typecheck-fences.ts <repository-root> <output-directory>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { resolveHoverPrelude } from "../checkouts/dcq-content/docs/src/lib/hover-preludes.ts";

interface DocsFence {
  readonly page: string;
  readonly line: number;
  readonly language: string;
  readonly meta: string;
  readonly code: string;
}

interface FenceResult extends DocsFence {
  readonly file: string;
  readonly kind: "compile" | "partial";
  readonly diagnostics: string[];
}

const [repositoryRoot = "", outputDirectory = ""] = process.argv.slice(2);
if (repositoryRoot === "" || outputDirectory === "") {
  throw new Error("Usage: bun typecheck-fences.ts <repository-root> <output-directory>");
}
const contentRoot = join(repositoryRoot, "docs/src/content/docs");
const TYPED_LANGUAGES = new Set(["ts", "tsx", "vue", "svelte"]);
const FENCE_OPENER = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

function pageFences(path: string): DocsFence[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const fences: DocsFence[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opener = FENCE_OPENER.exec(lines[index] ?? "");
    if (opener === null) continue;
    const [, indent = "", marker = "", info = ""] = opener;
    const start = index;
    const body: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(line)) {
        break;
      }
      body.push(line.replace(new RegExp(`^ {0,${indent.length}}`), ""));
    }
    const trimmed = info.trim();
    const language = /^\S*/.exec(trimmed)?.[0] ?? "";
    fences.push({
      page: relative(contentRoot, path),
      line: start + 1,
      language,
      meta: trimmed.slice(language.length).trim(),
      code: body.join("\n"),
    });
  }
  return fences;
}

function metaValue(meta: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]+)"`).exec(meta)?.[1];
}

/** Names the fence binds at its top level, so the prelude does not declare them twice. */
function boundNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const match of code.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const local = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (local) names.add(local);
    }
  }
  for (const match of code.matchAll(
    /^\s*(?:export\s+)?(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

function preludeWithout(prelude: string, taken: ReadonlySet<string>): string {
  return prelude
    .split("\n")
    .map((line) => {
      const imports = /^(import (?:type )?\{)([^}]+)(\} from .*)$/.exec(line);
      if (imports !== null) {
        const kept = (imports[2] ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name !== "" && !taken.has(name));
        return kept.length === 0 ? "" : `${imports[1]} ${kept.join(", ")} ${imports[3]}`;
      }
      const declared = /^declare (?:const|let|function) ([A-Za-z_$][\w$]*)/.exec(line)?.[1];
      return declared !== undefined && taken.has(declared) ? "" : line;
    })
    .join("\n");
}

/** The TypeScript a vue or svelte fence holds: its script blocks, without the tags. */
function scriptSource(fence: DocsFence): string {
  if (fence.language === "ts" || fence.language === "tsx") return fence.code;
  const blocks = [...fence.code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? "",
  );
  return blocks.join("\n");
}

const fences = markdownFiles(contentRoot).flatMap(pageFences);
const typed = fences.filter(
  (fence) => TYPED_LANGUAGES.has(fence.language) && !/(?:^|\s)generated(?:\s|$)/.test(fence.meta),
);
const snippetDirectory = join(outputDirectory, "snippets");
rmSync(snippetDirectory, { force: true, recursive: true });
mkdirSync(snippetDirectory, { recursive: true });

const entries = typed.map((fence, index) => {
  const isCompile = /(?:^|\s)compile(?:\s|$)/.test(fence.meta);
  const source = scriptSource(fence).replace(/^\s*import\s+["'][^"']+\.css["'];?\s*$/gm, "");
  const preludeName = metaValue(fence.meta, "prelude") ?? (isCompile ? undefined : "core");
  const prelude =
    preludeName === undefined ? "" : preludeWithout(resolveHoverPrelude(preludeName), boundNames(source));
  const extension = fence.language === "tsx" ? "tsx" : "ts";
  const file = join(snippetDirectory, `fence-${String(index).padStart(3, "0")}.${extension}`);
  const preludeLines = prelude === "" ? 0 : prelude.split("\n").length;
  writeFileSync(file, `${prelude}${prelude === "" ? "" : "\n"}${source}\nexport {};\n`);
  return { fence, file, isCompile, preludeLines };
});

const compilerOptions = {
  jsx: "react-jsx",
  lib: ["esnext", "dom", "dom.iterable"],
  module: "esnext",
  moduleResolution: "bundler",
  noEmit: true,
  strict: true,
  skipLibCheck: true,
  target: "es2022",
  types: ["node"],
  typeRoots: [join(repositoryRoot, "node_modules/@types")],
};
const configPath = join(snippetDirectory, "tsconfig.json");
writeFileSync(
  configPath,
  JSON.stringify({ compilerOptions, files: entries.map((entry) => entry.file) }, null, 2),
);
const compiler = spawnSync(
  join(repositoryRoot, "node_modules/.bin/tsc"),
  ["-p", configPath, "--pretty", "false"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, cwd: repositoryRoot },
);
writeFileSync(join(outputDirectory, "tsc.log"), `${compiler.stdout}${compiler.stderr}`);

const diagnosticsByFile = new Map<string, string[]>();
let lastList: string[] | undefined;
for (const line of compiler.stdout.split("\n")) {
  const located = /^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/.exec(line);
  if (located === null) {
    // Continuation lines of a multi-line message belong to the previous diagnostic.
    if (lastList !== undefined && line.trim() !== "") {
      lastList[lastList.length - 1] += ` | ${line.trim()}`;
    }
    continue;
  }
  const [, relativeFile = "", row = "0", , message = ""] = located;
  const file = resolve(repositoryRoot, relativeFile);
  const list = diagnosticsByFile.get(file) ?? [];
  list.push(`${row}: ${message}`);
  diagnosticsByFile.set(file, list);
  lastList = list;
}

const results: FenceResult[] = entries.map(({ fence, file, isCompile, preludeLines }) => ({
  ...fence,
  file,
  kind: isCompile ? "compile" : "partial",
  diagnostics: (diagnosticsByFile.get(file) ?? []).map((diagnostic) => {
    const [row = "0", ...rest] = diagnostic.split(": ");
    const fenceLine = fence.line + Number(row) - preludeLines;
    return `${fence.page}:${fenceLine} ${rest.join(": ")}`;
  }),
}));
writeFileSync(join(outputDirectory, "results.json"), JSON.stringify(results, null, 2));
const failing = results.filter((result) => result.diagnostics.length > 0).length;
process.stdout.write(
  `fences: ${fences.length}, typed: ${results.length}, with diagnostics: ${failing}, tsc exit ${compiler.status}\n`,
);
