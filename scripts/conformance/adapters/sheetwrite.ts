import type { shiftA1Refs as shiftA1RefsType } from "../../../packages/core/src/a1.js";
import type { DocumentController } from "../../../packages/core/src/document-controller.js";
import type { formatNumber as formatNumberType } from "../../../packages/core/src/number-format.js";
import type { SheetwriteStore } from "../../../packages/core/src/store.js";
import type { CellScalar, CellValue, Column } from "../../../packages/core/src/types/cell.js";
import type { DocumentOp, Workbook } from "../../../packages/core/src/types/document.js";
import { canonicalJson, isNonemptyString } from "../normalize.js";
import type { CellResult, ConformanceCase, ConformanceResult } from "../types.js";

function a1(cell: string): { row: number; col: number } {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell);
  if (!match) throw new Error(`Invalid A1 cell ${cell}`);
  let col = 0;
  for (const character of match[1]!) col = col * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, col: col - 1 };
}

/**
 * Every error the engine can produce, as `FormulaError::sentinel` in
 * `packages/wasm/src/types.rs` spells it. A resolved cell carries an error as
 * this text, so any other text is a string result.
 */
const ENGINE_ERRORS: ReadonlySet<string> = new Set([
  "#CYCLE!",
  "#DIV/0!",
  "#REF!",
  "#NUM!",
  "#VALUE!",
  "#NAME?",
  "#N/A",
  "#SPILL!",
  "#CALC!",
  "#LOADING!",
  "#NULL!",
]);

function classify(
  value: CellScalar,
  numberFormat: string | undefined,
  formatter: typeof formatNumberType,
): CellResult {
  const displayedText =
    numberFormat !== undefined && (typeof value === "number" || typeof value === "string")
      ? formatter(value, numberFormat, "en-US")
      : undefined;
  if (value === null) return { type: "blank" };
  if (typeof value === "number") return { type: "number", value, displayedText };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (ENGINE_ERRORS.has(value)) return { type: "error", error: value };
  return { type: "string", value };
}

function fixtureWorkbook(): Workbook {
  const columns: Column[] = Array.from({ length: 32 }, (_, index) => ({
    key: `c${index}`,
    header: `Column ${index + 1}`,
    width: 100,
    type: "text",
  }));
  return {
    activeSheet: "oracle",
    sheets: [{ id: "oracle", name: "Oracle", rowCount: 256, columns }],
  };
}

/** What a feature check can use: the store, its document controller and patch builders. */
interface FeatureContext {
  readonly store: SheetwriteStore;
  readonly controller: DocumentController;
  readonly apply: (patches: DocumentOp[]) => void;
  readonly literal: (cell: string, value: CellScalar) => DocumentOp;
  readonly formula: (cell: string, src: string) => DocumentOp;
  readonly shiftA1Refs: typeof shiftA1RefsType;
}

