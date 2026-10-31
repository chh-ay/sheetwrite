/**
 * The subset of the Office Scripts API that the conformance runner calls, with
 * the signatures from Microsoft's reference
 * (https://learn.microsoft.com/javascript/api/office-scripts/excelscript).
 * Enum members carry no values here: the runner compares them only by member.
 */
declare namespace ExcelScript {
 enum CalculationType {
  recalculate,
  full,
  fullRebuild,
 }
 enum RangeValueType {
  unknown,
  empty,
  string,
  integer,
  double,
  boolean,
  error,
  richValue,
 }
 interface Application {
  calculate(calculationType: CalculationType): void;
  getIterativeCalculation(): IterativeCalculation;
 }
 interface IterativeCalculation {
  getEnabled(): boolean;
  getMaxChange(): number;
  getMaxIteration(): number;
  setEnabled(enabled: boolean): void;
  setMaxChange(maxChange: number): void;
  setMaxIteration(maxIteration: number): void;
 }
 interface Range {
  setValue(value: string | number | boolean): void;
  setFormula(formula: string): void;
  setNumberFormat(numberFormat: string): void;
  getValue(): string | number | boolean;
  getValues(): (string | number | boolean)[][];
  getValueType(): RangeValueType;
  getValueTypes(): RangeValueType[][];
  getText(): string;
  getFormula(): string;
  getRowCount(): number;
  getColumnCount(): number;
  /** Returns `undefined` when the range is not the anchor of a spill. */
  getSpillingToRange(): Range | undefined;
 }
 interface Worksheet {
  getName(): string;
  getRange(address?: string): Range;
  delete(): void;
 }
 interface Workbook {
  addWorksheet(name?: string): Worksheet;
  getApplication(): Application;
  getWorksheets(): Worksheet[];
 }
}
