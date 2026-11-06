// Import order matters: each negative import binds the error directive above it.
import * as Core from "@sheetwrite/core";
import * as Adapter from "@sheetwrite/core/adapter";
import * as Shell from "@sheetwrite/core/shell";
import * as Worker from "@sheetwrite/core/worker";
import * as Xlsx from "@sheetwrite/xlsx";
import * as Charts from "@sheetwrite/charts";
import * as ReactAdapter from "@sheetwrite/react";
import * as SvelteAdapter from "@sheetwrite/svelte";
import * as VueAdapter from "@sheetwrite/vue";
import * as Wasm from "@sheetwrite/wasm";
import type {
  DataSource,
  DataSourceRequest,
  DocumentOp,
  SheetwriteAddon,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
} from "@sheetwrite/core";
import { fromXlsxTable, initSheetwrite, toXlsxTable } from "@sheetwrite/core";

// @ts-expect-error removed pre-release operation alias.
import type { Patch as RemovedPatch } from "@sheetwrite/core";
// @ts-expect-error removed positional datasource contract.
import type { LegacyDataSource as RemovedLegacyDataSource } from "@sheetwrite/core";
// @ts-expect-error removed ambiguous table export contract.
import type { XlsxBackend as RemovedXlsxBackend } from "@sheetwrite/core";
// @ts-expect-error removed ambiguous table import contract.
import type { XlsxImportBackend as RemovedXlsxImportBackend } from "@sheetwrite/core";
// @ts-expect-error use `toXlsxTable`.
import type { toXlsx as removedToXlsx } from "@sheetwrite/core";
// @ts-expect-error use `fromXlsxTable`.
import type { fromXlsx as removedFromXlsx } from "@sheetwrite/core";
// @ts-expect-error use `initSheetwrite({ addons })`.
import type { setXlsxBackend as removedSetXlsxBackend } from "@sheetwrite/core";
// @ts-expect-error use `initSheetwrite({ addons })`.
import type { setXlsxImportBackend as removedSetXlsxImportBackend } from "@sheetwrite/core";
// @ts-expect-error use `initSheetwrite({ addons })`.
import type { setXlsxTableExportBackend as removedSetXlsxTableExportBackend } from "@sheetwrite/core";
// @ts-expect-error use `chartsAddon()` from `@sheetwrite/charts`.
import type { setChartRendererFactory as removedSetChartRendererFactory } from "@sheetwrite/core";

export type RemovedExportsMustStayAbsent = [
  RemovedPatch,
  RemovedLegacyDataSource,
  RemovedXlsxBackend,
  RemovedXlsxImportBackend,
  typeof removedToXlsx,
  typeof removedFromXlsx,
  typeof removedSetXlsxBackend,
  typeof removedSetXlsxImportBackend,
  typeof removedSetXlsxTableExportBackend,
  typeof removedSetChartRendererFactory,
];

const publicEntries: readonly Record<string, unknown>[] = [
  Core,
  Adapter,
  Shell,
  Worker,
  Xlsx,
  Charts,
  ReactAdapter,
  SvelteAdapter,
  VueAdapter,
  Wasm,
];

if (publicEntries.some((entry) => Object.keys(entry).length === 0)) {
  throw new Error("A public package entry has no declarations");
}

const canonicalOperation: DocumentOp = {
  op: "set",
  addr: { sheet: "s1", row: 0, col: 0 },
  value: { kind: "literal", value: 1 },
};
const canonicalDatasource: DataSource = {
  capabilities: { protocol: 2, columns: "windowed" },
  async getRows(request: DataSourceRequest) {
    return { protocol: 2, start: request.start, columns: request.columns, rows: [] };
  },
};
const canonicalTableExporter: XlsxTableExportBackend = {
  name: "packed-consumer-export",
  async toXlsxTable() {
    return new Uint8Array();
  },
};
const canonicalTableImporter: XlsxTableImportBackend = {
  name: "packed-consumer-import",
  async fromXlsxTable() {
    return { rowCount: 0, columns: {} };
  },
};
const canonicalTableAddon: SheetwriteAddon = {
  name: "packed-consumer-table",
  setup(context) {
    context.xlsx({ tableExport: canonicalTableExporter, tableImport: canonicalTableImporter });
  },
};
void initSheetwrite({ addons: [Xlsx.xlsxAddon(), Charts.chartsAddon(), canonicalTableAddon] });
void canonicalOperation;
void canonicalDatasource;
void toXlsxTable;
void fromXlsxTable;
