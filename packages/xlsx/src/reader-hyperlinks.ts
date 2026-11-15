import type { CellHyperlink } from "@sheetwrite/core";
import {
  isSafeExternalHyperlink,
  MAX_HYPERLINK_DISPLAY_LENGTH,
  MAX_HYPERLINKS_PER_SHEET,
} from "@sheetwrite/core";

import { type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import type { ParsedHyperlink } from "./reader-types.js";
import { readerFailure, parseRange } from "./reader-values.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { decodeXstring, type XmlElement, xmlAttribute, xmlChildren } from "./xml.js";

function parseHyperlinkLocation(
  value: string,
  currentSheet: string,
): { sheetName: string; range: Omit<CellHyperlink["range"], "sheet"> } | null {
  const location = decodeXstring(value).replace(/^#/, "");
  const separator = location.lastIndexOf("!");
  let sheetName = currentSheet;
  let rangeText = location;
  if (separator >= 0) {
    const rawSheet = location.slice(0, separator);
    rangeText = location.slice(separator + 1);
    if (rawSheet.startsWith("'") && rawSheet.endsWith("'")) {
      sheetName = rawSheet.slice(1, -1).replaceAll("''", "'");
    } else {
      sheetName = rawSheet;
    }
  }
  if (!sheetName || !rangeText) return null;
  try {
    const parsed = parseRange(rangeText.replaceAll("$", ""));
    return {
      sheetName,
      range: {
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
    };
  } catch (error) {
    // An unreadable internal location makes only this hyperlink unusable.
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export function parseHyperlinks(
  collection: XmlElement | undefined,
  relationships: readonly OpcRelationship[],
  sheet: string,
  context: XlsxCodecContext,
): ParsedHyperlink[] {
  if (!collection) return [];
  const elements = xmlChildren(collection, "hyperlink");
  if (elements.length > MAX_HYPERLINKS_PER_SHEET) {
    emitWarning(context, {
      code: "hyperlink",
      message: `Excel hyperlink limit ${MAX_HYPERLINKS_PER_SHEET} was exceeded; later hyperlinks were dropped`,
      sheet,
    });
  }
  const result: ParsedHyperlink[] = [];
  for (const element of elements.slice(0, MAX_HYPERLINKS_PER_SHEET)) {
    const reference = xmlAttribute(element, "ref");
    if (!reference) return readerFailure(`hyperlink in ${sheet} has no source range`);
    const source = parseRange(reference);
    const range = {
      start: { row: source.r0, col: source.c0 },
      end: { row: source.r1, col: source.c1 },
    };
    const relationshipId = xmlAttribute(element, "id");
    const location = xmlAttribute(element, "location");
    const display = xmlAttribute(element, "display");
    if (display !== undefined && display.length > MAX_HYPERLINK_DISPLAY_LENGTH) {
      emitWarning(context, {
        code: "hyperlink",
        message: `Excel hyperlink display text exceeds ${MAX_HYPERLINK_DISPLAY_LENGTH} characters and the hyperlink was dropped`,
        sheet,
        cell: reference,
      });
      continue;
    }
    if (xmlAttribute(element, "tooltip") !== undefined) {
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink tooltip is unsupported and was dropped",
        sheet,
        cell: reference,
      });
    }
    if (relationshipId && location) {
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink combined relationship and location is unsupported and was dropped",
        sheet,
        cell: reference,
      });
      continue;
    }
    if (relationshipId) {
      const relationship = relationships.find((candidate) => candidate.id === relationshipId);
      if (!relationship || !relationshipTypeMatches(relationship.type, "hyperlink")) {
        return readerFailure(`hyperlink relationship ${relationshipId} in ${sheet} is invalid`);
      }
      if (!relationship.external) {
        emitWarning(context, {
          code: "hyperlink",
          message: "Internal package-part hyperlink relationships are unsupported and were dropped",
          sheet,
          cell: reference,
          part: relationship.target,
        });
        continue;
      }
      if (!isSafeExternalHyperlink(relationship.target)) {
        emitWarning(context, {
          code: "hyperlink",
          message:
            "Hyperlink external target is not an absolute HTTPS or mailto URL and was dropped",
          sheet,
          cell: reference,
        });
        continue;
      }
      result.push({
        range,
        target: { kind: "external", url: relationship.target },
        ...(display !== undefined ? { display: decodeXstring(display) } : {}),
      });
      continue;
    }
    if (location) {
      const target = parseHyperlinkLocation(location, sheet);
      if (!target) {
        emitWarning(context, {
          code: "hyperlink",
          message: "Hyperlink internal location is malformed and was dropped",
          sheet,
          cell: reference,
        });
        continue;
      }
      result.push({
        range,
        target: { kind: "internal", ...target },
        ...(display !== undefined ? { display: decodeXstring(display) } : {}),
      });
      continue;
    }
    emitWarning(context, {
      code: "hyperlink",
      message: "Hyperlink has no target and was dropped",
      sheet,
      cell: reference,
    });
  }
  return result;
}
