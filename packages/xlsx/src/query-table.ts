import type { WorkbookTable } from "@sheetwrite/core";

import { escapeXml } from "./xml.js";

// The writer emits queryTable parts for every table binding, so these stay
// outside the lazily loaded Power Query module.
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export const QUERY_TABLE_REL = `${OFFICE_REL}/queryTable`;
export const QUERY_TABLE_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml";

const utf8 = new TextEncoder();

/** Binding of one output table to its connection, for the writer's table part. */
export interface QueryTableBinding {
  readonly connectionId: number;
}

/** A queryTable part that maps each table column to the query's result column. */
export function queryTableXml(
  table: WorkbookTable,
  number: number,
  binding: QueryTableBinding,
): Uint8Array {
  const fields = table.columns
    .map(
      (column, index) =>
        `<queryTableField id="${index + 1}" name="${escapeXml(column.name)}" tableColumnId="${index + 1}"/>`,
    )
    .join("");

  return utf8.encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><queryTable xmlns="${MAIN_NS}" name="${escapeXml(`ExternalData_${number}`)}" connectionId="${binding.connectionId}"><queryTableRefresh nextId="${table.columns.length + 1}"><queryTableFields count="${table.columns.length}">${fields}</queryTableFields></queryTableRefresh></queryTable>`,
  );
}