/** One check per workbook or mutation feature; each returns whether the feature behaved. */
const FEATURE_CHECKS: Readonly<Record<string, (context: FeatureContext) => boolean>> = {
  "edit-precedent": ({ apply, literal, formula, store }) => {
    apply([literal("A10", 1), formula("B10", "=A10+1")]);
    apply([literal("A10", 4)]);
    return store.getCell({ sheet: "oracle", ...a1("B10") }).resolved === 5;
  },
  "fill-formula": ({ apply, literal, formula, store, shiftA1Refs }) => {
    const source = "=A20+10";
    apply([
      literal("A20", 1),
      literal("A21", 2),
      literal("A22", 3),
      formula("B20", source),
      formula("B21", shiftA1Refs(source, 1, 0)),
      formula("B22", shiftA1Refs(source, 2, 0)),
    ]);
    return ["B20", "B21", "B22"].every(
      (cell, index) => store.getCell({ sheet: "oracle", ...a1(cell) }).resolved === index + 11,
    );
  },
  "copy-formula": ({ apply, literal, formula, store, shiftA1Refs }) => {
    const source = "=A30*2";
    apply([
      literal("A30", 7),
      literal("A31", 8),
      formula("B30", source),
      formula("B31", shiftA1Refs(source, 1, 0)),
    ]);
    return store.getCell({ sheet: "oracle", ...a1("B31") }).resolved === 16;
  },
  "insert-row": ({ apply, store }) => {
    apply([{ op: "addRows", sheet: "oracle", at: 0, count: 1 }]);
    const inserted = store.getWorkbook().sheets[0]!.rowCount === 257;
    apply([{ op: "removeRows", sheet: "oracle", at: 0, count: 1 }]);
    return inserted && store.getWorkbook().sheets[0]!.rowCount === 256;
  },
  "delete-row": ({ apply, store }) => {
    apply([{ op: "removeRows", sheet: "oracle", at: 255, count: 1 }]);
    const removed = store.getWorkbook().sheets[0]!.rowCount === 255;
    apply([{ op: "addRows", sheet: "oracle", at: 255, count: 1 }]);
    return removed && store.getWorkbook().sheets[0]!.rowCount === 256;
  },
  "insert-column": ({ apply, store }) => {
    apply([
      {
        op: "addColumns",
        sheet: "oracle",
        at: 31,
        columns: [{ key: "inserted", header: "Inserted", width: 80, type: "text" }],
      },
    ]);
    const inserted = store.getWorkbook().sheets[0]!.columns.length === 33;
    apply([{ op: "removeColumns", sheet: "oracle", at: 31, count: 1 }]);
    return inserted && store.getWorkbook().sheets[0]!.columns.length === 32;
  },
  "delete-column": ({ apply, store }) => {
    apply([{ op: "removeColumns", sheet: "oracle", at: 31, count: 1 }]);
    const removed = store.getWorkbook().sheets[0]!.columns.length === 31;
    apply([
      {
        op: "addColumns",
        sheet: "oracle",
        at: 31,
        columns: [{ key: "c31", header: "Column 32", width: 100, type: "text" }],
      },
    ]);
    return removed && store.getWorkbook().sheets[0]!.columns.length === 32;
  },
  "rename-sheet": ({ apply, store }) => {
    apply([{ op: "renameSheet", sheet: "oracle", name: "Renamed" }]);
    const renamed = store.getWorkbook().sheets[0]!.name === "Renamed";
    apply([{ op: "renameSheet", sheet: "oracle", name: "Oracle" }]);
    return renamed && store.getWorkbook().sheets[0]!.name === "Oracle";
  },
  "rename-name": ({ apply, literal, formula, store }) => {
    apply([
      literal("A80", 5),
      {
        op: "setNamedRange",
        namedRange: {
          name: "OldName",
          range: {
            sheet: "oracle",
            start: { row: 79, col: 0 },
            end: { row: 79, col: 0 },
          },
        },
      },
      { op: "removeNamedRange", name: "OldName" },
      {
        op: "setNamedRange",
        namedRange: {
          name: "NewName",
          range: {
            sheet: "oracle",
            start: { row: 79, col: 0 },
            end: { row: 79, col: 0 },
          },
        },
      },
      formula("B80", "=NewName"),
    ]);
    return store.getCell({ sheet: "oracle", ...a1("B80") }).resolved === 5;
  },
  "spill-obstruction-resize": ({ apply, literal, formula, store }) => {
    apply([literal("B91", "block"), formula("B90", "=SEQUENCE(2,1)")]);
    const obstructed = store.getCell({ sheet: "oracle", ...a1("B90") }).resolved === "#SPILL!";
    apply([literal("B91", null), formula("B90", "=SEQUENCE(3,1)")]);
    return (
      obstructed &&
      store.getCell({ sheet: "oracle", ...a1("B90") }).resolved === 1 &&
      store.getCell({ sheet: "oracle", ...a1("B92") }).resolved === 3
    );
  },
  "undo-redo": ({ apply, literal, store, controller }) => {
    apply([literal("A100", 1)]);
    apply([literal("A100", 2)]);
    controller.undo();
    const undone = store.getCell({ sheet: "oracle", ...a1("A100") }).resolved === 1;
    controller.redo();
    return undone && store.getCell({ sheet: "oracle", ...a1("A100") }).resolved === 2;
  },
  recalculate: ({ apply, formula, store }) => {
    apply([formula("A110", "=TODAY()")]);
    store.recalculateVolatile(new Date("2020-01-01T00:00:00.000Z"));
    const first = store.getCell({ sheet: "oracle", ...a1("A110") }).resolved;
    store.recalculateVolatile(new Date("2020-01-02T00:00:00.000Z"));
    const second = store.getCell({ sheet: "oracle", ...a1("A110") }).resolved;
    return typeof first === "number" && typeof second === "number" && second - first === 1;
  },
  sheets: ({ apply, store }) => {
    apply([
      {
        op: "addSheet",
        sheet: {
          id: "feature-sheet",
          name: "Feature Sheet",
          order: 1,
          rowCount: 16,
          columns: fixtureWorkbook().sheets[0]!.columns,
          cells: [],
        },
      },
    ]);
    return store
      .getWorkbook()
      .sheets.some((sheet) => sheet.id === "feature-sheet" && sheet.name === "Feature Sheet");
  },
  names: ({ apply, literal, formula, store }) => {
    apply([
      literal("A120", 9),
      {
        op: "setNamedRange",
        namedRange: {
          name: "FeatureName",
          range: {
            sheet: "oracle",
            start: { row: 119, col: 0 },
            end: { row: 119, col: 0 },
          },
        },
      },
      formula("B120", "=FeatureName"),
    ]);
    return store.getCell({ sheet: "oracle", ...a1("B120") }).resolved === 9;
  },
  visibility: ({ apply, store }) => {
    const existing = store.getWorkbook().sheets.some((sheet) => sheet.id === "visible-meta");
    if (!existing) {
      apply([
        {
          op: "addSheet",
          sheet: {
            id: "visible-meta",
            name: "Visibility",
            order: store.getWorkbook().sheets.length,
            rowCount: 16,
            columns: fixtureWorkbook().sheets[0]!.columns,
            cells: [],
          },
        },
      ]);
    }
    apply([{ op: "setSheetVisibility", sheet: "visible-meta", visibility: "veryHidden" }]);
    return (
      store.getWorkbook().sheets.find((sheet) => sheet.id === "visible-meta")?.visibility ===
      "veryHidden"
    );
  },
  tables: ({ apply, store }) => {
    apply([
      {
        op: "addTable",
        table: {
          id: "feature-table",
          name: "FeatureTable",
          range: {
            sheet: "oracle",
            start: { row: 129, col: 0 },
            end: { row: 131, col: 1 },
          },
          columns: [
            { id: "feature-col-a", name: "A" },
            { id: "feature-col-b", name: "B" },
          ],
          headerRow: true,
          totalsRow: false,
        },
      },
    ]);
    return store.getWorkbook().sheets[0]!.tables?.[0]?.id === "feature-table";
  },
  hyperlinks: ({ apply, store }) => {
    apply([
      {
        op: "setHyperlink",
        sheet: "oracle",
        hyperlink: {
          id: "feature-link",
          range: {
            sheet: "oracle",
            start: { row: 139, col: 0 },
            end: { row: 139, col: 0 },
          },
          target: { kind: "external", url: "https://example.com/" },
        },
      },
    ]);
    return store.getWorkbook().sheets[0]!.hyperlinks?.[0]?.id === "feature-link";
  },
  "conditional-formats": ({ apply, store }) => {
    apply([
      {
        op: "setSheetMeta",
        sheet: "oracle",
        patch: {
          conditionalFormats: [
            {
              range: {
                sheet: "oracle",
                start: { row: 149, col: 0 },
                end: { row: 149, col: 0 },
              },
              when: { kind: "greaterThan", value: 0 },
              style: { bold: true },
            },
          ],
        },
      },
    ]);
    return store.getWorkbook().sheets[0]!.conditionalFormats?.length === 1;
  },
  styles: ({ apply, store }) => {
    apply([
      {
        op: "setRangeStyle",
        range: {
          sheet: "oracle",
          start: { row: 159, col: 0 },
          end: { row: 159, col: 0 },
        },
        style: { bold: true, backgroundColor: "#ffeeaa" },
      },
    ]);
    return store.getCell({ sheet: "oracle", row: 159, col: 0 }).style.bold === true;
  },
  merges: ({ apply, store }) => {
    apply([
      {
        op: "addMerge",
        sheet: "oracle",
        merge: { r0: 169, c0: 0, r1: 169, c1: 1 },
      },
    ]);
    return store.getWorkbook().sheets[0]!.merges?.length === 1;
  },
  panes: ({ apply, store }) => {
    apply([
      {
        op: "setSheetMeta",
        sheet: "oracle",
        patch: { frozenRows: 2, frozenCols: 1 },
      },
    ]);
    const sheet = store.getWorkbook().sheets[0]!;
    return sheet.frozenRows === 2 && sheet.frozenCols === 1;
  },
  validation: ({ apply, store }) => {
    apply([
      {
        op: "setValidationRule",
        sheet: "oracle",
        rule: {
          id: "feature-validation",
          range: {
            sheet: "oracle",
            start: { row: 179, col: 0 },
            end: { row: 179, col: 0 },
          },
          condition: { kind: "number", min: 0, max: 10 },
          policy: "warn",
        },
      },
    ]);
    return store.getWorkbook().sheets[0]!.validationRules?.[0]?.id === "feature-validation";
  },
  notes: ({ apply, store }) => {
    apply([
      {
        op: "setNote",
        addr: { sheet: "oracle", row: 189, col: 0 },
        text: "Feature note",
      },
    ]);
    return store.getWorkbook().sheets[0]!.notes?.[0]?.text === "Feature note";
  },
  formulas: ({ apply, literal, formula, store }) => {
    apply([literal("A200", 6), formula("B200", "=A200*2")]);
    return store.getCell({ sheet: "oracle", ...a1("B200") }).resolved === 12;
  },
  errors: ({ apply, formula, store }) => {
    apply([formula("A210", "=1/0")]);
    return store.getCell({ sheet: "oracle", ...a1("A210") }).resolved === "#DIV/0!";
  },
  warnings: ({ apply, literal, controller }) => {
    apply([
      {
        op: "setValidationRule",
        sheet: "oracle",
        rule: {
          id: "warning-validation",
          range: {
            sheet: "oracle",
            start: { row: 219, col: 0 },
            end: { row: 219, col: 0 },
          },
          condition: { kind: "number", min: 0, max: 10 },
          policy: "warn",
        },
      },
    ]);
    const warned = controller.applyTransaction({ patches: [literal("A220", 20)] });
    return (
      warned.status === "applied" && Array.isArray(warned.warnings) && warned.warnings.length > 0
    );
  },
};

