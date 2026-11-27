// Pure data-model rules shared by the protocol, the store and the history:
// shape checks, structural checks and copies of table relationships. Nothing
// here reads cells; the engine checks key values.

import { isPlainRecord, ownValue } from "./plain-data.js";
import type { DataModel, Measure, TableColumnRef, TableRelationship } from "./types/data-model.js";
import type { Sheet } from "./types/document.js";

/** Most relationships one workbook may hold. */
const MAX_RELATIONSHIPS = 1_024;
/** Longest relationship ID; matches the table ID bound. */
const MAX_RELATIONSHIP_ID_LENGTH = 255;
/** Longest table or column ID in a reference. */
const MAX_REFERENCE_ID_LENGTH = 255;
/** Most measures one workbook may hold; matches the engine bound. */
const MAX_MEASURES = 1_024;
/** Longest measure formula; matches the cell formula bound. */
const MAX_MEASURE_FORMULA_LENGTH = 8_192;

/** Path-qualified data-model problem; structurally a `DocumentValidationError`. */
export interface DataModelIssue {
  path: string;
  code: "invalid-value" | "duplicate-id" | "missing-reference" | "resource-limit";
  message: string;
}

/** Where checks append issues; a `DocumentValidationError[]` qualifies. */
export interface DataModelIssueSink {
  push(...issues: DataModelIssue[]): number;
}

function is_bounded_id(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validate_column_ref_shape(value: unknown, path: string, issues: DataModelIssueSink): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: "invalid-value", message: `${path} must be an object` });
    return;
  }

  for (const key of ["table", "column"]) {
    if (!is_bounded_id(ownValue(value, key), MAX_REFERENCE_ID_LENGTH)) {
      issues.push({
        path: `${path}.${key}`,
        code: "invalid-value",
        message: `${key} must be a non-empty string of at most ${MAX_REFERENCE_ID_LENGTH}`,
      });
    }
  }
}

/** Shape checks for one untrusted relationship. */
export function validateRelationshipShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: "invalid-value", message: "Relationship must be an object" });
    return;
  }

  if (!is_bounded_id(ownValue(value, "id"), MAX_RELATIONSHIP_ID_LENGTH)) {
    issues.push({
      path: `${path}.id`,
      code: "invalid-value",
      message: `id must be a non-empty string of at most ${MAX_RELATIONSHIP_ID_LENGTH}`,
    });
  }

  validate_column_ref_shape(ownValue(value, "from"), `${path}.from`, issues);
  validate_column_ref_shape(ownValue(value, "to"), `${path}.to`, issues);
}

/** Key of the unordered pair of tables that a relationship joins. */
function table_pair_key(relationship: TableRelationship): string {
  const { from, to } = relationship;
  return from.table < to.table
    ? JSON.stringify([from.table, to.table])
    : JSON.stringify([to.table, from.table]);
}

/** The root of `table` in a union-find forest, with path halving. */
function find_root(parents: Map<string, string>, table: string): string {
  let current = table;
  let parent = parents.get(current) ?? current;
  while (parent !== current) {
    const grandparent = parents.get(parent) ?? parent;
    parents.set(current, grandparent);
    current = grandparent;
    parent = parents.get(current) ?? current;
  }
  return current;
}

/**
 * Structural checks for shape-valid relationships: unique IDs, two different
 * tables, at most one relationship per pair of tables, and no cycle when
 * direction is ignored. The last rule gives one path between two related
 * tables, so a pivot never chooses between paths.
 */
