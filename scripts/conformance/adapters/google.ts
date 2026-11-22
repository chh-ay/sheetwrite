import { persistCapture, readBoundedResponse } from "../capture.js";
import { canonicalJson, isObject, sha256, sha256Bytes } from "../normalize.js";
import type {
  CaptureArtifact,
  ConformanceCase,
  ConformanceCorpus,
  ConformanceResult,
  CellResult,
} from "../types.js";

export const MAX_GOOGLE_CASES_PER_WORKBOOK = 50;
export const MAX_GOOGLE_ARRAY_ENVELOPE_CELLS = 10_000;

export interface GoogleWorkbookManifest {
  batchIndex: number;
  observationStart: number;
  caseCount: number;
  firstCaseId: string;
  lastCaseId: string;
  caseIdsSha256: string;
  observationsSha256: string;
  workbookSha256: string;
  workbookBytes: number;
  bindingSha256: string;
  locale?: string;
  timeZone?: string;
}

export interface GoogleCaptureDependencies {
  producerVersion: string;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  persist: (artifact: CaptureArtifact) => Promise<string>;
  now: () => Date;
}

const GOOGLE_ERROR: Record<string, string> = {
  ERROR: "#ERROR!",
  NULL_VALUE: "#NULL!",
  DIVIDE_BY_ZERO: "#DIV/0!",
  VALUE: "#VALUE!",
  REF: "#REF!",
  NAME: "#NAME?",
  NUM: "#NUM!",
  N_A: "#N/A",
  LOADING: "#N/A",
};

function sheet_title(index: number): string {
  return `Case${String(index + 1).padStart(4, "0")}`;
}

