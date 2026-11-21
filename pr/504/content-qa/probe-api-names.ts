/**
 * QA script: finds API names in the prose and inline code of every docs page
 * (outside fences) and writes a TypeScript probe file that touches each one,
 * so the compiler says which names do not exist in the built packages.
 *
 *   bun probe-api-names.ts <repository-root> <output-directory>
 *
 * Probes: `grid.x`, `store.x`, `sync.x`, `config.x` members, `Type.member`
 * for exported types, and `name(` calls checked against every package export.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { maskFences } from "../checkouts/dcq-content/scripts/markdown-fences.ts";

const [repositoryRoot = "", outputDirectory = ""] = process.argv.slice(2);
if (repositoryRoot === "" || outputDirectory === "") {
  throw new Error("Usage: bun probe-api-names.ts <repository-root> <output-directory>");
}
const contentRoot = join(repositoryRoot, "docs/src/content/docs");
const baseline = JSON.parse(
  readFileSync(join(repositoryRoot, "scripts/public-api-baseline.json"), "utf8"),
) as { exports: Record<string, string> };

/** Exported name → the module specifier that exports it first. */
const exportedFrom = new Map<string, string>();
for (const key of Object.keys(baseline.exports)) {
  const [packageName = "", subpath = ".", name = ""] = key.split("#");
  const specifier = subpath === "." ? packageName : `${packageName}/${subpath.replace(/^\.\//, "")}`;
  if (!exportedFrom.has(name)) exportedFrom.set(name, specifier);
}

/** Receivers whose members the prose names, and the type each stands for. */
const RECEIVERS: Readonly<Record<string, string>> = {
  grid: "Grid",
  store: "SheetwriteStore",
  sync: "SyncCoordinator",
  config: "GridConfig",
  "grid.actions": "GridActions",
};

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

interface Probe {
  readonly where: string;
  readonly expression: string;
}

const probes: Probe[] = [];
const seen = new Set<string>();
for (const path of markdownFiles(contentRoot)) {
  const page = relative(contentRoot, path);
  if (page.startsWith("releases/0.5") || page.startsWith("releases/0.6")) continue;
  const lines = maskFences(readFileSync(path, "utf8")).split("\n");
  lines.forEach((line, index) => {
    for (const span of line.matchAll(/`([^`\n]+)`/g)) {
      const code = span[1] ?? "";
      const where = `${page}:${index + 1}`;
      const member = /^(grid\.actions|grid|store|sync|config)\.([A-Za-z_$][\w$]*)/.exec(code);
      if (member !== null) {
        const type = RECEIVERS[member[1] ?? ""] ?? "";
        const expression = `({} as ${type}).${member[2]}`;
        if (!seen.has(expression)) probes.push({ where, expression });
        seen.add(expression);
        continue;
      }
      const typeMember = /^([A-Z][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(code);
      if (typeMember !== null && exportedFrom.has(typeMember[1] ?? "")) {
        const expression = `type _${probes.length} = ${typeMember[1]}["${typeMember[2]}"]`;
        if (!seen.has(code)) probes.push({ where, expression });
        seen.add(code);
        continue;
      }
      const call = /^([a-z][\w$]*)\(/.exec(code);
      if (call !== null && !exportedFrom.has(call[1] ?? "") && !seen.has(call[1] ?? "")) {
        seen.add(call[1] ?? "");
        probes.push({ where, expression: `/* not exported */ ${call[1]}` });
      }
    }
  });
}

const usedTypes = new Set<string>(Object.values(RECEIVERS));
for (const probe of probes) {
  const name = /type _\d+ = ([A-Z][\w$]*)\[/.exec(probe.expression)?.[1];
  if (name !== undefined) usedTypes.add(name);
}
const importLines = [...usedTypes].map((name) => {
  const specifier = name === "SheetwriteStore" ? "@sheetwrite/core" : (exportedFrom.get(name) ?? "@sheetwrite/core");
  return `import type { ${name} } from "${specifier}";`;
});
const header = importLines.length;
const body = probes.map((probe) =>
  probe.expression.startsWith("/* not exported */")
    ? `// ${probe.where} ${probe.expression}`
    : `${probe.expression}; // ${probe.where}`,
);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "probe.ts"), `${importLines.join("\n")}\n${body.join("\n")}\nexport {};\n`);
writeFileSync(
  join(outputDirectory, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        lib: ["esnext", "dom"],
        module: "esnext",
        moduleResolution: "bundler",
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: "es2022",
        types: [],
      },
      files: ["probe.ts"],
    },
    null,
    2,
  ),
);
process.stdout.write(`probes: ${probes.length} (import lines: ${header})\n`);
