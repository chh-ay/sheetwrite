import type {
  CellHyperlink,
  Column,
  ConditionalFormatRule,
  DataValidationCondition,
  DataValidationRule,
  MergeRange,
  SheetSnapshot,
  SnapshotCell,
  WorkbookTable,
  WorkbookTableXmlElement,
} from "@sheetwrite/core";

import { type OpcRelationship } from "./opc.js";
import { type SharedFormulaGroup } from "./shared-formula.js";

/** Columns' style records and numeric literals, gathered as rows stream past. */
export interface ColumnCells {
  readonly styleIndices: Set<number>;
  hasNumericValue: boolean;
}

const INITIAL_STYLE_INDEX_CAPACITY = 1_024;
const STYLE_INDEX_GROWTH_FACTOR = 2;

/**
 * Style record index of each parsed cell, in cell order. The cell's own style
 * copy waits for its column's default format, which needs every row; four
 * bytes per cell keep that wait far below a second record per cell.
 */
export class CellStyleIndices {
  #indices = new Uint32Array(INITIAL_STYLE_INDEX_CAPACITY);
  #length = 0;

  clear(): void {
    this.#indices = new Uint32Array(INITIAL_STYLE_INDEX_CAPACITY);
    this.#length = 0;
  }

  push(styleIndex: number): void {
    if (this.#length === this.#indices.length) {
      const grown = new Uint32Array(this.#indices.length * STYLE_INDEX_GROWTH_FACTOR);
      grown.set(this.#indices);
      this.#indices = grown;
    }
    this.#indices[this.#length] = styleIndex;
    this.#length += 1;
  }

  get length(): number {
    return this.#length;
  }

  /** A recorded style index; never substitute a different style for a missing record. */
  at(cellIndex: number): number {
    const styleIndex = this.#indices[cellIndex];
    if (styleIndex === undefined || cellIndex >= this.#length) {
      throw new RangeError(`Sheetwrite: XLSX cell style record ${cellIndex} is out of range`);
    }
    return styleIndex;
  }
}

export interface ParsedValidation {
  readonly range: Omit<DataValidationRule["range"], "sheet">;
  readonly condition: DataValidationCondition;
  readonly policy: DataValidationRule["policy"];
  readonly allowBlank?: boolean;
  readonly helpText?: string;
}

export interface ParsedHyperlink {
  readonly range: Omit<CellHyperlink["range"], "sheet">;
  readonly target:
    | { readonly kind: "external"; readonly url: string }
    | {
        readonly kind: "internal";
        readonly sheetName: string;
        readonly range: Omit<CellHyperlink["range"], "sheet">;
      };
  readonly display?: string;
}

export interface ParsedSheet {
  readonly name: string;
  readonly state: string | undefined;
  readonly part: string;
  /**
   * Output cells, built while rows stream so no second per-cell record is
   * resident; offsets are sheet coordinates and styles are attached later.
   */
  readonly cells: SnapshotCell[];
  readonly cellStyles: CellStyleIndices;
  readonly columnCells: ReadonlyMap<number, ColumnCells>;
  /** Shared formulas, expanded by the engine once every sheet is read. */
  readonly sharedFormulas: readonly SharedFormulaGroup[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly conditionalFormats: ConditionalFormatRule[];
  /** The worksheet `sortState`, kept unapplied for export. */
  readonly sortState?: WorkbookTableXmlElement;
  readonly columns: Map<number, Partial<Column>>;
  readonly rowMeta: NonNullable<SheetSnapshot["rowMeta"]>;
  readonly merges: MergeRange[];
  readonly frozenRows?: number;
  readonly frozenCols?: number;
  readonly rowGroups: NonNullable<SheetSnapshot["rowGroups"]>;
  readonly validations: ParsedValidation[];
  readonly notes: { row: number; col: number; text: string }[];
  readonly hyperlinks: ParsedHyperlink[];
  readonly tables: (Omit<WorkbookTable, "range"> & {
    readonly range: Omit<WorkbookTable["range"], "sheet">;
  })[];
  readonly hasRowOutlines: boolean;
  readonly hasUnsupportedValidation: boolean;
  readonly hasConditionalFormatting: boolean;
  readonly hasProtection: boolean;
  readonly hasAutoFilter: boolean;
  readonly hasValidationCollection: boolean;
  readonly hasComments: boolean;
  readonly hasHyperlinks: boolean;
  readonly hasConditionalFormatExtensions: boolean;
}

export interface WorkbookSheetReference {
  readonly name: string;
  readonly state: string | undefined;
  readonly relationship: OpcRelationship;
}

export interface ReaderResourceUsage {
  cells: number;
  merges: number;
}
