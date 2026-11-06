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
let tableExportBackend: XlsxTableExportBackend | null = null;
let tableImportBackend: XlsxTableImportBackend | null = null;
let workbookBackend: XlsxWorkbookBackend | null = null;

/** Sets the table XLSX export implementation; `null` clears it. */
export function setXlsxTableExportBackend(next: XlsxTableExportBackend | null): void {
  tableExportBackend = next;
}

/** Sets the table XLSX import implementation; `null` clears it. */
export function setXlsxTableImportBackend(next: XlsxTableImportBackend | null): void {
  tableImportBackend = next;
}

/** Sets the workbook XLSX implementation and its source verifier; `null` clears both. */
export function setXlsxWorkbookBackend(next: XlsxWorkbookBackend | null): void {
  workbookBackend = next;
  setXlsxSourceVerifier(next?.verifySource?.bind(next));
}

/** The installed table export backend, or `null`. */
export function xlsxTableExportBackend(): XlsxTableExportBackend | null {
  return tableExportBackend;
}

/** The installed table import backend, or `null`. */
export function xlsxTableImportBackend(): XlsxTableImportBackend | null {
  return tableImportBackend;
}

/** The installed workbook backend, or `null`. */
export function xlsxWorkbookBackend(): XlsxWorkbookBackend | null {
  return workbookBackend;
}
