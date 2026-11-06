import type { WorkbookSnapshot, XlsxWorkbookBackend } from "@sheetwrite/core";

import { admitPreserved, preparePreserved } from "./preservation.js";
import { readWorkbook } from "./reader.js";
import { createCodecContext, type XlsxCodecContext, xlsxFailure } from "./resources.js";
import { streamWorkbook, type WorkbookWriteHookResolver, writeWorkbook } from "./writer.js";

/**
 * Hook for retained parts plus, when the workbook has saved queries, the
 * Power Query parts. The Power Query module loads only for such workbooks, so
 * the XLSX chunk every import and export loads stays small.
 */
async function write_hook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  source_tracked: boolean,
): Promise<WorkbookWriteHookResolver> {
  const power_query = snapshot.workbook.queries?.length
    ? await import("./power-query.js")
    : undefined;

  return (validated) => {
    const preserved = preparePreserved(validated, context, source_tracked);
    return power_query ? power_query.withPowerQuery(preserved, validated, context) : preserved;
  };
}

/** Deterministic optional OOXML workbook backend implemented by Sheetwrite. */
export const sheetwriteWorkbookBackend: XlsxWorkbookBackend = {
  name: "sheetwrite-ooxml",
  verifySource(snapshot) {
    return admitPreserved(snapshot, createCodecContext("import"));
  },
  async toXlsxWorkbook(snapshot, options, export_context) {
    try {
      const context = createCodecContext("export", options);
      const hook = await write_hook(snapshot, context, export_context?.sourceTracked === true);
      return await writeWorkbook(snapshot, context, hook);
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml", options?.signal);
    }
  },
  async *toXlsxWorkbookStream(snapshot, options, export_context) {
    try {
      const context = createCodecContext("export", options);
      const hook = await write_hook(snapshot, context, export_context?.sourceTracked === true);
      yield* streamWorkbook(snapshot, context, hook);
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml", options?.signal);
    }
  },
  async fromXlsxWorkbookFile(file, options) {
    try {
      return await readWorkbook(file, createCodecContext("import", options));
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml", options?.signal);
    }
  },
  async fromXlsxWorkbook(data, options) {
    try {
      return await readWorkbook(data, createCodecContext("import", options));
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml", options?.signal);
    }
  },
};
