// The AutoFilter's header dropdown, loaded on first use: what it lists and
// does. The commands of Data › Filter are in `autofilter-commands.ts`.

import { colToA1 } from "./a1.js";
import { AutoFilterMenu, type AutoFilterMenuRequest } from "./autofilter-menu.js";
import { parseCellInput } from "./cell-input.js";
import { formatNumber } from "./number-format.js";
import { autoFilterBody } from "./store/autofilter.js";
import type { StoreDataEngine } from "./store/data-engine.js";
import { storeEngine } from "./store/engine-registry.js";
import type { CellScalar, Column } from "./types/cell.js";
import type { Sheet } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import type { Theme } from "./types/render.js";

/** What the dropdown needs from the grid beyond its public methods. */
export interface AutoFilterHost {
  readonly grid: Grid;
  /** The grid's element: the dropdown's parent, and where focus returns. */
  readonly host: HTMLElement;
  readonly theme: Theme;
  readonly sheet: () => Sheet;
  /** Sheet row `row`, column `col` in client coordinates, or `null` when it is not in view. */
  readonly anchor: (
    row: number,
    col: number,
  ) => { readonly left: number; readonly top: number; readonly bottom: number } | null;
  /** Run `dispose` when the grid is destroyed. */
  readonly adopt: (dispose: () => void) => void;
}

/** Most values a dropdown lists, as Excel's list shows at most 10,000. */
const AUTO_FILTER_VALUE_LIMIT = 10_000;

/** Date codes: a year, a day or month next to a separator, or a month name. */
const DATE_FORMAT = /y{2}|d{1,2}[/.-]|[/.-]d{1,2}|m{3}/i;

/** Each grid's dropdown, built on its first open. */
const menus = new WeakMap<AutoFilterHost, AutoFilterMenu>();

/** Open the dropdown of `col`'s header cell, as its button or Alt+Down does. */
export function openAutoFilterMenu(host: AutoFilterHost, col: number): void {
  const request = autoFilterRequest(host, col);
  if (!request) return;
  let menu = menus.get(host);
  if (!menu) {
    const built = new AutoFilterMenu(host.host, host.theme);
    menus.set(host, built);
    host.adopt(() => {
      built.destroy();
      menus.delete(host);
    });
    menu = built;
  }
  menu.open(request);
}

/**
 * Whether a column's dropdown offers Number, Text or Date Filters. As in
 * Excel, the kind of most listed values wins: a number in a date format is a
 * date. A date column is dates; a column with no values goes by its type.
 */
function autoFilterColumnKind(
  column: Column | undefined,
  values: readonly CellScalar[],
  formats: readonly (string | undefined)[],
): "number" | "text" | "date" {
  if (column?.type === "date") return "date";
  let dates = 0;
  let numbers = 0;
  let texts = 0;
  for (const [index, value] of values.entries()) {
    if (typeof value === "number") {
      if (DATE_FORMAT.test(formats[index] ?? column?.numberFormat ?? "")) dates++;
      else numbers++;
    } else if (value !== null && value !== "") {
      texts++;
    }
  }
  if (dates + numbers + texts === 0) {
    if (DATE_FORMAT.test(column?.numberFormat ?? "")) return "date";
    return column?.type === "number" || column?.type === "currency" ? "number" : "text";
  }
  if (dates >= numbers && dates >= texts) return "date";
  return numbers >= texts ? "number" : "text";
}

/** What the dropdown of `col` shows and does; `null` without an AutoFilter there. */
function autoFilterRequest(host: AutoFilterHost, col: number): AutoFilterMenuRequest | null {
  const { grid } = host;
  const sheet = host.sheet();
  const range = sheet.autoFilter?.range;
  const engine = storeEngine(grid.store);
  if (!range || !engine || col < range.start.col || col > range.end.col) return null;
  const anchor = host.anchor(range.start.row, col);
  if (!anchor) return null;

  const column = sheet.columns[col];
  const { values, formats, kept } = autoFilterValues(engine, sheet, col, AUTO_FILTER_VALUE_LIMIT);
  const kind = autoFilterColumnKind(column, values, formats);
  // Each value shows as its first cell shows it, else in the column's format.
  // Typed numbers and dates take the format of the first listed date.
  const formatOf = new Map<CellScalar, string | undefined>();
  for (const [index, value] of values.entries()) formatOf.set(value, formats[index]);
  const typedFormat =
    (kind === "date" ? formats.find((code) => DATE_FORMAT.test(code ?? "")) : undefined) ??
    column?.numberFormat;
  const format = (value: CellScalar): string =>
    typeof value === "number"
      ? formatNumber(value, formatOf.get(value) ?? typedFormat, column?.numberLocale)
      : typeof value === "boolean"
        ? value
          ? "TRUE"
          : "FALSE"
        : (value ?? "");
  const headerValue = grid.store.getCell({ sheet: sheet.id, row: range.start.row, col }).resolved;
  return {
    anchor,
    header:
      headerValue === null || headerValue === "" ? `Column ${colToA1(col)}` : format(headerValue),
    kind,
    values,
    kept,
    filter: grid.getColumnFilters().get(col),
    format,
    parse: (text) => {
      const value = parseCellInput(text, kind === "date" ? "date" : "number");
      return value.kind === "literal" && typeof value.value === "number" ? value.value : text;
    },
    // The header cell is selected, so this is off only while the grid is read-only.
    canSort: !grid.getCommandState("sortAsc").disabled,
    sort: (ascending) => {
      const current = host.sheet().autoFilter?.range;
      if (current) grid.sortRange(current, [{ col, ascending }], { hasHeader: true });
    },
    apply: (filter) => grid.setColumnFilter(col, filter),
    closed: () => host.host.focus({ preventScroll: true }),
  };
}

/**
 * What the dropdown of `col` lists: the distinct values of the AutoFilter's
 * rows below its header that the other columns' filters keep, as Excel lists
 * them, with the number format of each one's first cell; and of those, the
 * values the column's own filter keeps (`null` when it has none, so every
 * listed value is kept).
 */
export function autoFilterValues(
  engine: StoreDataEngine,
  sheet: Sheet,
  col: number,
  limit: number,
): {
  values: CellScalar[];
  formats: (string | undefined)[];
  kept: CellScalar[] | null;
} {
  if (!sheet.autoFilter) return { values: [], formats: [], kept: null };
  const body = autoFilterBody(sheet.autoFilter);
  const rows = { start: body.start, end: body.end + 1 };
  const filters = new Map(sheet.filters ?? []);
  const own = filters.get(col);
  filters.delete(col);
  const { values, formats } = engine.distinctValuesWithFormats(
    sheet.id,
    col,
    limit,
    rows,
    filters.size > 0 ? engine.filteredRows(sheet.id, filters) : undefined,
  );
  if (!own) return { values, formats, kept: null };

  // The rows every filter keeps, the column's own included.
  filters.set(col, own);
  const kept = engine.distinctValues(
    sheet.id,
    col,
    limit,
    rows,
    engine.filteredRows(sheet.id, filters),
  );
  return { values, formats, kept };
}
