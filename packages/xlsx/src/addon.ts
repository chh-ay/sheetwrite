import type {
  SheetwriteAddon,
  SheetwriteAddonContext,
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "@sheetwrite/core";

/** Loads the codec chunk. */
function importCodec() {
  return import("./codec.js");
}

type Codec = Awaited<ReturnType<typeof importCodec>>;

/**
 * Backends that load the codec on their first call. Once it loads, the
 * codec's own backends replace them, which also turns on the check of kept
 * parts when a store loads a snapshot.
 */
function lazyBackends(context: SheetwriteAddonContext): {
  workbook: XlsxWorkbookBackend;
  tableImport: XlsxTableImportBackend;
  tableExport: XlsxTableExportBackend;
} {
  let pending: Promise<Codec> | undefined;

  const codec = (): Promise<Codec> => {
    pending ??= importCodec().then((loaded) => {
      context.xlsx({
        workbook: loaded.sheetwriteWorkbookBackend,
        tableImport: loaded.sheetwriteTableImportBackend,
        tableExport: loaded.sheetwriteTableExportBackend,
      });
      return loaded;
    });
    return pending;
  };

  return {
    workbook: {
      name: "sheetwrite-ooxml",
      async toXlsxWorkbook(snapshot, options, exportContext) {
        const loaded = await codec();
        return loaded.sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot, options, exportContext);
      },
      async *toXlsxWorkbookStream(snapshot, options, exportContext) {
        const loaded = await codec();
        yield* loaded.sheetwriteWorkbookBackend.toXlsxWorkbookStream(
          snapshot,
          options,
          exportContext,
        );
      },
      async fromXlsxWorkbook(data, options) {
        const loaded = await codec();
        return loaded.sheetwriteWorkbookBackend.fromXlsxWorkbook(data, options);
      },
      async fromXlsxWorkbookFile(file, options) {
        const loaded = await codec();
        return loaded.sheetwriteWorkbookBackend.fromXlsxWorkbookFile(file, options);
      },
    },
    tableImport: {
      name: "sheetwrite-ooxml-table",
      async fromXlsxTable(data, options) {
        const loaded = await codec();
        return loaded.sheetwriteTableImportBackend.fromXlsxTable(data, options);
      },
    },
    tableExport: {
      name: "sheetwrite-ooxml-table",
      async toXlsxTable(workbook, store, options) {
        const loaded = await codec();
        return loaded.sheetwriteTableExportBackend.toXlsxTable(workbook, store, options);
      },
      async *toXlsxTableStream(workbook, store, options) {
        const loaded = await codec();
        yield* loaded.sheetwriteTableExportBackend.toXlsxTableStream(workbook, store, options);
      },
    },
  };
}

/**
 * The XLSX add-on. It installs the workbook and table XLSX backends that
 * core's `fromXlsx*` and `toXlsx*` functions and `grid.exportXlsx` use. The
 * codec loads on the first XLSX call, so installing the add-on at startup
 * adds no codec code to the first chunk.
 *
 * @example
 * ```ts
 * import { fromXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
 * import { xlsxAddon } from "@sheetwrite/xlsx";
 *
 * await initSheetwrite({ addons: [xlsxAddon()] });
 * async function open(file: File) {
 *   return fromXlsxWorkbook(await file.arrayBuffer());
 * }
 * ```
 * @see /docs/import-export/xlsx-export/
 */
export function xlsxAddon(): SheetwriteAddon {
  return {
    name: "xlsx",
    setup(context) {
      context.xlsx(lazyBackends(context));
    },
  };
}
