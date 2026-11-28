import type { CellHyperlink } from "@sheetwrite/core";
import {
  isSafeExternalHyperlink,
  MAX_HYPERLINK_DISPLAY_LENGTH,
  MAX_HYPERLINKS_PER_SHEET,
} from "@sheetwrite/core/codec";

import { type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import type { ParsedHyperlink } from "./reader-types.js";
import { readerFailure, parseRange } from "./reader-values.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { decodeXstring, type XmlElement, xmlAttribute, xmlChildren } from "./xml.js";

function parse_hyperlink_location(
  value: string,
  current_sheet: string,
): { sheetName: string; range: Omit<CellHyperlink["range"], "sheet"> } | null {
  const location = decodeXstring(value).replace(/^#/, "");
  const separator = location.lastIndexOf("!");
  let sheet_name = current_sheet;
  let range_text = location;
  if (separator >= 0) {
    const raw_sheet = location.slice(0, separator);
    range_text = location.slice(separator + 1);
    if (raw_sheet.startsWith("'") && raw_sheet.endsWith("'")) {
      sheet_name = raw_sheet.slice(1, -1).replaceAll("''", "'");
    } else {
      sheet_name = raw_sheet;
    }
  }
  if (!sheet_name || !range_text) return null;
  try {
    const parsed = parseRange(range_text.replaceAll("$", ""));
    return {
      sheetName: sheet_name,
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
    const relationship_id = xmlAttribute(element, "id");
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
    if (relationship_id && location) {
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink combined relationship and location is unsupported and was dropped",
        sheet,
        cell: reference,
      });
      continue;
    }
    if (relationship_id) {
      const relationship = relationships.find((candidate) => candidate.id === relationship_id);
      if (!relationship || !relationshipTypeMatches(relationship.type, "hyperlink")) {
        return readerFailure(`hyperlink relationship ${relationship_id} in ${sheet} is invalid`);
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
      const target = parse_hyperlink_location(location, sheet);
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
