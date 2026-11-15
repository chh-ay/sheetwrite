import { unknownSheetError } from "../errors.js";
import type { SheetId } from "../types/coordinates.js";
import type { Sheet, Workbook } from "../types/document.js";

/**
 * The workbook's sheets and their engine handles. The store parts share one
 * registry, so a lookup of a sheet the workbook lacks fails the same way in
 * each of them.
 *
 * The registry indexes the workbook's sheets by ID. Sheets enter and leave
 * the workbook only through {@link insertSheet} and {@link removeSheetAt},
 * which keep the index in step with `workbook.sheets`.
 */
export class SheetRegistry {
  /** Engine handle of each live sheet. */
  readonly handles = new Map<SheetId, number>();
  private readonly byId = new Map<SheetId, Sheet>();

  constructor(readonly workbook: Workbook) {
    for (const sheet of workbook.sheets) this.byId.set(sheet.id, sheet);
  }

  /** Engine handle of `sheet`; an unknown sheet throws `unknownSheetError`. */
  handleOf(sheet: SheetId): number {
    const handle = this.handles.get(sheet);
    if (handle === undefined) throw unknownSheetError(sheet);

    return handle;
  }

  /** Metadata of `sheet`, or undefined when the workbook has no such sheet. */
  find(sheet: SheetId): Sheet | undefined {
    return this.byId.get(sheet);
  }

  /** Metadata of `sheet`; an unknown sheet throws `unknownSheetError`. */
  sheetMeta(sheet: SheetId): Sheet {
    const meta = this.byId.get(sheet);
    if (!meta) throw unknownSheetError(sheet);

    return meta;
  }

  /** Put `sheet` at position `order` of the workbook's sheets. */
  insertSheet(sheet: Sheet, order: number): void {
    this.workbook.sheets.splice(order, 0, sheet);
    this.byId.set(sheet.id, sheet);
  }

  /** Remove the sheet at position `index` of the workbook's sheets. */
  removeSheetAt(index: number): void {
    const [removed] = this.workbook.sheets.splice(index, 1);
    if (removed) this.byId.delete(removed.id);
  }
}