function validate_relationship_structure(
  relationships: readonly TableRelationship[],
  path: string,
  issues: DataModelIssueSink,
): void {
  if (relationships.length > MAX_RELATIONSHIPS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Workbook relationship limit ${MAX_RELATIONSHIPS} exceeded`,
    });
    return;
  }

  const ids = new Set<string>();
  const pairs = new Set<string>();
  const parents = new Map<string, string>();
  relationships.forEach((relationship, index) => {
    const item_path = `${path}[${index}]`;
    if (ids.has(relationship.id)) {
      issues.push({
        path: `${item_path}.id`,
        code: "duplicate-id",
        message: "Relationship IDs must be unique in the workbook",
      });
    }
    ids.add(relationship.id);

    if (relationship.from.table === relationship.to.table) {
      issues.push({
        path: item_path,
        code: "invalid-value",
        message: "A relationship must join two different tables",
      });
      return;
    }

    const pair = table_pair_key(relationship);
    if (pairs.has(pair)) {
      issues.push({
        path: item_path,
        code: "invalid-value",
        message: "At most one relationship may join two tables",
      });
      return;
    }
    pairs.add(pair);

    const from_root = find_root(parents, relationship.from.table);
    const to_root = find_root(parents, relationship.to.table);
    if (from_root === to_root) {
      issues.push({
        path: item_path,
        code: "invalid-value",
        message: "Relationships must not form a cycle between tables",
      });
      return;
    }
    parents.set(from_root, to_root);
  });
}

/** Shape and structural checks for an untrusted saved data model. */
export function validateDataModelShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: "invalid-value", message: `${path} must be an object` });
    return;
  }

  const measures = ownValue(value, "measures");
  if (measures !== undefined) {
    validate_measures(measures, `${path}.measures`, issues);
  }

  const relationships_path = `${path}.relationships`;
  const relationships = ownValue(value, "relationships");
  if (!Array.isArray(relationships)) {
    issues.push({
      path: relationships_path,
      code: "invalid-value",
      message: "relationships must be an array",
    });
    return;
  }

  if (relationships.length > MAX_RELATIONSHIPS) {
    issues.push({
      path: relationships_path,
      code: "resource-limit",
      message: `Workbook relationship limit ${MAX_RELATIONSHIPS} exceeded`,
    });
    return;
  }

  const shape_issues: DataModelIssue[] = [];
  relationships.forEach((entry, index) => {
    validateRelationshipShape(entry, `${relationships_path}[${index}]`, shape_issues);
  });
  if (shape_issues.length > 0) {
    issues.push(...shape_issues);
    return;
  }

  // The shape checks above prove every entry is a relationship.
  validate_relationship_structure(relationships as TableRelationship[], relationships_path, issues);
}

/** Whether `ref` names an existing table and one of its columns. */
function column_exists(sheets: readonly Sheet[], ref: TableColumnRef): boolean {
  for (const sheet of sheets) {
    const table = sheet.tables?.find((candidate) => candidate.id === ref.table);
    if (table) return table.columns.some((column) => column.id === ref.column);
  }
  return false;
}

/**
 * Admission checks for a shape-valid `relationship` that replaces the one
 * with its ID: both columns exist now, and the whole model stays
 * structurally valid. A saved relationship may refer to a removed table or
 * column; a new one may not.
 */
export function validateRelationshipAdmission(
  relationship: TableRelationship,
  model: DataModel | undefined,
  sheets: readonly Sheet[],
  issues: DataModelIssueSink,
): void {
  for (const side of ["from", "to"] as const) {
    if (!column_exists(sheets, relationship[side])) {
      issues.push({
        path: `relationship.${side}`,
        code: "missing-reference",
        message: `relationship.${side} must name an existing table column`,
      });
    }
  }

  validate_relationship_structure(
    withRelationship(model, relationship).relationships,
    "dataModel.relationships",
    issues,
  );
}

/** Deep copy of one relationship holding only its defined fields. */
export function cloneRelationship(relationship: TableRelationship): TableRelationship {
  return {
    id: relationship.id,
    from: { table: relationship.from.table, column: relationship.from.column },
    to: { table: relationship.to.table, column: relationship.to.column },
  };
}

/** Deep copies of the relationships of `model`, or none. */
export function cloneRelationships(model: DataModel | undefined): TableRelationship[] {
  return (model?.relationships ?? []).map(cloneRelationship);
}

/** A copy of `model` with `relationship` inserted, or replacing the one with its ID. */
export function withRelationship(
  model: DataModel | undefined,
  relationship: TableRelationship,
): DataModel {
  const relationships = cloneRelationships(model);
  const index = relationships.findIndex((candidate) => candidate.id === relationship.id);
  if (index < 0) relationships.push(cloneRelationship(relationship));
  else relationships[index] = cloneRelationship(relationship);
  return { ...model, relationships };
}

/**
 * A copy of `model` without the relationship with `id`. An empty model is
 * `undefined`, the canonical form of "no relationships".
 */
export function withoutRelationship(
  model: DataModel | undefined,
  id: string,
): DataModel | undefined {
  const relationships = cloneRelationships(model).filter((candidate) => candidate.id !== id);
  return relationships.length > 0 || model?.measures?.length
    ? { ...model, relationships }
    : undefined;
}

/** The relationship with `id`, if the model has one. */
export function findRelationship(
  model: DataModel | undefined,
  id: string,
): TableRelationship | undefined {
  return model?.relationships.find((candidate) => candidate.id === id);
}

/** Whether `name` can name a measure: not blank, and no `[` or `]`. */
function is_measure_name(name: unknown): name is string {
  return is_bounded_id(name, MAX_REFERENCE_ID_LENGTH) && name.trim() !== "" && !/[[\]]/u.test(name);
}

/** Shape checks for a saved measure; formula parsing belongs to Rust. */
export function validateMeasureShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  const formula = isPlainRecord(value) ? ownValue(value, "formula") : undefined;
  const valid =
    isPlainRecord(value) &&
    is_bounded_id(ownValue(value, "id"), MAX_REFERENCE_ID_LENGTH) &&
    is_bounded_id(ownValue(value, "table"), MAX_REFERENCE_ID_LENGTH) &&
    is_measure_name(ownValue(value, "name")) &&
    typeof formula === "string" &&
    formula.startsWith("=") &&
    formula.length <= MAX_MEASURE_FORMULA_LENGTH;
  if (!valid) {
    issues.push({
      path,
      code: "invalid-value",
      message: "Invalid measure",
    });
  }
}

function validate_measures(value: unknown, path: string, issues: DataModelIssueSink): void {
  if (!Array.isArray(value) || value.length > MAX_MEASURES) {
    issues.push({ path, code: "resource-limit", message: "Invalid measure list" });
    return;
  }

  const keys = new Set<string>();
  value.forEach((measure, index) => {
    const item_path = `${path}[${index}]`;
    const before = keys.size;
    validateMeasureShape(measure, item_path, issues);
    if (!isPlainRecord(measure)) return;

    // IDs and case-folded names share one set; the prefixes keep them apart.
    keys.add(`id:${String(ownValue(measure, "id"))}`);
    keys.add(`name:${String(ownValue(measure, "name")).toLowerCase()}`);
    if (keys.size !== before + 2) {
      issues.push({ path: item_path, code: "duplicate-id", message: "Duplicate measure" });
    }
  });
}

/** The measure with `id`, if the model has one. */
export function findMeasure(model: DataModel | undefined, id: string): Measure | undefined {
  return model?.measures?.find((measure) => measure.id === id);
}

/** The table with `id` among the workbook's sheets. */
export function findTable(sheets: readonly Sheet[], id: string) {
  for (const sheet of sheets) {
    const table = sheet.tables?.find((candidate) => candidate.id === id);
    if (table) return table;
  }
  return undefined;
}

/** A detached copy containing only the measure's defined properties. */
export function cloneMeasure(measure: Measure): Measure {
  return { id: measure.id, name: measure.name, table: measure.table, formula: measure.formula };
}

/** Insert a measure, or replace the one with its ID in place. */
export function withMeasure(model: DataModel | undefined, measure: Measure): DataModel {
  const measures = (model?.measures ?? []).map((candidate) =>
    cloneMeasure(candidate.id === measure.id ? measure : candidate),
  );
  if (!findMeasure(model, measure.id)) measures.push(cloneMeasure(measure));
  return { relationships: cloneRelationships(model), measures };
}

/** Remove a measure, omitting the model only when it has no members. */
export function withoutMeasure(model: DataModel | undefined, id: string): DataModel | undefined {
  const relationships = cloneRelationships(model);
  const measures = (model?.measures ?? []).filter((measure) => measure.id !== id).map(cloneMeasure);
  if (measures.length > 0) return { relationships, measures };
  return relationships.length > 0 ? { relationships } : undefined;
}

/** Check identities and the home table when inserting or replacing a measure. */
export function validateMeasureAdmission(
  measure: Measure,
  model: DataModel | undefined,
  sheets: readonly Sheet[],
  issues: DataModelIssueSink,
): void {
  validate_measures(withMeasure(model, measure).measures, "dataModel.measures", issues);
  const name = measure.name.toLowerCase();
  const table = findTable(sheets, measure.table);
  if (!table || table.columns.some((column) => column.name.toLowerCase() === name)) {
    issues.push({
      path: "measure.table",
      code: "missing-reference",
      message: "Invalid measure table",
    });
  }
}
