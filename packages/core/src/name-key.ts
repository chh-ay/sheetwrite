/** NFC and locale-independent Unicode lowercase key used for worksheet-name identity. */
export function sheetNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/** Tables, columns and named ranges share the formula identifier namespace. */
export function formulaNameKey(name: string): string {
  return name.normalize("NFC").toUpperCase();
}
