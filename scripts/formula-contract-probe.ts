import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as formulas from "@sheetwrite/formulas";
import * as defaultEngine from "@sheetwrite/wasm";
import { FormulaAssist } from "../packages/core/src/formula-assist.js";
import { initSheetwrite, SheetwriteStore } from "../packages/core/src/index.js";
import type { Theme } from "../packages/core/src/types.js";
import { makeWorkbook } from "../packages/core/test/fixtures.js";

const ENGINE_SWITCH_ERROR =
  "Sheetwrite: select one engine before initialization; the engine cannot change.";

// Independent closed-form values cover every optional dispatch arm, not merely registration.
const DISTRIBUTION_CASES: readonly (readonly [string, number])[] = [
  ["=NORM.DIST(0,0,1,TRUE)", 0.5],
  ["=NORM.INV(0.5,3,2)", 3],
  ["=NORM.S.DIST(0,FALSE)", 1 / Math.sqrt(2 * Math.PI)],
  ["=NORM.S.INV(0.5)", 0],
  ["=T.DIST(0,1,TRUE)", 0.5],
  ["=T.DIST.2T(1,1)", 0.5],
  ["=T.DIST.RT(1,1)", 0.25],
  ["=T.INV(0.75,1)", 1],
  ["=T.INV.2T(0.5,1)", 1],
  ["=CHISQ.DIST(2,2,TRUE)", 1 - Math.exp(-1)],
  ["=CHISQ.DIST.RT(2,2)", Math.exp(-1)],
  ["=CHISQ.INV(0.5,2)", 2 * Math.LN2],
  ["=CHISQ.INV.RT(0.5,2)", 2 * Math.LN2],
  ["=F.DIST(1,2,2,TRUE)", 0.5],
  ["=F.DIST.RT(1,2,2)", 0.5],
  ["=F.INV(0.5,2,2)", 1],
  ["=F.INV.RT(0.5,2,2)", 1],
  ["=BINOM.DIST(2,4,0.5,FALSE)", 0.375],
  ["=POISSON.DIST(0,2,FALSE)", Math.exp(-2)],
  ["=EXPON.DIST(1,2,TRUE)", 1 - Math.exp(-2)],
  ["=GAMMA(5)", 24],
  ["=GAMMALN(5)", Math.log(24)],
  ["=GAMMA.DIST(2,1,2,TRUE)", 1 - Math.exp(-1)],
  ["=GAMMA.INV(0.5,1,2)", 2 * Math.LN2],
  ["=BETA.DIST(3,1,1,TRUE,2,4)", 0.5],
  ["=BETA.INV(0.5,1,1,2,4)", 3],
  ["=LOGNORM.DIST(1,0,1,TRUE)", 0.5],
  ["=LOGNORM.INV(0.5,0,1)", 1],
  ["=WEIBULL.DIST(2,1,2,TRUE)", 1 - Math.exp(-1)],
  ["=CONFIDENCE.NORM(0.31731050786291415,2,4)", 1],
  ["=CONFIDENCE.T(0.5,1,2)", 1 / Math.sqrt(2)],
  ["=STANDARDIZE(5,3,2)", 1],
  ["=FISHER(0.5)", Math.log(3) / 2],
  ["=FISHERINV(0)", 0],
  ["=PHI(0)", 1 / Math.sqrt(2 * Math.PI)],
  ["=GAUSS(0)", 0],
];
const DOMAIN_ERRORS = ["=NORM.INV(0,0,1)", "=GAMMA.DIST(1,0,1,TRUE)", "=BETA.INV(-1,1,1)"];
const NUMERICAL_TOLERANCE = 1e-8;
const ASSIST_THEME: Theme = {
  font: "13px sans-serif",
  bg: "#fff",
  fg: "#111",
  gridLine: "#eee",
  headerBg: "#eee",
  headerFg: "#111",
  selection: "#abc",
  selectionBorder: "#123",
  rowHeight: 28,
  headerHeight: 28,
  rowHeaderWidth: 48,
  searchMatch: "#abc",
  searchActiveMatch: "#abc",
  highlight: "#abc",
};

