interface OfficeCase {
  id: string;
  kind: "formula" | "workbook";
  inputs?: Array<{ cell: string; value: string | number | boolean | null }>;
  formula?: string;
  target?: string;
  numberFormat?: string;
  calculation?: { iterate: true; maxIterations: number; maxChange: number };
}

interface OfficePayload {
  protocol: 1;
  producerVersion: string;
  cases: OfficeCase[];
}

type CellResult = string | number | boolean | null;

/**
 * Reads one cell by its value type. Excel returns an error as its error text
 * and a blank as `""`, so the text of the value alone cannot tell `="#x"`,
 * `=""`, an error and an empty cell apart.
 */
function cell_result(
  value: string | number | boolean,
  value_type: ExcelScript.RangeValueType,
): { type: "number" | "boolean" | "string" | "error" | "blank"; value: CellResult } {
  switch (value_type) {
    case ExcelScript.RangeValueType.empty:
      return { type: "blank", value: null };
    case ExcelScript.RangeValueType.error:
      return { type: "error", value };
    case ExcelScript.RangeValueType.string:
      return { type: "string", value };
    case ExcelScript.RangeValueType.integer:
    case ExcelScript.RangeValueType.double:
      return { type: "number", value };
    case ExcelScript.RangeValueType.boolean:
      return { type: "boolean", value };
    default:
      throw new Error(`Unsupported Excel value type ${String(value_type)}`);
  }
}

function result_of(range: ExcelScript.Range): Record<string, unknown> {
  const formula = range.getFormula();
  const anchor = cell_result(range.getValue(), range.getValueType());
  const spill = anchor.type === "error" ? undefined : range.getSpillingToRange();
  if (spill) {
    const value_types = spill.getValueTypes();
    const value = spill.getValues().map((line, row) =>
      line.map((cell, column) => {
        const value_type = value_types[row]?.[column];
        if (value_type === undefined) throw new Error("Excel value types do not match values");
        return cell_result(cell, value_type).value;
      }),
    );
    return {
      type: "array",
      value,
      rows: spill.getRowCount(),
      columns: spill.getColumnCount(),
      formula,
    };
  }

  const displayed_text = range.getText();
  if (anchor.type === "blank") return { type: "blank", displayedText: displayed_text, formula };
  if (anchor.type === "error")
    return { type: "error", error: anchor.value, displayedText: displayed_text, formula };
  return { type: anchor.type, value: anchor.value, displayedText: displayed_text, formula };
}

/** Office Script entry point copied verbatim into the protected Excel runner. */
export function main(
  workbook: ExcelScript.Workbook,
  payloadJson: string,
  scriptSha256: string,
): string {
  const payload = JSON.parse(payloadJson) as OfficePayload;
  if (payload.protocol !== 1 || !payload.producerVersion || !Array.isArray(payload.cases)) {
    throw new Error("Invalid conformance payload");
  }
  const existing = new Set(workbook.getWorksheets().map((sheet) => sheet.getName()));
  const created: Array<{ caseId: string; target: string; sheet: ExcelScript.Worksheet }> = [];
  const observations: Array<{ caseId: string; result: Record<string, unknown> }> = [];
  // The corpus validator keeps one calculation setting for every case, and
  // iteration leaves formulas without a circular reference unchanged.
  const calculation = payload.cases.find((entry) => entry.calculation)?.calculation;
  const iteration = workbook.getApplication().getIterativeCalculation();
  const previous_iteration = {
    enabled: iteration.getEnabled(),
    maxIteration: iteration.getMaxIteration(),
    maxChange: iteration.getMaxChange(),
  };

  try {
    if (calculation) {
      iteration.setEnabled(true);
      iteration.setMaxIteration(calculation.maxIterations);
      iteration.setMaxChange(calculation.maxChange);
    }
    payload.cases.forEach((entry, index) => {
      if (entry.kind !== "formula" || !entry.formula || !entry.target) return;
      let name = `Case${String(index + 1).padStart(4, "0")}`;
      while (existing.has(name)) name = `_${name}`;
      existing.add(name);
      const sheet = workbook.addWorksheet(name);
      created.push({ caseId: entry.id, target: entry.target, sheet });
      for (const input of entry.inputs ?? []) {
        if (input.value !== null) sheet.getRange(input.cell).setValue(input.value);
      }
      const target = sheet.getRange(entry.target);
      target.setFormula(entry.formula);
      if (entry.numberFormat) target.setNumberFormat(entry.numberFormat);
    });
    workbook.getApplication().calculate(ExcelScript.CalculationType.fullRebuild);
    for (const { caseId: case_id, target, sheet } of created) {
      observations.push({ caseId: case_id, result: result_of(sheet.getRange(target)) });
    }
    return JSON.stringify({
      protocol: 1,
      producer: "excel-web",
      producerVersion: payload.producerVersion,
      capturedAt: new Date().toISOString(),
      scriptSha256,
      calculation: "fullRebuild",
      observations,
    });
  } finally {
    for (const { sheet } of created.reverse()) sheet.delete();
    iteration.setEnabled(previous_iteration.enabled);
    iteration.setMaxIteration(previous_iteration.maxIteration);
    iteration.setMaxChange(previous_iteration.maxChange);
  }
}
