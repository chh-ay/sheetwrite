import { sheetNameKey } from "./name-key.js";
import type { SheetNameIssueCode, SheetNameValidationResult } from "./types/document.js";

/** Excel reserves History, in any case, for its change-tracking sheet. */
const RESERVED_KEY = sheetNameKey("History");

function hasForbiddenSheetNameCharacter(name: string): boolean {
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);
    if (code <= 0x1f || "\\/*?:[]".includes(name[index]!)) return true;
  }
  return false;
}

/**
 * Validate and canonicalize a SpreadsheetML worksheet name.
 *
 * @param name - The proposed sheet name.
 * @param existingNames - Names already in use; a match, ignoring case, is a duplicate.
 */
export function validateSheetName(
  name: string,
  existingNames: readonly string[] = [],
): SheetNameValidationResult {
  const normalized = name.normalize("NFC");
  const key = sheetNameKey(normalized);
  let code: SheetNameIssueCode | null = null;
  if (normalized.trim().length === 0) code = "blank";
  else if (normalized.length > 31) code = "too-long";
  else if (normalized.startsWith("'") || normalized.endsWith("'")) code = "edge-apostrophe";
  else if (hasForbiddenSheetNameCharacter(normalized)) code = "forbidden-character";
  else if (existingNames.some((existing) => sheetNameKey(existing) === key)) code = "duplicate";
  else if (key === RESERVED_KEY) code = "reserved";
  return code === null
    ? { ok: true, name: normalized, key }
    : { ok: false, code, name: normalized, key };
}

/**
 * Whether an added sheet may take the validated name. Undo, version restore
 * and copied workbooks add sheets back, and a file from another program can
 * hold a History sheet, so only a rename refuses the reserved name.
 */
export function canAddSheetName(result: SheetNameValidationResult): boolean {
  return result.ok || result.code === "reserved";
}

export type { SheetNameIssueCode, SheetNameValidationResult } from "./types/document.js";
