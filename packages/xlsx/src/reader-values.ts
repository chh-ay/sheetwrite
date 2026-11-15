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
    const localName = xmlLocalName(child.name);
    if (localName === "t") text += decodeXstring(child.text);
    else if (localName === "r") {
      for (const runText of xmlChildren(child, "t")) text += decodeXstring(runText.text);
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
  let warnedRichText = false;
  let warnedPhonetic = false;
  const processItem = (item: XmlElement): void => {
    assertResource(context, "maxSharedStrings", strings.length + 1);
    const richRuns = xmlChildren(item, "r");
    if (richRuns.length > 0 && !warnedRichText) {
      warnedRichText = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Rich text formatting was flattened",
        part,
      });
    }
    if (!warnedPhonetic && (xmlChildren(item, "rPh").length > 0 || xmlChild(item, "phoneticPr"))) {
      warnedPhonetic = true;
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
    shouldStream: (rootElement) => xmlRootMatches(rootElement, "sst", MAIN_NAMESPACES),
    // The tree path reads only `si` children; other children are skipped alike.
    child: (item) => {
      if (xmlLocalName(item.name) === "si") processItem(item);
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
  const valueText = xmlChild(cell, "v")?.text ?? "";
  if (type === "inlineStr") {
    const inline = xmlChild(cell, "is") ?? cell;
    if (xmlChildren(inline, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Inline rich text formatting was flattened",
        sheet,
        cell: address,
      });
    }
    if (xmlChildren(inline, "rPh").length > 0 || xmlChild(inline, "phoneticPr")) {
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
    const index = parseUnsigned(valueText, `shared string index at ${address}`);
    const value = sharedStrings[index];
    if (value === undefined)
      return readerFailure(`shared string index ${index} at ${address} is out of range`);
    return { kind: "literal", value };
  }
  if (type === "str") return { kind: "literal", value: decodeXstring(valueText) };
  if (type === "b")
    return { kind: "literal", value: valueText === "1" || valueText.toLowerCase() === "true" };
  if (type === "d") {
    const serial = isoDateSerial(valueText) ?? readerFailure(`date value at ${address} is invalid`);
    return { kind: "literal", value: serial };
  }
  if (type === "e") {
    emitWarning(context, {
      code: "unsupported-cell-value",
      message: "Unbound Excel error was preserved as text",
      sheet,
      cell: address,
    });
    return { kind: "literal", value: valueText };
  }
  if (valueText === "") return style.style ? { kind: "literal", value: null } : null;
  const number = Number(valueText);
  if (!Number.isFinite(number)) return readerFailure(`numeric value at ${address} is invalid`);
  return { kind: "literal", value: style.date && date1904 ? number + 1462 : number };
}
