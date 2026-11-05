import { unknownSheetError } from "../errors.js";
import type { SheetId } from "../types/coordinates.js";
import type { Sheet, Workbook } from "../types/document.js";

/**
 * The workbook's sheets and their engine handles. The store parts share one
 * registry, so a lookup of a sheet the workbook lacks fails the same way in
 * each of them.
 */
export class SheetRegistry {
  /** Engine handle of each live sheet. */
  readonly handles = new Map<SheetId, number>();

  constructor(readonly workbook: Workbook) {}

  /** Engine handle of `sheet`; an unknown sheet throws `unknownSheetError`. */
  handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw unknownSheetError(sheet);

    return handle;
  }

  /** Metadata of `sheet`; an unknown sheet throws `unknownSheetError`. */
  sheetMeta(sheet: SheetId): Sheet {
    const meta = this.workbook.sheets.find((candidate) => candidate.id === sheet);
    if (!meta) throw unknownSheetError(sheet);

    return meta;
  }
}
