/** NFC and locale-independent Unicode lowercase key used for worksheet-name identity. */
export function sheetNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * The default name of a new sheet: `Sheet N`, counting on from the number of
 * sheets to the first number whose name no sheet already has.
 */
export function nextSheetName(sheets: readonly { readonly name: string }[]): string {
  const names = new Set(sheets.map((sheet) => sheetNameKey(sheet.name)));
  let number = sheets.length + 1;
  while (names.has(sheetNameKey(`Sheet ${number}`))) number += 1;

  return `Sheet ${number}`;
}

/** Tables, columns and named ranges share the formula identifier namespace. */
export function formulaNameKey(name: string): string {
  return name.normalize("NFC").toUpperCase();
}
