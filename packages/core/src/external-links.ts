import { externalSheetText, rewriteExternalSheets } from "./external-link-formula.js";
import type { CellAddress } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";
import type { ExternalLink, ExternalLinkSheet } from "./types/external-link.js";
import type { Grid } from "./types/grid.js";

export {
  type ExternalSheetName,
  externalSheetText,
  formulaCallsExternalData,
  formulaContainsExternalReference,
  rewriteExternalSheets,
} from "./external-link-formula.js";

/** What a resolver is asked for: one linked workbook and the sheets that formulas name. */
export interface ExternalLinkRequest {
  /** The file name formulas use, such as `Budget.xlsx`. */
  readonly book: string;
  /** Where the workbook is, as saved: a relative path, a file path or a URL. */
  readonly target: string;
  /** The sheets the workbook link holds now. */
  readonly sheets: readonly string[];
}

/**
 * Gives the current values of a linked workbook, as sheets with their cells,
 * or `null` when the workbook is not available. A rejected promise counts as
 * a failed update. The values replace all saved values of that link.
 */
export type ExternalLinkResolver = (
  request: ExternalLinkRequest,
) => Promise<ExternalLinkSheet[] | null>;

/** The result of updating one link. */
export interface ExternalLinkUpdate {
  readonly book: string;
  /**
   * `updated`: the link has the new values. `unavailable`: the resolver gave
   * `null`, and the link keeps its saved values. `failed`: the resolver
   * failed, or the document rejected the values; the link keeps its values.
   */
  readonly status: "updated" | "unavailable" | "failed";
  readonly error?: unknown;
}

function sameBook(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** The workbook's links; an absent list is empty. */
export function listExternalLinks(grid: Grid): readonly ExternalLink[] {
  return grid.store.getWorkbook().externalLinks ?? [];
}

/** Every formula cell of the workbook that names one of `books`, with its source. */
function formulasNaming(
  grid: Grid,
  books: readonly string[],
): { addr: CellAddress; source: string }[] {
  const snapshot = grid.store.exportSnapshot?.();
  const found: { addr: CellAddress; source: string }[] = [];
  for (const sheet of snapshot?.sheets ?? []) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind !== "formula") continue;
        let names = false;
        rewriteExternalSheets(cell.value.src, ({ book }) => {
          names ||= books.some((candidate) => sameBook(book, candidate));
          return "";
        });
        if (!names) continue;
        found.push({
          addr: {
            sheet: sheet.id,
            row: block.startRow + cell.rowOffset,
            col: block.startCol + cell.colOffset,
          },
          source: cell.value.src,
        });
      }
    }
  }
  return found;
}

/**
 * Ask `resolve` for the current values of the links named in `books` (all
 * links when omitted), then save the new values in one undoable change that
 * recalculates the formulas that read them, as Excel's "Update Values" does.
 * Links whose resolver gives `null` or fails keep their saved values.
 */
export async function updateExternalLinks(
  grid: Grid,
  resolve: ExternalLinkResolver,
  books?: readonly string[],
): Promise<ExternalLinkUpdate[]> {
  const selected = listExternalLinks(grid).filter(
    (link) => books === undefined || books.some((book) => sameBook(book, link.book)),
  );
  const results: ExternalLinkUpdate[] = [];
  const values = new Map<string, ExternalLinkSheet[]>();
  for (const link of selected) {
    try {
      const sheets = await resolve({
        book: link.book,
        target: link.target,
        sheets: link.sheets.map((sheet) => sheet.name),
      });
      if (sheets === null) {
        results.push({ book: link.book, status: "unavailable" });
      } else {
        values.set(link.book.toLowerCase(), sheets);
        results.push({ book: link.book, status: "updated" });
      }
    } catch (error) {
      results.push({ book: link.book, status: "failed", error });
    }
  }
  if (values.size === 0) return results;

  // The links can change while the resolver runs, so the update applies to
  // the current list.
  const links = listExternalLinks(grid).map((link) => {
    const sheets = values.get(link.book.toLowerCase());
    return sheets ? { ...link, sheets } : link;
  });
  const outcome = grid.applyTransaction({ patches: [{ op: "setExternalLinks", links }] });
  if (outcome.status === "applied") return results;

  return results.map((result) =>
    result.status === "updated" ? { ...result, status: "failed", error: outcome } : result,
  );
}

/**
 * Point the link of `book` at another workbook, as Excel's "Change Source"
 * does: formulas that name `book` name `next.book`, and the link keeps its
 * saved values until the next update. One undoable change. Returns whether
 * the document applied it.
 */
export function changeExternalLinkSource(
  grid: Grid,
  book: string,
  next: { readonly book: string; readonly target: string },
): boolean {
  const links = listExternalLinks(grid);
  if (!links.some((link) => sameBook(link.book, book))) return false;

  const patches: DocumentOp[] = formulasNaming(grid, [book]).map(({ addr, source }) => ({
    op: "set",
    addr,
    value: {
      kind: "formula",
      src:
        rewriteExternalSheets(source, (name) =>
          sameBook(name.book, book) ? externalSheetText(next.book, name.sheet) : name.text,
        ) ?? source,
    },
  }));
  patches.push({
    op: "setExternalLinks",
    links: links
      .filter((link) => sameBook(link.book, book) || !sameBook(link.book, next.book))
      .map((link) => (sameBook(link.book, book) ? { ...link, ...next } : link)),
  });
  return grid.applyTransaction({ patches }).status === "applied";
}

/**
 * Replace every formula that reads one of `books` with its current value and
 * remove those links, as Excel's "Break Link" does. An error value becomes its
 * text, such as `#N/A`. One undoable change. Returns whether the document
 * applied it.
 */
export function breakExternalLinks(grid: Grid, books: readonly string[]): boolean {
  const patches: DocumentOp[] = formulasNaming(grid, books).map(({ addr }) => ({
    op: "set",
    addr,
    value: { kind: "literal", value: grid.store.getCell(addr).resolved },
  }));
  patches.push({
    op: "setExternalLinks",
    links: listExternalLinks(grid).filter(
      (link) => !books.some((book) => sameBook(book, link.book)),
    ),
  });
  return grid.applyTransaction({ patches }).status === "applied";
}