export async function runSheetwriteCase(entry: ConformanceCase): Promise<ConformanceResult> {
  if (entry.unsupported) return { type: "unsupported" };

  const [
    { initSheetwrite },
    { formatNumber },
    { SheetwriteStore },
    { DocumentController },
    { shiftA1Refs },
  ] = await Promise.all([
    import("../../../packages/core/src/grid.js"),
    import("../../../packages/core/src/number-format.js"),
    import("../../../packages/core/src/store.js"),
    import("../../../packages/core/src/document-controller.js"),
    import("../../../packages/core/src/a1.js"),
  ]);
  await initSheetwrite();

  const store = new SheetwriteStore(fixtureWorkbook());
  try {
    if (entry.kind !== "workbook" && entry.kind !== "mutation") {
      return runFormulaCase(entry, store, formatNumber);
    }

    if (entry.feature === "mutation-matrix" || entry.feature === "workbook-matrix") {
      const controller = new DocumentController({
        store,
        loadable: store,
        readOnly: () => false,
        epoch: () => 0,
        materializeVirtualColumns: (patches) => patches,
        onMutationRejected: () => undefined,
        onHistoryApplied: () => undefined,
      });
      try {
        return runFeatureChecks(entry, store, controller, shiftA1Refs);
      } finally {
        controller.destroy();
      }
    }

    return runWorkbookOperations(entry, store);
  } finally {
    store.dispose();
  }
}

