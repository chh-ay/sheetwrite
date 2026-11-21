/**
 * QA script: writes every svelte fence of the docs content as a component,
 * with its named prelude after the script tag, and runs svelte-check on them.
 *
 *   bun check-svelte-fences.ts <repository-root> <output-directory>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveHoverPrelude } from "../checkouts/dcq-content/docs/src/lib/hover-preludes.ts";

interface FenceResult {
  readonly page: string;
  readonly line: number;
  readonly language: string;
  readonly meta: string;
  readonly code: string;
}

const [repositoryRoot = "", outputDirectory = ""] = process.argv.slice(2);
if (repositoryRoot === "" || outputDirectory === "") {
  throw new Error("Usage: bun check-svelte-fences.ts <repository-root> <output-directory>");
}
const fences = (
  JSON.parse(readFileSync(join(outputDirectory, "..", ".qa-fences", "results.json"), "utf8")) as FenceResult[]
).filter((fence) => fence.language === "svelte" && !fence.page.startsWith("api/"));

rmSync(outputDirectory, { force: true, recursive: true });
mkdirSync(outputDirectory, { recursive: true });
const index: string[] = [];
fences.forEach((fence, position) => {
  const preludeName = /(?:^|\s)prelude="([^"]+)"/.exec(fence.meta)?.[1] ?? "svelte";
  const prelude = resolveHoverPrelude(preludeName);
  // Names the fence binds or imports itself are dropped from the prelude, as the TS check does.
  const bound = new Set([
    ...[...fence.code.matchAll(/^\s*(?:let|const|function)\s+([A-Za-z_$][\w$]*)/gm)].map((match) => match[1] ?? ""),
    ...[...fence.code.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}/g)].flatMap((match) =>
      (match[1] ?? "").split(",").map((name) => name.trim().replace(/^type\s+/, "")),
    ),
    ...[...fence.code.matchAll(/let\s+\{([^}]+)\}\s*=\s*\$props/g)].flatMap((match) =>
      (match[1] ?? "").split(",").map((name) => name.trim().split(/[\s:=]/)[0] ?? ""),
    ),
  ]);
  const keptPrelude = prelude
    .split("\n")
    .map((line) => {
      const declared = /^declare (?:const|let|function) ([A-Za-z_$][\w$]*)/.exec(line)?.[1];
      if (declared !== undefined) return bound.has(declared) ? "" : line;
      const imports = /^(import (?:type )?\{)([^}]+)(\} from .*)$/.exec(line);
      if (imports === null) return line;
      const kept = (imports[2] ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "" && !bound.has(name));
      return kept.length === 0 ? "" : `${imports[1]} ${kept.join(", ")} ${imports[3]}`;
    })
    .join("\n");
  // Ambient declarations are allowed only in the module script, whose bindings the instance script and template see.
  const source = `<script lang="ts" module>\n${keptPrelude}\n</script>\n${fence.code}`;
  const file = `Fence${String(position).padStart(2, "0")}.svelte`;
  writeFileSync(join(outputDirectory, file), source);
  index.push(`${file} ${fence.page}:${fence.line}`);
});
writeFileSync(join(outputDirectory, "index.txt"), `${index.join("\n")}\n`);
writeFileSync(
  join(outputDirectory, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        module: "esnext",
        moduleResolution: "bundler",
        target: "es2022",
        strict: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
        lib: ["esnext", "dom"],
      },
      include: ["*.svelte"],
    },
    null,
    2,
  ),
);
const check = spawnSync(
  join(repositoryRoot, "node_modules/.bin/svelte-check"),
  ["--tsconfig", join(outputDirectory, "tsconfig.json"), "--output", "machine"],
  { encoding: "utf8", cwd: outputDirectory, maxBuffer: 16 * 1024 * 1024 },
);
writeFileSync(join(outputDirectory, "svelte-check.log"), `${check.stdout}${check.stderr}`);
process.stdout.write(`svelte fences: ${fences.length}, svelte-check exit ${check.status}\n`);
