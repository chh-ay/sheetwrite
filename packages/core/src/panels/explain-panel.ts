// Formulas › Explain Formula: a side panel that describes the formula in the
// focus cell in fixed text from function metadata, with each reference in the
// colour formula help gives it. It does not calculate, so it never runs a
// volatile or host function. The panel follows the cell selection.

import { colToA1 } from "../a1.js";
import {
  analyzeFormula,
  argumentOf,
  type FormulaAnalysis,
  type FormulaReference,
} from "../formula-analysis.js";
import { referenceColor } from "../formula-colors.js";
import { storeFunctions } from "../functions/registry.js";
import { signature } from "../functions/signature.js";
import type { FormulaFunctionMetadata } from "../functions/types.js";
import { selectionFocus } from "../shell/grid-binding.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { panelSection, rebuildPanel } from "./panel-dom.js";

const NO_FORMULA = "Select a cell with a formula to explain it.";

function paragraph(text: string, className = "sheetwrite-explain-text"): HTMLElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

function listOf(items: readonly HTMLElement[]): HTMLElement {
  const list = document.createElement("ul");
  list.className = "sheetwrite-explain-list";
  list.append(...items);
  return list;
}

function listItem(...parts: (string | Node)[]): HTMLElement {
  const item = document.createElement("li");
  item.append(...parts);
  return item;
}

function coloured(text: string, reference: FormulaReference): HTMLElement {
  const span = document.createElement("span");
  span.className = "sheetwrite-explain-reference";
  span.style.color = referenceColor(reference);
  span.textContent = text;
  return span;
}

function strong(text: string): HTMLElement {
  const element = document.createElement("strong");
  element.textContent = text;
  return element;
}

/** The formula text with each reference in its colour. */
function formulaLine(text: string, references: readonly FormulaReference[]): HTMLElement {
  const code = document.createElement("code");
  code.className = "sheetwrite-explain-formula";

  let at = 0;
  for (const reference of references) {
    code.append(text.slice(at, reference.from));
    code.append(coloured(text.slice(reference.from, reference.to), reference));
    at = reference.to;
  }
  code.append(text.slice(at));

  return code;
}

/** The text of each argument of the call whose name token is `nameIndex`. */
function callArguments(text: string, analysis: FormulaAnalysis, nameIndex: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = -1;
  for (const token of analysis.tokens.slice(nameIndex + 1)) {
    const char = text.charAt(token.from);
    if (token.kind === "paren" && (char === "(" || char === "{")) {
      depth += 1;
      if (depth === 1) start = token.to;
    } else if (token.kind === "paren") {
      depth -= 1;
      if (depth === 0) {
        args.push(text.slice(start, token.from).trim());
        return args.length === 1 && args[0] === "" ? [] : args;
      }
    } else if (depth === 1 && char === ",") {
      args.push(text.slice(start, token.from).trim());
      start = token.to;
    }
  }

  // A call without its `)` takes the rest of the text.
  if (start >= 0) args.push(text.slice(start).trim());
  return args;
}

/**
 * One entry per function call, in the order the calls start. A name without
 * metadata (a LET or LAMBDA name, or any name before the list loads) shows
 * alone; the Problems section reports names the formula cannot call.
 */
function functionItems(
  text: string,
  analysis: FormulaAnalysis,
  functions: ReadonlyMap<string, FormulaFunctionMetadata>,
): HTMLElement[] {
  return analysis.tokens.flatMap((token, index) => {
    if (token.kind !== "function") return [];

    const name = text.slice(token.from, token.to).toUpperCase();
    const fn = functions.get(name);
    if (fn === undefined) return [listItem(strong(name))];

    const args = callArguments(text, analysis, index).map((argument, position) =>
      listItem(
        strong(argumentOf(fn, position)?.name ?? `argument ${position + 1}`),
        `: ${argument}`,
      ),
    );
    const item = listItem(strong(signature(fn)), `: ${fn.description}`);
    if (args.length > 0) item.append(listOf(args));
    return [item];
  });
}

function cellWord(count: number): string {
  return count === 1 ? "1 cell" : `${count} cells`;
}

/** One entry per distinct reference: its text, its sheet and its size. */
function referenceItems(text: string, references: readonly FormulaReference[]): HTMLElement[] {
  const seen = new Set<number>();
  return references.flatMap((reference) => {
    if (seen.has(reference.colorIndex)) return [];
    seen.add(reference.colorIndex);

    const rows = reference.end.row - reference.start.row + 1;
    const columns = reference.end.col - reference.start.col + 1;
    const where = reference.sheet === null ? "this sheet" : `sheet ${reference.sheet}`;
    const label = coloured(text.slice(reference.from, reference.to), reference);
    return [listItem(label, `: ${cellWord(rows * columns)} on ${where}`)];
  });
}

function buildExplanation(
  body: HTMLElement,
  grid: Grid,
  functions: readonly FormulaFunctionMetadata[],
): void {
  const focus = selectionFocus(grid.getSelection());
  const input = focus === null ? null : grid.getCellInput(focus.row, focus.col);
  const text = input?.text ?? "";
  if (input === null || !text.startsWith("=")) {
    body.append(paragraph(NO_FORMULA));
    return;
  }

  const analysis = analyzeFormula(text, text.length, functions);
  const byName = new Map(functions.map((fn) => [fn.name.toUpperCase(), fn]));
  const cell = `${colToA1(input.address.col)}${input.address.row + 1}`;

  const formula = panelSection(`Formula in ${cell}`);
  formula.append(formulaLine(text, analysis.references));
  body.append(formula);

  const calls = functionItems(text, analysis, byName);
  if (calls.length > 0) {
    const section = panelSection("Functions");
    section.append(listOf(calls));
    body.append(section);
  }

  const references = referenceItems(text, analysis.references);
  if (references.length > 0) {
    const section = panelSection("References");
    section.append(listOf(references));
    body.append(section);
  }

  if (analysis.diagnostics.length > 0) {
    const section = panelSection("Problems");
    section.append(listOf(analysis.diagnostics.map((entry) => listItem(entry.message))));
    body.append(section);
  }
}

/** The Explain Formula panel; it reads the function list once when it opens. */
export function explainPanel(grid: Grid): GridPanel {
  return {
    title: "Explain Formula",
    render: (body) => {
      let functions: readonly FormulaFunctionMetadata[] = [];
      let disposed = false;
      const draw = (): void =>
        rebuildPanel(body, (target) => buildExplanation(target, grid, functions));

      draw();
      storeFunctions(grid.store).then(
        (loaded) => {
          if (disposed) return;
          functions = loaded;
          draw();
        },
        (error: unknown) => {
          // The panel still shows the formula, its references and syntax errors.
          console.warn("Sheetwrite: Explain Formula could not read the function list", error);
        },
      );

      const unsubscribes = [
        grid.on("selection", draw),
        grid.on("change", draw),
        grid.on("active-sheet", draw),
      ];
      return () => {
        disposed = true;
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
  };
}
