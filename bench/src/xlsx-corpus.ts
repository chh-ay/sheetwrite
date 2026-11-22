import type { CellStyle, SheetSnapshot, SnapshotCell, WorkbookSnapshot } from "@sheetwrite/core";

export type XlsxCorpusMode = "smoke" | "full";
export type XlsxCorpusScenario = "scalar" | "rich" | "shared-style" | "sparse";

export interface XlsxCorpus {
  readonly mode: XlsxCorpusMode;
  readonly scenarios: Readonly<Record<XlsxCorpusScenario, WorkbookSnapshot>>;
  readonly combined: WorkbookSnapshot;
}

const SHARED_VALUES = [
  "pending",
  "approved",
  "rejected",
  "in review",
  "needs follow-up",
  "archived",
  "unassigned",
  "complete",
] as const;

const STYLES: readonly CellStyle[] = [
  { bold: true, color: "#112233", backgroundColor: "#DDEEFF", align: "center" },
  { italic: true, color: "#773311", backgroundColor: "#FFF2CC", wrap: true },
  {
    color: "#1F4E78",
    align: "right",
    border: { bottom: { color: "#5B9BD5", width: 1, style: "solid" } },
  },
  {
    bold: true,
    color: "#FFFFFF",
    backgroundColor: "#548235",
    align: "left",
    border: { all: { color: "#385723", width: 2, style: "dashed" } },
  },
] as const;

function columns(count: number, type: "text" | "number" = "text") {
  return Array.from({ length: count }, (_, col) => ({
    key: `c${col}`,
    header: `Column ${col + 1}`,
    width: 80 + (col % 4) * 12,
    type,
  }));
}

function workbook(id: string, sheet: SheetSnapshot): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: `xlsx-benchmark-${id}`,
    version: 1,
    workbook: { activeSheet: sheet.id },
    sheets: [sheet],
  };
}

function scalar_sheet(rows: number): SheetSnapshot {
  const cells = new Array<SnapshotCell>(rows * 8);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    cells[index++] = { rowOffset: row, colOffset: 0, value: { kind: "literal", value: row } };
    cells[index++] = {
      rowOffset: row,
      colOffset: 1,
      value: { kind: "literal", value: row * 1.25 - 400 },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 2,
      value: { kind: "literal", value: row % 2 === 0 },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 3,
      value: { kind: "literal", value: `row-${row.toString().padStart(6, "0")}` },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 4,
      value: { kind: "literal", value: SHARED_VALUES[row % SHARED_VALUES.length]! },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 5,
      value: { kind: "literal", value: row % 11 === 0 ? null : row + 45_000 },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 6,
      value: { kind: "literal", value: `group-${row % 97}` },
    };
    cells[index++] = {
      rowOffset: row,
      colOffset: 7,
      value: { kind: "literal", value: (row % 10_000) / 100 },
    };
  }
  return {
    id: "scalar",
    name: "Scalar",
    order: 0,
    rowCount: rows,
    columns: columns(8),
    frozenRows: 1,
    cells: [{ startRow: 0, startCol: 0, rowCount: rows, colCount: 8, cells }],
  };
}

function rich_sheet(rows: number): SheetSnapshot {
  const cells = new Array<SnapshotCell>(rows * 8);
  const notes: NonNullable<SheetSnapshot["notes"]> = [];
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 8; col++) {
      const styled = (row + col) % 3 === 0;
      cells[index++] = {
        rowOffset: row,
        colOffset: col,
        value:
          col === 7
            ? { kind: "formula", src: `=A${row + 1}+B${row + 1}` }
            : {
                kind: "literal",
                value: col % 2 === 0 ? row * (col + 1) : `rich-${row % 251}-${col}`,
              },
        ...(styled ? { style: STYLES[(row + col) % STYLES.length] } : {}),
      };
    }
    if (row % 250 === 0) {
      notes.push({ addr: { sheet: "rich", row, col: 1 }, text: `Deterministic note ${row}` });
    }
  }
  return {
    id: "rich",
    name: "Rich",
    order: 0,
    rowCount: rows,
    columns: columns(8),
    frozenRows: 1,
    frozenCols: 1,
    rowMeta: Array.from({ length: Math.ceil(rows / 500) }, (_, index) => [
      index * 500,
      { height: 22 + (index % 3), hidden: index % 7 === 6 },
    ]),
    merges: Array.from({ length: Math.floor(rows / 500) }, (_, index) => ({
      r0: index * 500 + 10,
      c0: 2,
      r1: index * 500 + 10,
      c1: 3,
    })),
    notes,
    cells: [{ startRow: 0, startCol: 0, rowCount: rows, colCount: 8, cells }],
  };
}

function shared_style_sheet(rows: number): SheetSnapshot {
  const cells = new Array<SnapshotCell>(rows * 8);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 8; col++) {
      cells[index++] = {
        rowOffset: row,
        colOffset: col,
        value: { kind: "literal", value: SHARED_VALUES[(row + col) % SHARED_VALUES.length]! },
        style: STYLES[(row * 3 + col) % STYLES.length],
      };
    }
  }
  return {
    id: "shared-style",
    name: "Shared style",
    order: 0,
    rowCount: rows,
    columns: columns(8),
    cells: [{ startRow: 0, startCol: 0, rowCount: rows, colCount: 8, cells }],
  };
}

function sparse_sheet(cell_count: number): SheetSnapshot {
  const cells = new Array<SnapshotCell>(cell_count);
  for (let index = 0; index < cell_count; index++) {
    const row = Math.floor((index * 999_983) / Math.max(1, cell_count - 1));
    const col = (index * 29) % 4;
    cells[index] = {
      rowOffset: row,
      colOffset: col,
      value: { kind: "literal", value: index % 3 === 0 ? `sparse-${index}` : index },
      ...(index % 7 === 0 ? { style: STYLES[index % STYLES.length] } : {}),
    };
  }
  return {
    id: "sparse",
    name: "Sparse",
    order: 0,
    rowCount: 1_000_000,
    columns: columns(4),
    cells: [{ startRow: 0, startCol: 0, rowCount: 1_000_000, colCount: 4, cells }],
  };
}

function ordered_sheet(sheet: SheetSnapshot, order: number): SheetSnapshot {
  return { ...sheet, order };
}

export function createXlsxCorpus(mode: XlsxCorpusMode): XlsxCorpus {
  const scalar_rows = mode === "smoke" ? 250 : 10_000;
  const rich_rows = mode === "smoke" ? 125 : 5_000;
  const shared_rows = mode === "smoke" ? 250 : 10_000;
  const sparse_cells = mode === "smoke" ? 100 : 2_000;
  const scalar = workbook("scalar", scalar_sheet(scalar_rows));
  const rich = workbook("rich", rich_sheet(rich_rows));
  const shared_style = workbook("shared-style", shared_style_sheet(shared_rows));
  const sparse = workbook("sparse", sparse_sheet(sparse_cells));
  const sheets = [
    ordered_sheet(scalar.sheets[0]!, 0),
    ordered_sheet(rich.sheets[0]!, 1),
    ordered_sheet(shared_style.sheets[0]!, 2),
    ordered_sheet(sparse.sheets[0]!, 3),
  ];
  return {
    mode,
    scenarios: { scalar, rich, "shared-style": shared_style, sparse },
    combined: {
      schemaVersion: 1,
      documentId: `xlsx-benchmark-combined-${mode}`,
      version: 1,
      workbook: { activeSheet: sheets[0]!.id },
      sheets,
    },
  };
}
