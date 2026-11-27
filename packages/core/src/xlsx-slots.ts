import type {
  XlsxTableExportBackend,
  XlsxTableImportBackend,
  XlsxWorkbookBackend,
} from "./types/xlsx.js";
import { setXlsxSourceVerifier } from "./xlsx-source.js";

/**
 * The XLSX backends that the XLSX add-on installs. This module is small and
 * free of codec code, so installing an add-on at startup does not pull the
 * XLSX bridge into the first chunk; the bridge reads these slots per call.
 */
let table_export_backend: XlsxTableExportBackend | null = null;
let table_import_backend: XlsxTableImportBackend | null = null;
let workbook_backend: XlsxWorkbookBackend | null = null;

/** Sets the table XLSX export implementation; `null` clears it. */
export function setXlsxTableExportBackend(next: XlsxTableExportBackend | null): void {
  table_export_backend = next;
}

/** Sets the table XLSX import implementation; `null` clears it. */
export function setXlsxTableImportBackend(next: XlsxTableImportBackend | null): void {
  table_import_backend = next;
}

/** Sets the workbook XLSX implementation and its source verifier; `null` clears both. */
export function setXlsxWorkbookBackend(next: XlsxWorkbookBackend | null): void {
  workbook_backend = next;
  setXlsxSourceVerifier(next?.verifySource?.bind(next));
}

export function xlsxTableExportBackend(): XlsxTableExportBackend | null {
  return table_export_backend;
}

export function xlsxTableImportBackend(): XlsxTableImportBackend | null {
  return table_import_backend;
}

export function xlsxWorkbookBackend(): XlsxWorkbookBackend | null {
  return workbook_backend;
}
