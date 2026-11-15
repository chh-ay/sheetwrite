import type { DataModel, SheetSnapshot, TableRelationship, WorkbookTable } from "@sheetwrite/core";

import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { decodeXstring, type XmlElement, xmlAttribute, xmlChild, xmlChildren } from "./xml.js";

/*
 * Excel's data model ([MS-XLSX] 2.1.6, 2.4.62, 2.6.128-2.6.132):
 * - `workbook.xml` holds `x15:dataModel` in the extension
 *   {FCE2AD5D-F65C-4FA6-A056-5C36A1767C68}: model tables (id, name,
 *   connection) and the active relationships, which name model tables and
 *   columns.
 * - A model table loaded from a worksheet table has a connection in
 *   `connections.xml` whose `x15:rangePr sourceName` is the worksheet table.
 * - The model itself is an [MS-XLDM] binary that Sheetwrite does not read.
 * Only relationships between two worksheet tables become Sheetwrite
 * relationships; others are reported.
 */

const DATA_MODEL_EXTENSION = "{FCE2AD5D-F65C-4FA6-A056-5C36A1767C68}";

/** The `x15:dataModel` element of a workbook root, if it has one. */
function dataModelElement(workbookRoot: XmlElement): XmlElement | undefined {
  const extensions = xmlChild(workbookRoot, "extLst");
  if (extensions === undefined) return undefined;
  for (const extension of xmlChildren(extensions, "ext")) {
    if (xmlAttribute(extension, "uri")?.toUpperCase() !== DATA_MODEL_EXTENSION) continue;
    const model = xmlChild(extension, "dataModel");
    if (model !== undefined) return model;
  }
  return undefined;
}

/** Whether the workbook root declares an Excel data model. */
export function hasExcelDataModel(workbookRoot: XmlElement): boolean {
  return dataModelElement(workbookRoot) !== undefined;
}

/** Worksheet table name of each connection that loads a range into the model, by connection name. */
function connectionSources(connections: XmlElement | undefined): Map<string, string> {
  const sources = new Map<string, string>();
  for (const connection of connections === undefined
    ? []
    : xmlChildren(connections, "connection")) {
    const name = xmlAttribute(connection, "name");
    const extensions = xmlChild(connection, "extLst");
    if (name === undefined || extensions === undefined) continue;
    for (const extension of xmlChildren(extensions, "ext")) {
      const range = xmlChild(xmlChild(extension, "connection") ?? extension, "rangePr");
      const source = range === undefined ? undefined : xmlAttribute(range, "sourceName");
      if (source !== undefined) sources.set(decodeXstring(name), decodeXstring(source));
    }
  }
  return sources;
}

/** Whether two tables are joined already, directly or through other relationships. */
function joined(parents: Map<string, string>, left: string, right: string): boolean {
  const root = (table: string): string => {
    let current = table;
    for (let parent = parents.get(current); parent !== undefined; parent = parents.get(current)) {
      current = parent;
    }
    return current;
  };
  const leftRoot = root(left);
  const rightRoot = root(right);
  if (leftRoot === rightRoot) return true;
  parents.set(leftRoot, rightRoot);
  return false;
}

/**
 * The relationships of Excel's data model whose two tables are worksheet
 * tables of `sheets`, by stable table and column IDs. Undefined when the
 * workbook has no model relationships.
 */
export function readExcelDataModel(
  workbookRoot: XmlElement,
  connections: XmlElement | undefined,
  sheets: readonly SheetSnapshot[],
  context: XlsxCodecContext,
): DataModel | undefined {
  const model = dataModelElement(workbookRoot);
  const listed = model === undefined ? undefined : xmlChild(model, "modelRelationships");
  if (model === undefined || listed === undefined) return undefined;

  const sources = connectionSources(connections);
  const worksheetTables = new Map<string, WorkbookTable>();
  for (const sheet of sheets) {
    for (const table of sheet.tables ?? []) worksheetTables.set(table.name.toUpperCase(), table);
  }

  // A model table names its worksheet table through its connection; without
  // one, the model table name is the worksheet table name.
  const modelTables = new Map<string, WorkbookTable>();
  for (const element of xmlChildren(xmlChild(model, "modelTables") ?? model, "modelTable")) {
    const name = xmlAttribute(element, "name");
    const connection = xmlAttribute(element, "connection");
    if (name === undefined) continue;
    const source = connection === undefined ? undefined : sources.get(decodeXstring(connection));
    const table = worksheetTables.get((source ?? decodeXstring(name)).toUpperCase());
    if (table !== undefined) modelTables.set(decodeXstring(name), table);
  }

  const relationships: TableRelationship[] = [];
  const parents = new Map<string, string>();
  for (const element of xmlChildren(listed, "modelRelationship")) {
    const names = ["fromTable", "fromColumn", "toTable", "toColumn"].map((key) => {
      const value = xmlAttribute(element, key);
      return value === undefined ? undefined : decodeXstring(value);
    });
    const [fromTable, fromColumn, toTable, toColumn] = names;
    const from = fromTable === undefined ? undefined : modelTables.get(fromTable);
    const to = toTable === undefined ? undefined : modelTables.get(toTable);
    const fromId = from?.columns.find((column) => column.name === fromColumn)?.id;
    const toId = to?.columns.find((column) => column.name === toColumn)?.id;
    const described = `${fromTable ?? "?"}[${fromColumn ?? "?"}] → ${toTable ?? "?"}[${toColumn ?? "?"}]`;
    if (from === undefined || to === undefined || fromId === undefined || toId === undefined) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Excel data model relationship ${described} was not imported because a table is not a worksheet table`,
      });
      continue;
    }
    if (from.id === to.id || joined(parents, from.id, to.id)) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Excel data model relationship ${described} was not imported because it would join two tables a second time`,
      });
      continue;
    }
    relationships.push({
      id: `excel-relationship-${relationships.length + 1}`,
      from: { table: from.id, column: fromId },
      to: { table: to.id, column: toId },
    });
  }
  return relationships.length > 0 ? { relationships } : undefined;
}
