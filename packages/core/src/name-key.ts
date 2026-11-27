/**
 * NFC and locale-independent Unicode lowercase key used for worksheet-name identity.
 *
 * @param name - A sheet name.
 * @returns The name in NFC form and lower case.
 */
export function sheetNameKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

/**
 * NFC and locale-independent Unicode uppercase key used for formula-name
 * identity. Tables, columns and named ranges share this namespace.
 *
 * @param name - A table, column or defined name.
 * @returns The name in NFC form and upper case.
 */
export function formulaNameKey(name: string): string {
  return name.normalize("NFC").toUpperCase();
}