const build = process.argv[2];
assert.ok(
  build === "@sheetwrite/wasm" || build === "@sheetwrite/formulas",
  "expected engine package argument",
);
const isAnalysis = build === "@sheetwrite/formulas";
const [selected, other] = isAnalysis ? [formulas, defaultEngine] : [defaultEngine, formulas];
// Concurrent selection of one engine shares initialization; a later call without
// an engine keeps it, and a different engine is rejected without being loaded.
await Promise.all([initSheetwrite(undefined, selected), initSheetwrite(undefined, selected)]);
await initSheetwrite();
await assert.rejects(initSheetwrite(undefined, other), { message: ENGINE_SWITCH_ERROR });
assert.equal(selected.isLoaded(), true, "selected engine must be loaded");
assert.equal(other.isLoaded(), false, "the other engine must never be initialized");
if (isAnalysis) {
  const inventory = JSON.parse(
    readFileSync(
      new URL("../test/conformance/formula-contract.inventory.json", import.meta.url),
      "utf8",
    ),
  ) as {
    functions: Array<{ canonical: string; aliases: string[]; builds: string[] }>;
  };
  const expectedNames = inventory.functions
    .filter((formula) => formula.builds.includes(build))
    .flatMap((formula) => [formula.canonical, ...formula.aliases])
    .sort();
  assert.deepEqual(
    formulas.functionNames(),
    expectedNames,
    "active engine names must match build-aware contract including aliases",
  );
}

const store = new SheetwriteStore(
  makeWorkbook(DISTRIBUTION_CASES.length + DOMAIN_ERRORS.length + 1),
);
try {
  const sources = [...DISTRIBUTION_CASES.map(([source]) => source), ...DOMAIN_ERRORS, "=SUM(1,2)"];
  store.applyTransaction({
    patches: sources.map((source, row) => ({
      op: "set" as const,
      addr: { sheet: "s1", row, col: 1 },
      value: { kind: "formula" as const, src: source },
    })),
  });
  for (const [row, [source, expected]] of DISTRIBUTION_CASES.entries()) {
    const address = { sheet: "s1", row, col: 1 };
    assert.equal(
      store.getFormula(address),
      source,
      "engine selection must preserve formula source",
    );
    const actual = store.getCell(address).resolved;
    if (isAnalysis) {
      assert.equal(typeof actual, "number", source);
      assert.ok(
        typeof actual === "number" &&
          Number.isFinite(actual) &&
          Math.abs(actual - expected) <= NUMERICAL_TOLERANCE,
        `${source}: expected ${expected}, got ${actual}`,
      );
    } else {
      assert.equal(actual, "#NAME?", `${source} must remain optional`);
    }
  }
  for (const [offset, source] of DOMAIN_ERRORS.entries()) {
    assert.equal(
      store.getCell({ sheet: "s1", row: DISTRIBUTION_CASES.length + offset, col: 1 }).resolved,
      isAnalysis ? "#NUM!" : "#NAME?",
      source,
    );
  }
  assert.equal(
    store.getCell({ sheet: "s1", row: sources.length - 1, col: 1 }).resolved,
    3,
    "both builds must retain base functions",
  );

  const host = document.createElement("div");
  const textarea = document.createElement("textarea");
  host.append(textarea);
  document.body.append(host);
  const assist = new FormulaAssist(host, { highlightCells: () => {}, sheet: () => "s1" });
  try {
    textarea.value = "=NORM.";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    assist.attach(textarea, ASSIST_THEME);
    const suggestions = [...host.querySelectorAll(".sheetwrite-assist-item")].map(
      (element) => element.textContent,
    );
    assert.deepEqual(
      suggestions,
      // Assist lists shorter names first, then names in alphabetical order.
      isAnalysis ? ["NORM.INV", "NORM.DIST", "NORM.S.INV", "NORM.S.DIST"] : [],
      "autocomplete must use the selected engine's distribution names",
    );
  } finally {
    assist.detach();
    host.remove();
  }
} finally {
  store.dispose();
}
process.stdout.write(`${build}: distribution evaluation and assist contract passed\n`);
