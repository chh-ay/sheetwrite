// Pure data-model rules shared by the protocol, the store and the history:
// shape checks, structural checks and copies of table relationships. Nothing
// here reads cells; the engine checks key values (#229).

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

function isBoundedId(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validateColumnRefShape(value: unknown, path: string, issues: DataModelIssueSink): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: "invalid-value", message: `${path} must be an object` });
    return;
  }

  for (const key of ["table", "column"]) {
    if (!isBoundedId(ownValue(value, key), MAX_REFERENCE_ID_LENGTH)) {
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

  if (!isBoundedId(ownValue(value, "id"), MAX_RELATIONSHIP_ID_LENGTH)) {
    issues.push({
      path: `${path}.id`,
      code: "invalid-value",
      message: `id must be a non-empty string of at most ${MAX_RELATIONSHIP_ID_LENGTH}`,
    });
  }

  validateColumnRefShape(ownValue(value, "from"), `${path}.from`, issues);
  validateColumnRefShape(ownValue(value, "to"), `${path}.to`, issues);
}

/** Key of the unordered pair of tables that a relationship joins. */
function tablePairKey(relationship: TableRelationship): string {
  const { from, to } = relationship;
  return from.table < to.table
    ? JSON.stringify([from.table, to.table])
    : JSON.stringify([to.table, from.table]);
}

/** The root of `table` in a union-find forest, with path halving. */
function findRoot(parents: Map<string, string>, table: string): string {
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
function validateRelationshipStructure(
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
    const itemPath = `${path}[${index}]`;
    if (ids.has(relationship.id)) {
      issues.push({
        path: `${itemPath}.id`,
        code: "duplicate-id",
        message: "Relationship IDs must be unique in the workbook",
      });
    }
    ids.add(relationship.id);

    if (relationship.from.table === relationship.to.table) {
      issues.push({
        path: itemPath,
        code: "invalid-value",
        message: "A relationship must join two different tables",
      });
      return;
    }

    const pair = tablePairKey(relationship);
    if (pairs.has(pair)) {
      issues.push({
        path: itemPath,
        code: "invalid-value",
        message: "At most one relationship may join two tables",
      });
      return;
    }
    pairs.add(pair);

    const fromRoot = findRoot(parents, relationship.from.table);
    const toRoot = findRoot(parents, relationship.to.table);
    if (fromRoot === toRoot) {
      issues.push({
        path: itemPath,
        code: "invalid-value",
        message: "Relationships must not form a cycle between tables",
      });
      return;
    }
    parents.set(fromRoot, toRoot);
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
    validateMeasures(measures, `${path}.measures`, issues);
  }

  const relationshipsPath = `${path}.relationships`;
  const relationships = ownValue(value, "relationships");
  if (!Array.isArray(relationships)) {
    issues.push({
      path: relationshipsPath,
      code: "invalid-value",
      message: "relationships must be an array",
    });
    return;
  }

  if (relationships.length > MAX_RELATIONSHIPS) {
    issues.push({
      path: relationshipsPath,
      code: "resource-limit",
      message: `Workbook relationship limit ${MAX_RELATIONSHIPS} exceeded`,
    });
    return;
  }

  const shapeIssues: DataModelIssue[] = [];
  relationships.forEach((entry, index) => {
    validateRelationshipShape(entry, `${relationshipsPath}[${index}]`, shapeIssues);
  });
  if (shapeIssues.length > 0) {
    issues.push(...shapeIssues);
    return;
  }

  // The shape checks above prove every entry is a relationship.
  validateRelationshipStructure(relationships as TableRelationship[], relationshipsPath, issues);
}

/** Whether `ref` names an existing table and one of its columns. */
function columnExists(sheets: readonly Sheet[], ref: TableColumnRef): boolean {
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
    if (!columnExists(sheets, relationship[side])) {
      issues.push({
        path: `relationship.${side}`,
        code: "missing-reference",
        message: `relationship.${side} must name an existing table column`,
      });
    }
  }

  validateRelationshipStructure(
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

/** Shape checks for a saved measure; formula parsing belongs to Rust. */
export function validateMeasureShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  if (!isPlainRecord(value)) {
    issues.push({ path, code: "invalid-value", message: "Measure must be an object" });
    return;
  }

  for (const key of ["id", "name", "table"]) {
    const member = ownValue(value, key);
    if (
      !isBoundedId(member, MAX_REFERENCE_ID_LENGTH) ||
      (key === "name" && (member.trim().length === 0 || /[[\]]/u.test(member)))
    ) {
      issues.push({
        path: `${path}.${key}`,
        code: "invalid-value",
        message: "Invalid measure identity",
      });
    }
  }

  const formula = ownValue(value, "formula");
  if (
    typeof formula !== "string" ||
    !formula.startsWith("=") ||
    formula.length > MAX_MEASURE_FORMULA_LENGTH
  ) {
    issues.push({
      path: `${path}.formula`,
      code: "invalid-value",
      message: "Invalid measure formula",
    });
  }
}

function validateMeasures(value: unknown, path: string, issues: DataModelIssueSink): void {
  if (!Array.isArray(value) || value.length > MAX_MEASURES) {
    issues.push({ path, code: "resource-limit", message: "Invalid measure list" });
    return;
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  value.forEach((measure, index) => {
    const shapeIssues: DataModelIssue[] = [];
    validateMeasureShape(measure, `${path}[${index}]`, shapeIssues);
    issues.push(...shapeIssues);
    if (shapeIssues.length > 0) return;

    const { id, name } = measure as Measure;
    if (ids.has(id) || names.has(name.toLowerCase())) {
      issues.push({
        path: `${path}[${index}]`,
        code: "duplicate-id",
        message: "Duplicate measure identity",
      });
    }
    ids.add(id);
    names.add(name.toLowerCase());
  });
}

/** A detached copy containing only the measure's defined properties. */
export function cloneMeasure(measure: Measure): Measure {
  return { id: measure.id, name: measure.name, table: measure.table, formula: measure.formula };
}

/** Insert a measure, or replace the one with its ID in place. */
export function withMeasure(model: DataModel | undefined, measure: Measure): DataModel {
  const measures = (model?.measures ?? []).map(cloneMeasure);
  const index = measures.findIndex((candidate) => candidate.id === measure.id);
  if (index < 0) measures.push(cloneMeasure(measure));
  else measures[index] = cloneMeasure(measure);
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
  validateMeasures(withMeasure(model, measure).measures, "dataModel.measures", issues);
  const table = sheets
    .flatMap((sheet) => sheet.tables ?? [])
    .find((table) => table.id === measure.table);
  if (
    !table ||
    table.columns.some((column) => column.name.toLowerCase() === measure.name.toLowerCase())
  ) {
    issues.push({
      path: "measure.table",
      code: "missing-reference",
      message: "Measure needs a home table and a distinct name",
    });
  }
}
