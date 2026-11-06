// Lists single-cell store and engine reads that run inside a loop in core
// TypeScript, the candidates for a bulk or typed-array engine call. Each line
// is `file:line  call  loop`, preceded by the commit the audit read.
//
// The scan is lexical: it tracks brackets, skips strings and comments, and
// classifies each bracket from the code before it. A call counts as looped
// when a loop or a per-element array callback encloses it inside the same
// function.
//
// Usage: bun scripts/audit-engine-calls.ts [source root]

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/** Calls that read or probe one cell; a loop around them crosses the engine boundary per cell. */
const SINGLE_CELL_CALL =
  /\.(cellState|getCell|getCellLoadState|getFormula|getRefTarget|getSpillAnchor)\s*$/;

/** Statement heads whose body repeats; a parenthesized group reads back as `(…)`. */
const LOOP_HEAD = /(?:^|[^\w$.])(for|while|do)\s*(?:\(…\))?\s*$/;

/** Array methods whose callback runs once per element. */
const ITERATING_CALL = /\.(every|filter|find|findIndex|flatMap|forEach|map|reduce|some)\s*$/;

/** Heads that open a function body: arrows, `function`, and method or accessor signatures. */
const FUNCTION_HEAD =
  /=>\s*$|\bfunction\b.*\(…\)\s*(?::[^{]*)?$|^\s*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*[#\w$]+\s*(?:<[^>]*>)?\s*\(…\)\s*(?::[^{]*)?$/s;

/** Heads of statements that never repeat their body. */
const PLAIN_BLOCK_HEAD = /(?:^|[^\w$.])(if|else|switch|try|catch|finally|case|default)\b/;

const DEFAULT_ROOT = "packages/core/src";

type Frame = "loop" | "function" | "block";

/** One open bracket: what it repeats or bounds, and the head it interrupted. */
interface OpenBracket {
  readonly frame: Frame;
  readonly label: string;
  readonly outerHead: string;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly call: string;
  readonly loop: string;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
    }),
  );
  return nested.flat();
}

/** Classify a `{` from the code since the previous statement boundary. */
function braceFrame(head: string): Frame {
  if (LOOP_HEAD.test(head)) return "loop";
  if (PLAIN_BLOCK_HEAD.test(head)) return "block";
  if (FUNCTION_HEAD.test(head)) return "function";
  return "block";
}

/** The innermost loop between the cursor and its enclosing function, if any. */
function loopLabel(stack: readonly OpenBracket[]): string | null {
  for (let index = stack.length - 1; index >= 0; index--) {
    const entry = stack[index];
    if (entry === undefined || entry.frame === "function") return null;
    if (entry.frame === "loop") return entry.label;
  }

  return null;
}

/** Index just past the string, template or comment that starts at `start`, or `start` itself. */
function skipNonCode(text: string, start: number): number {
  const char = text[start];
  if (char === "/" && text[start + 1] === "/") {
    const end = text.indexOf("\n", start);
    return end < 0 ? text.length : end;
  }

  if (char === "/" && text[start + 1] === "*") {
    const end = text.indexOf("*/", start + 2);
    return end < 0 ? text.length : end + 2;
  }

  if (char !== '"' && char !== "'" && char !== "`") return start;

  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === char) return index + 1;
  }

  return text.length;
}

function findingsIn(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const stack: OpenBracket[] = [];
  let head = "";
  let line = 1;

  for (let index = 0; index < text.length; index++) {
    const next = skipNonCode(text, index);
    if (next !== index) {
      for (let skipped = index; skipped < next; skipped++) {
        if (text[skipped] === "\n") line += 1;
      }

      head += " ";
      index = next - 1;
      continue;
    }

    const char = text[index] ?? "";
    if (char === "\n") line += 1;

    if (char === "(") {
      const call = SINGLE_CELL_CALL.exec(head);
      const bracelessLoop = LOOP_HEAD.exec(head.replace(/\(…\)[^]*$/, "(…)"));
      const label = loopLabel(stack) ?? bracelessLoop?.[1] ?? null;
      if (call && label !== null) findings.push({ file, line, call: call[1] ?? "", loop: label });

      const iterating = ITERATING_CALL.exec(head);
      stack.push({
        frame: iterating ? "loop" : "block",
        label: iterating ? `.${iterating[1]}()` : "",
        outerHead: head,
      });
      head = "";
    } else if (char === "{" || char === "[") {
      const parsed = char === "{" ? braceFrame(head) : "block";
      // A callback body of a per-element call repeats with its loop frame.
      const isIteratingCallback = parsed === "function" && stack.at(-1)?.frame === "loop";
      const frame = isIteratingCallback ? "block" : parsed;
      const label = frame === "loop" ? (LOOP_HEAD.exec(head)?.[1] ?? "") : "";
      stack.push({ frame, label, outerHead: "" });
      head = "";
    } else if (char === ")") {
      head = `${stack.pop()?.outerHead ?? ""}(…)`;
    } else if (char === "}" || char === "]") {
      stack.pop();
      head = "";
    } else if (char === ";") {
      head = "";
    } else {
      head += char;
    }
  }

  return findings;
}

const root = process.argv[2] ?? DEFAULT_ROOT;
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const files = (await sourceFiles(root)).sort();
const findings: Finding[] = [];

for (const file of files) {
  findings.push(...findingsIn(relative(root, file), await readFile(file, "utf8")));
}

console.info(`commit ${commit}`);
console.info(`${findings.length} single-cell reads inside loops under ${root}`);
for (const finding of findings) {
  console.info(`${finding.file}:${finding.line}\t${finding.call}\t${finding.loop}`);
}