/** Run each listed feature check against one store and count the features that behaved. */
function runFeatureChecks(
  entry: ConformanceCase,
  store: SheetwriteStore,
  controller: DocumentController,
  shiftA1Refs: typeof shiftA1RefsType,
): ConformanceResult {
  const context: FeatureContext = {
    store,
    controller,
    apply: (patches) => {
      const result = controller.applyTransaction({ patches });
      if (result.status !== "applied") {
        throw new Error(`${entry.id}: feature operation rejected: ${canonicalJson(result)}`);
      }
    },
    literal: (cell, value) => ({
      op: "set",
      addr: { sheet: "oracle", ...a1(cell) },
      value: { kind: "literal", value },
    }),
    formula: (cell, src) => ({
      op: "set",
      addr: { sheet: "oracle", ...a1(cell) },
      value: { kind: "formula", src },
    }),
    shiftA1Refs,
  };

  const checks: Record<string, boolean> = {};
  for (const operation of entry.operations ?? []) {
    const feature = String(operation.op);
    const check = Object.hasOwn(FEATURE_CHECKS, feature) ? FEATURE_CHECKS[feature] : undefined;
    if (!check) throw new Error(`${entry.id}: unsupported feature operation ${feature}`);

    checks[feature] = check(context);
  }

  return { type: "workbook", value: { passed: Object.values(checks).filter(Boolean).length } };
}