function range_for(entry: ConformanceCase, index: number): string {
  const target = /^([A-Z]+)([1-9][0-9]*)$/.exec(entry.target!);
  if (!target || entry.expected.type !== "array") return `'${sheet_title(index)}'!${entry.target}`;
  const rows = entry.expected.rows!;
  const columns = entry.expected.columns!;
  if (
    !Number.isSafeInteger(rows) ||
    !Number.isSafeInteger(columns) ||
    rows < 1 ||
    columns < 1 ||
    (rows + 1) * (columns + 1) > MAX_GOOGLE_ARRAY_ENVELOPE_CELLS
  ) {
    throw new RangeError(`Google array envelope exceeds ${MAX_GOOGLE_ARRAY_ENVELOPE_CELLS} cells`);
  }
  let column = 0;
  for (const character of target[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  column += columns;
  let label = "";
  while (column > 0) {
    column -= 1;
    label = String.fromCharCode(65 + (column % 26)) + label;
    column = Math.floor(column / 26);
  }
  const end_row = Number(target[2]) + rows;
  return `'${sheet_title(index)}'!${entry.target}:${label}${end_row}`;
}

async function google_request(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    response.body?.cancel().catch(() => undefined);
    throw new Error(
      `Google oracle ${init.method ?? "GET"} ${url} failed with HTTP ${response.status}`,
    );
  }
  return response;
}

function scalar_result(cell: unknown, expected: ConformanceResult): CellResult {
  if (!isObject(cell)) return { type: "blank" };
  const effective = isObject(cell.effectiveValue) ? cell.effectiveValue : {};
  const formula = isObject(cell.userEnteredValue)
    ? (cell.userEnteredValue.formulaValue as string | undefined)
    : undefined;
  const displayed_text = typeof cell.formattedValue === "string" ? cell.formattedValue : undefined;
  const display =
    "displayedText" in expected &&
    expected.displayedText !== undefined &&
    displayed_text !== undefined
      ? { displayedText: displayed_text }
      : {};
  const source = formula !== undefined ? { formula } : {};
  if (typeof effective.numberValue === "number") {
    return { type: "number", value: effective.numberValue, ...display, ...source };
  }
  if (typeof effective.boolValue === "boolean") {
    return { type: "boolean", value: effective.boolValue, ...source };
  }
  if (typeof effective.stringValue === "string") {
    return { type: "string", value: effective.stringValue, ...display, ...source };
  }
  if (isObject(effective.errorValue)) {
    const code = GOOGLE_ERROR[String(effective.errorValue.type)] ?? "#ERROR!";
    return { type: "error", error: code, ...source };
  }
  return { type: "blank", ...source };
}

function observed_result(sheet: unknown, entry: ConformanceCase): ConformanceResult {
  if (!isObject(sheet) || !Array.isArray(sheet.data)) return { type: "blank" };
  const grid = sheet.data[0];
  if (!isObject(grid) || !Array.isArray(grid.rowData)) return { type: "blank" };
  const first_cell =
    isObject(grid.rowData[0]) && Array.isArray(grid.rowData[0].values)
      ? grid.rowData[0].values[0]
      : undefined;
  const anchor = scalar_result(first_cell, entry.expected);
  if (entry.expected.type !== "array" || anchor.type === "error") return anchor;
  const rows = entry.expected.rows!;
  const columns = entry.expected.columns!;
  const values: unknown[][] = [];
  for (let row = 0; row < rows; row++) {
    const row_data =
      isObject(grid.rowData[row]) && Array.isArray(grid.rowData[row].values)
        ? grid.rowData[row].values
        : [];
    const line: unknown[] = [];
    for (let column = 0; column < columns; column++) {
      const result = scalar_result(row_data[column], { type: "blank" });
      line.push(
        result.type === "blank" ? null : result.type === "error" ? result.error : result.value,
      );
    }
    values.push(line);
  }
  return { type: "array", value: values, rows, columns, formula: entry.formula };
}

function assert_array_envelope(sheet: unknown, entry: ConformanceCase, batch_index: number): void {
  if (entry.expected.type !== "array") return;
  const grid = isObject(sheet) && Array.isArray(sheet.data) ? sheet.data[0] : undefined;
  const row_data = isObject(grid) && Array.isArray(grid.rowData) ? grid.rowData : [];
  let last_row = -1;
  let last_column = -1;
  row_data.forEach((row, row_index) => {
    const cells = isObject(row) && Array.isArray(row.values) ? row.values : [];
    cells.forEach((cell, column_index) => {
      if (
        isObject(cell) &&
        ((isObject(cell.effectiveValue) && Object.keys(cell.effectiveValue).length > 0) ||
          (typeof cell.formattedValue === "string" && cell.formattedValue.length > 0))
      ) {
        last_row = Math.max(last_row, row_index);
        last_column = Math.max(last_column, column_index);
      }
    });
  });
  const expected_values = Array.isArray(entry.expected.value) ? entry.expected.value : [];
  let expected_last_row = -1;
  let expected_last_column = -1;
  expected_values.forEach((row, row_index) => {
    if (!Array.isArray(row)) return;
    row.forEach((value, column_index) => {
      if (value !== null && value !== undefined) {
        expected_last_row = Math.max(expected_last_row, row_index);
        expected_last_column = Math.max(expected_last_column, column_index);
      }
    });
  });
  if (last_row >= entry.expected.rows! || last_column >= entry.expected.columns!) {
    throw new Error(
      `Google Sheets batch ${batch_index}: array result exceeds expected shape for ${entry.id}`,
    );
  }
  if (last_row < expected_last_row || last_column < expected_last_column) {
    throw new Error(
      `Google Sheets batch ${batch_index}: array result is smaller than expected for ${entry.id}`,
    );
  }
}

export async function captureGoogleWithDependencies(
  corpus: ConformanceCorpus,
  dependencies: GoogleCaptureDependencies,
): Promise<string> {
  const formula_cases = corpus.cases.filter((entry) => entry.kind === "formula");
  const observations: CaptureArtifact["observations"] = [];
  const workbooks: GoogleWorkbookManifest[] = [];
  const captured_at = dependencies.now().toISOString();
  for (
    let observation_start = 0, batch_index = 0;
    observation_start < formula_cases.length;
    observation_start += MAX_GOOGLE_CASES_PER_WORKBOOK, batch_index += 1
  ) {
    const batch = formula_cases.slice(
      observation_start,
      observation_start + MAX_GOOGLE_CASES_PER_WORKBOOK,
    );
    // The corpus validator keeps one calculation setting for every case, and
    // iteration leaves formulas without a circular reference unchanged.
    const calculation = batch.find((entry) => entry.calculation)?.calculation;
    const created = await dependencies.request("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: canonicalJson({
        properties: {
          title: `sheetwrite-conformance-${captured_at}-batch-${String(batch_index + 1).padStart(3, "0")}`,
          locale: "en_US",
          timeZone: "UTC",
          ...(calculation
            ? {
                iterativeCalculationSettings: {
                  maxIterations: calculation.maxIterations,
                  convergenceThreshold: calculation.maxChange,
                },
              }
            : {}),
        },
        sheets: batch.map((_entry, index) => ({ properties: { title: sheet_title(index) } })),
      }),
    });
    const created_bytes = await readBoundedResponse(created);
    const spreadsheet = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(created_bytes),
    ) as {
      spreadsheetId?: string;
      properties?: { locale?: string; timeZone?: string };
    };
    if (!spreadsheet.spreadsheetId) {
      throw new Error("Google Sheets create response omitted spreadsheetId");
    }
    const id = spreadsheet.spreadsheetId;
    try {
      const data = batch.flatMap((entry, index) => [
        ...(entry.inputs ?? []).map((input) => ({
          range: `'${sheet_title(index)}'!${input.cell}`,
          values: [[input.value]],
        })),
        { range: `'${sheet_title(index)}'!${entry.target}`, values: [[entry.formula]] },
      ]);
      await readBoundedResponse(
        await dependencies.request(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
          {
            method: "POST",
            body: canonicalJson({
              valueInputOption: "USER_ENTERED",
              includeValuesInResponse: false,
              data,
            }),
          },
        ),
      );
      const ranges = batch
        .map((entry, index) => `ranges=${encodeURIComponent(range_for(entry, index))}`)
        .join("&");
      const payload_bytes = await readBoundedResponse(
        await dependencies.request(
          `https://sheets.googleapis.com/v4/spreadsheets/${id}?includeGridData=true&${ranges}`,
        ),
      );
      const payload = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(payload_bytes),
      ) as { sheets?: unknown[] };
      if (!Array.isArray(payload.sheets) || payload.sheets.length !== batch.length) {
        throw new Error(`Google Sheets batch ${batch_index}: missing or extra result sheets`);
      }
      payload.sheets.forEach((sheet, index) => {
        const title =
          isObject(sheet) && isObject(sheet.properties) ? sheet.properties.title : undefined;
        if (title !== sheet_title(index)) {
          throw new Error(`Google Sheets batch ${batch_index}: reordered result sheets`);
        }
        assert_array_envelope(sheet, batch[index]!, batch_index);
      });
      const batch_observations = batch.map((entry, index) => ({
        caseId: entry.id,
        result: observed_result(payload.sheets![index], entry),
      }));
      const xlsx = await readBoundedResponse(
        await dependencies.request(
          `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`,
        ),
        128 * 1024 * 1024,
      );
      const case_ids = batch.map((entry) => entry.id);
      const observations_sha256 = sha256(batch_observations);
      const workbook_sha256 = sha256Bytes(xlsx);
      const binding = {
        batchIndex: batch_index,
        observationStart: observation_start,
        caseIds: case_ids,
        observationsSha256: observations_sha256,
        workbookSha256: workbook_sha256,
        workbookBytes: xlsx.byteLength,
      };
      workbooks.push({
        batchIndex: batch_index,
        observationStart: observation_start,
        caseCount: batch.length,
        firstCaseId: case_ids[0]!,
        lastCaseId: case_ids.at(-1)!,
        caseIdsSha256: sha256(case_ids),
        observationsSha256: observations_sha256,
        workbookSha256: workbook_sha256,
        workbookBytes: xlsx.byteLength,
        bindingSha256: sha256(binding),
        ...(spreadsheet.properties?.locale ? { locale: spreadsheet.properties.locale } : {}),
        ...(spreadsheet.properties?.timeZone ? { timeZone: spreadsheet.properties.timeZone } : {}),
      });
      observations.push(...batch_observations);
    } finally {
      await readBoundedResponse(
        await dependencies.request(`https://www.googleapis.com/drive/v3/files/${id}`, {
          method: "DELETE",
        }),
      );
    }
  }
  const artifact: CaptureArtifact = {
    protocol: 1,
    producer: "google-sheets",
    producerVersion: dependencies.producerVersion,
    capturedAt: captured_at,
    observations,
    calculation: "automatic",
    batchSize: MAX_GOOGLE_CASES_PER_WORKBOOK,
    workbooks,
    bindingSha256: sha256({
      producer: "google-sheets",
      producerVersion: dependencies.producerVersion,
      capturedAt: captured_at,
      observationsSha256: sha256(observations),
      workbooks,
    }),
  };
  return dependencies.persist(artifact);
}

export async function captureGoogle(corpus: ConformanceCorpus): Promise<string> {
  const token = process.env.SHEETWRITE_GOOGLE_ORACLE_TOKEN;
  const producer_version = process.env.SHEETWRITE_GOOGLE_PRODUCER_VERSION;
  if (!token || !producer_version) {
    throw new Error(
      "Compatibility check BLOCKED: Google Sheets needs a protected OAuth token and exact app version",
    );
  }
  return captureGoogleWithDependencies(corpus, {
    producerVersion: producer_version,
    request: (url, init) => google_request(token, url, init),
    persist: persistCapture,
    now: () => new Date(),
  });
}
