import type { WorkbookSnapshot, XlsxSourceSnapshot } from "./types/document.js";

type SourceVerifier = (snapshot: WorkbookSnapshot) => XlsxSourceSnapshot | undefined;
let verifier: SourceVerifier | undefined;
const admittedStores = new WeakSet<object>();

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
  admittedStores.add(store);
  return source;
}

/** Provenance belongs to the store, never a mutable snapshot returned to callers. */
export function hasAdmittedXlsxSource(store: object): boolean {
  return admittedStores.has(store);
}
