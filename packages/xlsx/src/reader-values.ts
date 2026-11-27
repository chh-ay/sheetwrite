import type { CellValue, MergeRange } from "@sheetwrite/core";

import { parseCellRect } from "./cell-reference.js";
import { isoDateSerial, MAIN_NAMESPACES } from "./format.js";
import { OpcPackage } from "./opc.js";
import {
  assertResource,
  boundedErrorText,
  emitWarning,
  type XlsxCodecContext,
} from "./resources.js";
import { type ParsedCellStyle } from "./styles.js";
import {
  assertXmlRoot,
  decodeXstring,
  parseXml,
  type XmlElement,
  xmlChild,
  xmlChildren,
  xmlLocalName,
  xmlRootMatches,
} from "./xml.js";
import { normalizePartName } from "./zip.js";

export function readerFailure(message: string): never {
  throw new TypeError(boundedErrorText(`Sheetwrite: invalid XLSX workbook: ${message}`));
}

export function displayText(element: XmlElement): string {
  if (xmlLocalName(element.name) === "t") return decodeXstring(element.text);
  let text = "";
  for (const child of element.children) {
    const local_name = xmlLocalName(child.name);
    if (local_name === "t") text += decodeXstring(child.text);
    else if (local_name === "r") {
      for (const run_text of xmlChildren(child, "t")) text += decodeXstring(run_text.text);
    }
  }
  return text;
}

export function parseUnsigned(value: string | undefined, description: string): number {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return readerFailure(`${description} is invalid`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) return readerFailure(`${description} is invalid`);
  return parsed;
}

export function parseRange(value: string): MergeRange {
  return parseCellRect(value) ?? readerFailure(`range ${value} is invalid`);
}

export function parseSharedStrings(
  packageFile: OpcPackage,
  part: string | undefined,
  context: XlsxCodecContext,
): string[] {
  if (!part) return [];
  const strings: string[] = [];
  let warned_rich_text = false;
  let warned_phonetic = false;
  const process_item = (item: XmlElement): void => {
    assertResource(context, "maxSharedStrings", strings.length + 1);
    const rich_runs = xmlChildren(item, "r");
    if (rich_runs.length > 0 && !warned_rich_text) {
      warned_rich_text = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Rich text formatting was flattened",
        part,
      });
    }
    if (!warned_phonetic && (xmlChildren(item, "rPh").length > 0 || xmlChild(item, "phoneticPr"))) {
      warned_phonetic = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed shared string",
        part,
      });
    }
    strings.push(displayText(item));
  };
  const name = normalizePartName(part);
  const root = parseXml(packageFile.read(name), name, context, {
    parent: "sst",
    parentIsRoot: true,
    shouldStream: (root_element) => xmlRootMatches(root_element, "sst", MAIN_NAMESPACES),
    // Only `si` children hold strings; other children are skipped.
    child: (item) => {
      if (xmlLocalName(item.name) === "si") process_item(item);
    },
  });
  assertXmlRoot(root, "sst", MAIN_NAMESPACES, part);
  return strings;
}

export function literalFromCell(
  cell: XmlElement,
  type: string | undefined,
  sharedStrings: readonly string[],
  style: ParsedCellStyle,
  context: XlsxCodecContext,
  sheet: string,
  address: string,
  date1904: boolean,
): CellValue | null {
  const value_text = xmlChild(cell, "v")?.text ?? "";
  if (type === "inlineStr") {
    const inline = xmlChild(cell, "is") ?? cell;
    if (xmlChild(inline, "r")) {
      emitWarning(context, {
        code: "rich-text",
        message: "Inline rich text formatting was flattened",
        sheet,
        cell: address,
      });
    }
    if (xmlChild(inline, "rPh") || xmlChild(inline, "phoneticPr")) {
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed inline string",
        sheet,
        cell: address,
      });
    }
    return { kind: "literal", value: displayText(inline) };
  }
  if (type === "s") {
    const index = parseUnsigned(value_text, `shared string index at ${address}`);
    const value = sharedStrings[index];
    if (value === undefined)
      return readerFailure(`shared string index ${index} at ${address} is out of range`);
    return { kind: "literal", value };
  }
  if (type === "str") return { kind: "literal", value: decodeXstring(value_text) };
  if (type === "b")
    return { kind: "literal", value: value_text === "1" || value_text.toLowerCase() === "true" };
  if (type === "d") {
    const serial =
      isoDateSerial(value_text) ?? readerFailure(`date value at ${address} is invalid`);
    return { kind: "literal", value: serial };
  }
  if (type === "e") {
    emitWarning(context, {
      code: "unsupported-cell-value",
      message: "Unbound Excel error was preserved as text",
      sheet,
      cell: address,
    });
    return { kind: "literal", value: value_text };
  }
  if (value_text === "") return style.style ? { kind: "literal", value: null } : null;
  const number = Number(value_text);
  if (!Number.isFinite(number)) return readerFailure(`numeric value at ${address} is invalid`);
  return { kind: "literal", value: style.date && date1904 ? number + 1462 : number };
}
