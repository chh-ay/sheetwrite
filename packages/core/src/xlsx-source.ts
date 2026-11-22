import type { WorkbookSnapshot, XlsxSourceSnapshot } from "./types/document.js";

type SourceVerifier = (snapshot: WorkbookSnapshot) => XlsxSourceSnapshot | undefined;
let verifier: SourceVerifier | undefined;
const admitted_stores = new WeakSet<object>();

/** Wire the optional backend without making stores depend on compression. */
export function setXlsxSourceVerifier(next: SourceVerifier | undefined): void {
  verifier = next;
}

/** Check external source values and opaque bytes before enabling commit-based pruning. */
export function admitStoreXlsxSource(
  store: object,
  snapshot: WorkbookSnapshot,
): XlsxSourceSnapshot | undefined {
  if (!verifier) return snapshot.workbook.xlsxSource;
  const source = verifier(snapshot);
  admitted_stores.add(store);
  return source;
}

/** Provenance belongs to the store, never a mutable snapshot returned to callers. */
export function hasAdmittedXlsxSource(store: object): boolean {
  return admitted_stores.has(store);
}

/** Verified provenance follows the document, not the facade that used to hold it. */
export function replaceStoreXlsxSource(store: object, replacement: object): void {
  admitted_stores.delete(store);
  if (admitted_stores.has(replacement)) admitted_stores.add(store);
}
