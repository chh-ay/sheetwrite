import type { CellScalar } from "../../packages/core/src/types/cell.js";

export type ResultType =
  | "blank"
  | "boolean"
  | "number"
  | "string"
  | "error"
  | "array"
  | "workbook"
  | "unsupported";

export type ConformanceProducer =
  | "excel-desktop"
  | "excel-web"
  | "google-sheets"
  | "libreoffice"
  | "sheetwrite";

/** How far a numeric result may differ from its expectation. */
export interface ResultTolerance {
  kind: "absolute" | "relative" | "ulp";
  value: number;
}

/** A single-cell result. */
export type CellResult = Extract<
  ConformanceResult,
  { type: "blank" | "boolean" | "number" | "string" | "error" }
>;

/** One cell or workbook result; each type carries exactly the fields it needs. */
export type ConformanceResult =
  | { type: "blank"; formula?: string; displayedText?: string }
  | { type: "boolean"; value: boolean; formula?: string; displayedText?: string }
  | {
      type: "number";
      value: number;
      displayedText?: string;
      formula?: string;
      tolerance?: ResultTolerance;
    }
  | { type: "string"; value: string; formula?: string; displayedText?: string }
  | { type: "error"; error: string; formula?: string; displayedText?: string }
  | {
      type: "array";
      value: readonly (readonly unknown[])[];
      rows: number;
      columns: number;
      formula?: string;
    }
  | { type: "workbook"; value: unknown }
  | { type: "unsupported" };

export type SemanticCategory =
  | "normal"
  | "empty"
  | "mixed"
  | "error"
  | "boundary"
  | "range-array"
  | "mutation";

export interface CaseTolerance {
  kind: "exact" | "absolute" | "relative" | "ulp";
  value?: number;
}

export interface EvidenceDescriptor {
  kind: "property" | "metamorphic" | "pinned-observation";
  basis: "documented-semantics" | "property-invariant" | "producer-observation";
  oracle: string;
}

export interface FormulaSubject {
  kind: "function" | "operator";
  name: string;
}

export interface FormulaInventoryFunction {
  canonical: string;
  family: string;
  signature: string;
  semantics: string;
  contractStatus: "supported" | "required-supported";
  builds: readonly ("@sheetwrite/wasm" | "@sheetwrite/formulas")[];
  [key: string]: unknown;
}

export interface FormulaInventoryOperator {
  canonical: string;
  token: string;
  fixity: "prefix" | "infix" | "postfix";
  family: "operator";
  contractStatus: "supported" | "required-supported";
  source: string;
  section: string;
  [key: string]: unknown;
}

export interface FormulaInventory {
  contract: "sheetwrite.formula-capabilities";
  version: 1;
  sources: Record<string, { title: string; link: string }>;
  families: Record<string, { title: string; source: string; section: string }>;
  semanticsProfiles: Record<string, unknown>;
  functions: FormulaInventoryFunction[];
  operators: FormulaInventoryOperator[];
  [key: string]: unknown;
}

export interface ConformanceManifest {
  protocol: 1;
  generator: "sheetwrite.conformance.original-evidence";
  generatorVersion: 1;
  corpusPath: string;
  corpusSha256: string;
  inventoryPath: string;
  inventorySha256: string;
  supportedNamesSha256: string;
  categoriesSha256: string;
  operationShapesSha256: string;
  featureCounts: Record<string, number>;
  caseSha256: string[];
  counts: {
    formula: number;
    mutation: number;
    workbook: number;
    localCanary: number;
    supportedFunctions: number;
    supportedOperators: number;
  };
  minimums: {
    formula: 2000;
    mutation: 250;
    workbook: 100;
  };
}

interface ObservationCommon {
  producer: ConformanceProducer;
  producerVersion: string;
  capturedAt: string;
  artifactSha256?: string;
  notes?: string;
}

/** A reviewed observation always records the producer's result. */
export interface ReviewedObservation extends ObservationCommon {
  status: "reviewed";
  result: ConformanceResult;
}

/** A producer result captured but not reviewed, or a producer that could not run the case. */
export interface UnreviewedObservation extends ObservationCommon {
  status: "provisional" | "unavailable";
  result?: ConformanceResult;
}

export type ConformanceObservation = ReviewedObservation | UnreviewedObservation;

export interface KnownDivergence {
  reason: string;
  producers: ConformanceProducer[];
  alternate: ConformanceResult;
}

/**
 * Iterative calculation a circular-reference case turns on. Producers apply it
 * to the whole capture workbook, so every case that sets it uses the same value.
 */
export interface CaseCalculation {
  iterate: true;
  maxIterations: number;
  maxChange: number;
}

export interface ConformanceCase {
  id: string;
  area: "formula" | "mutation" | "workbook" | "xlsx";
  feature?: string;
  dialect: "shared" | "excel" | "google-sheets" | "openformula";
  category: SemanticCategory;
  family: string;
  kind: "formula" | "mutation" | "workbook";
  subject?: FormulaSubject;
  source: {
    title: string;
    section: string;
    url: string;
    sha256: string;
    license: string;
    authorship: "original" | "spec-derived" | "producer-observation";
    notice?: string;
  };
  evidence: EvidenceDescriptor;
  tolerance: CaseTolerance;
  inputs?: Array<{ cell: string; value: CellScalar }>;
  numberFormat?: string;
  formula?: string;
  target?: string;
  operations?: Array<Record<string, unknown>>;
  calculation?: CaseCalculation;
  expected: ConformanceResult;
  observations: ConformanceObservation[];
  knownDivergence?: KnownDivergence;
  unsupported?: boolean;
  localCanary?: boolean;
}

export interface ConformanceCorpus {
  protocol: 1;
  license: string;
  cases: ConformanceCase[];
}

export interface CaptureObservation {
  caseId: string;
  result: ConformanceResult;
}

export interface CaptureArtifact {
  protocol: 1;
  producer: ConformanceProducer;
  producerVersion: string;
  capturedAt: string;
  observations: CaptureObservation[];
  [key: string]: unknown;
}

export interface OfflineConformanceResult {
  status: "verified" | "blocked";
  checked: number;
  reviewed: number;
  localCanaries: number;
  deferred: number;
  warnings: string[];
  unsupported: string[];
}