/** Apply the case's sheet and cell operations as one transaction and report the workbook. */
function runWorkbookOperations(entry: ConformanceCase, store: SheetwriteStore): ConformanceResult {
  const patches: DocumentOp[] = [];
  const observedCells: Array<{ sheet: string; cell: string }> = [];
  let activeSheet = "oracle";
  let createdSheets = 0;
  for (const operation of entry.operations ?? []) {
    if (operation.op === "create-sheet" && isNonemptyString(operation.name)) {
      if (createdSheets === 0) {
        patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
      } else {
        const id = `oracle-${createdSheets + 1}`;
        patches.push({
          op: "addSheet",
          sheet: {
            id,
            name: operation.name,
            order: createdSheets,
            rowCount: 256,
            columns: fixtureWorkbook().sheets[0]!.columns,
            cells: [],
          },
        });
        activeSheet = id;
      }
      createdSheets += 1;
    } else if (operation.op === "set" && isNonemptyString(operation.cell)) {
      patches.push({
        op: "set",
        addr: { sheet: activeSheet, ...a1(operation.cell) },
        value: { kind: "literal", value: operation.value as CellScalar } satisfies CellValue,
      });
      observedCells.push({ sheet: activeSheet, cell: operation.cell });
    } else if (operation.op === "rename-sheet" && isNonemptyString(operation.name)) {
      patches.push({ op: "renameSheet", sheet: activeSheet, name: operation.name });
    } else if (
      operation.op === "set-visibility" &&
      (operation.visibility === "visible" ||
        operation.visibility === "hidden" ||
        operation.visibility === "veryHidden")
    ) {
      patches.push({
        op: "setSheetVisibility",
        sheet: activeSheet,
        visibility: operation.visibility,
      });
    } else {
      throw new Error(`${entry.id}: unsupported workbook operation ${String(operation.op)}`);
    }
  }
  const outcome = store.applyTransaction({ patches });
  if (outcome.status !== "applied") {
    throw new Error(`${entry.id}: workbook operations rejected: ${canonicalJson(outcome)}`);
  }
  const workbook = store.getWorkbook();
  const active = workbook.sheets.find((sheet) => sheet.id === activeSheet);
  return {
    type: "workbook",
    value: {
      activeSheet: active?.name,
      sheetCount: workbook.sheets.length,
      sheets: workbook.sheets.map((sheet) => ({
        name: sheet.name,
        visibility: sheet.visibility ?? "visible",
        cells: Object.fromEntries(
          observedCells
            .filter((cell) => cell.sheet === sheet.id)
            .map((cell) => [
              cell.cell,
              store.getCell({ sheet: sheet.id, ...a1(cell.cell) }).resolved,
            ]),
        ),
      })),
    },
  };
}

/** Evaluate the case's formula over its inputs and classify the anchor or spilled values. */
function runFormulaCase(
  entry: ConformanceCase,
  store: SheetwriteStore,
  formatNumber: typeof formatNumberType,
): ConformanceResult {
  const patches: DocumentOp[] = entry.calculation
    ? [{ op: "setCalculation", calculation: { ...entry.calculation } }]
    : [];
  for (const input of entry.inputs ?? []) {
    patches.push({
      op: "set",
      addr: { sheet: "oracle", ...a1(input.cell) },
      value: { kind: "literal", value: input.value },
    });
  }
  patches.push({
    op: "set",
    addr: { sheet: "oracle", ...a1(entry.target!) },
    value: { kind: "formula", src: entry.formula! },
  });
  const outcome = store.applyTransaction({ patches });
  if (outcome.status !== "applied") {
    throw new Error(`${entry.id}: formula setup rejected: ${canonicalJson(outcome)}`);
  }
  const target = a1(entry.target!);
  const anchor = classify(
    store.getCell({ sheet: "oracle", ...target }).resolved,
    entry.numberFormat,
    formatNumber,
  );
  if (entry.expected.type !== "array") return { ...anchor, formula: entry.formula };
  const rows = entry.expected.rows!;
  const columns = entry.expected.columns!;
  const values: unknown[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: unknown[] = [];
    for (let col = 0; col < columns; col++) {
      line.push(
        store.getCell({ sheet: "oracle", row: target.row + row, col: target.col + col }).resolved,
      );
    }
    values.push(line);
  }
  return { type: "array", value: values, rows, columns, formula: entry.formula };
}
