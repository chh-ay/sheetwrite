import type { XlsxWorkbookBackend } from "@sheetwrite/core";

import { admitPreserved, preparePreserved } from "./preservation.js";
import { readWorkbook } from "./reader.js";
import { createCodecContext, xlsxFailure } from "./resources.js";
import { streamWorkbook, writeWorkbook } from "./writer.js";

/** Deterministic optional OOXML workbook backend implemented by Sheetwrite. */
export const sheetwriteWorkbookBackend: XlsxWorkbookBackend = {
  name: "sheetwrite-ooxml",
  verifySource(snapshot) {
    return admitPreserved(snapshot, createCodecContext("import"));
  },
  async toXlsxWorkbook(snapshot, options, exportContext) {
    try {
      const context = createCodecContext("export", options);
      return writeWorkbook(snapshot, context, (validated) =>
        preparePreserved(validated, context, exportContext?.sourceTracked === true),
      );
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml");
    }
  },
  async *toXlsxWorkbookStream(snapshot, options, exportContext) {
    try {
      const context = createCodecContext("export", options);
      yield* streamWorkbook(snapshot, context, (validated) =>
        preparePreserved(validated, context, exportContext?.sourceTracked === true),
      );
    } catch (error) {
      throw xlsxFailure(error, "export", "sheetwrite-ooxml");
    }
  },
  async fromXlsxWorkbookFile(file, options) {
    try {
      return await readWorkbook(file, createCodecContext("import", options));
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml");
    }
  },
  async fromXlsxWorkbook(data, options) {
    try {
      return await readWorkbook(data, createCodecContext("import", options));
    } catch (error) {
      throw xlsxFailure(error, "import", "sheetwrite-ooxml");
    }
  },
};
