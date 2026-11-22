import type {
  ConformanceCase,
  ConformanceCorpus,
  ConformanceManifest,
  ConformanceObservation,
  KnownDivergence,
  OfflineConformanceResult,
  ReviewedObservation,
} from "../../../scripts/conformance/types.js";

export type CompatibilityResultStatus =
  | "local-pass"
  | "result-unavailable"
  | "reviewed-pass"
  | "known-difference"
  | "unsupported"
  | "warning"
  | "regression";

export interface CompatibilityResultSource {
  readonly authorship: ConformanceCase["source"]["authorship"];
  readonly license: string;
  readonly section: string;
  readonly sha256: string;
  readonly title: string;
  readonly url: string;
}

export interface CompatibilityResultEvidence {
  readonly basis: ConformanceCase["evidence"]["basis"];
  readonly kind: ConformanceCase["evidence"]["kind"];
  readonly description: string;
}

export interface CompatibilityResultObservation {
  readonly testedApp: ConformanceObservation["producer"];
  readonly version: string;
  readonly capturedAt: string;
  readonly reviewStatus: ConformanceObservation["status"];
  readonly result?: ConformanceObservation["result"];
  readonly evidenceFileChecksum?: string;
  readonly notes?: string;
  readonly differences: readonly string[];
}

export interface CompatibilityResultCase {
  readonly position: number;
  readonly id: string;
  readonly label: string;
  readonly kind: ConformanceCase["kind"];
  readonly area: ConformanceCase["area"];
  readonly category: ConformanceCase["category"];
  readonly family: string;
  readonly behavior: ConformanceCase["dialect"];
  readonly featureValue: string;
  readonly featureLabel: string;
  readonly statusTags: readonly CompatibilityResultStatus[];
  readonly formula?: string;
  readonly target?: string;
  readonly inputs?: ConformanceCase["inputs"];
  readonly operations?: ConformanceCase["operations"];
  readonly expected: ConformanceCase["expected"];
  readonly tolerance: ConformanceCase["tolerance"];
  readonly knownDifference?: KnownDivergence;
  readonly unsupported: boolean;
  readonly sourceIndex: number;
  readonly evidenceIndex: number;
  readonly testChecksum: string;
  readonly observations: readonly CompatibilityResultObservation[];
}

export interface CompatibilityResults {
  readonly schemaVersion: 1;
  readonly testSet: {
    readonly version: number;
    readonly libraryVersion: string;
    readonly checksum: string;
    readonly totalTests: number;
    readonly publishedExamples: number;
    readonly formulaTests: number;
    readonly editSequenceTests: number;
    readonly workbookTests: number;
    readonly localPassed: number;
    readonly reviewedResults: number;
    readonly missingReviewedResults: number;
    readonly unsupported: number;
    /** Why the unsupported checks are not counted: one entry per reason. */
    readonly unsupportedReasons: readonly CompatibilityUnsupportedReason[];
    readonly warningChecks: number;
    readonly knownDifferences: number;
    readonly regressions: number;
  };
  readonly filterOptions: {
    readonly features: ReadonlyArray<{ readonly value: string; readonly label: string }>;
    readonly behaviors: readonly ConformanceCase["dialect"][];
    readonly statuses: readonly CompatibilityResultStatus[];
  };
  readonly sources: readonly CompatibilityResultSource[];
  readonly evidence: readonly CompatibilityResultEvidence[];
  readonly cases: readonly CompatibilityResultCase[];
}

interface BuildCompatibilityResultsOptions {
  readonly corpus: ConformanceCorpus;
  readonly manifest: ConformanceManifest;
  readonly offline: OfflineConformanceResult;
  readonly libraryVersion: string;
  readonly compareObservation: (
    expected: ConformanceCase["expected"],
    observation: ReviewedObservation,
    knownDifference?: KnownDivergence,
  ) => readonly string[];
}

function title_case(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function operation_label(entry: ConformanceCase): string {
  const operations = (entry.operations ?? [])
    .map((operation) => operation.op)
    .filter((operation): operation is string => typeof operation === "string");
  if (operations.length === 0) return title_case(entry.feature ?? entry.family);
  const visible = operations.slice(0, 2).map(title_case).join(" + ");
  return operations.length > 2 ? `${visible} + ${operations.length - 2} more` : visible;
}

function feature(entry: ConformanceCase): { value: string; label: string } {
  if (entry.subject) {
    return {
      value: `${entry.subject.kind}:${entry.subject.name}`,
      label: `${title_case(entry.subject.kind)} · ${entry.subject.name}`,
    };
  }
  if (entry.kind === "mutation") {
    return { value: "feature:edit-sequences", label: "Feature · Edit sequences" };
  }
  const value = entry.feature === "workbook-canary" ? "workbook-round-trip" : "workbook-changes";
  const label = entry.feature === "workbook-canary" ? "Workbook round-trip" : "Workbook changes";
  return { value: `feature:${value}`, label: `Feature · ${label}` };
}

function case_label(entry: ConformanceCase): string {
  if (entry.subject) return `${entry.subject.name} · ${title_case(entry.category)}`;
  return `${operation_label(entry)} · ${title_case(entry.category)}`;
}

function unique_index<Value>(values: Value[], value: Value): number {
  const serialized = JSON.stringify(value);
  const existing = values.findIndex((candidate) => JSON.stringify(candidate) === serialized);
  if (existing >= 0) return existing;
  values.push(value);
  return values.length - 1;
}

export interface CompatibilityUnsupportedReason {
  /** The checked evidence text the checks give as their reason. */
  readonly reason: string;
  readonly tests: number;
  /** The functions, operators or operations those checks exercise. */
  readonly subjects: readonly string[];
}

/** The unsupported checks grouped by the reason their evidence gives. */
function unsupported_reasons(cases: readonly ConformanceCase[]): CompatibilityUnsupportedReason[] {
  const groups = new Map<string, { tests: number; subjects: Set<string> }>();
  for (const entry of cases) {
    if (entry.unsupported !== true) continue;
    const group = groups.get(entry.evidence.oracle) ?? { tests: 0, subjects: new Set<string>() };
    group.tests += 1;
    group.subjects.add(entry.subject?.name ?? operation_label(entry));
    groups.set(entry.evidence.oracle, group);
  }
  return [...groups].map(([reason, group]) => ({
    reason,
    tests: group.tests,
    subjects: [...group.subjects],
  }));
}

export function buildCompatibilityResults({
  corpus,
  manifest,
  offline,
  libraryVersion,
  compareObservation,
}: BuildCompatibilityResultsOptions): CompatibilityResults {
  const expected_total =
    manifest.counts.formula + manifest.counts.mutation + manifest.counts.workbook;
  if (corpus.protocol !== manifest.protocol) {
    throw new Error("compatibility test set version does not match its checked summary");
  }
  if (corpus.cases.length !== expected_total || manifest.caseSha256.length !== expected_total) {
    throw new Error("compatibility test count does not match its checked summary");
  }
  if (offline.checked !== expected_total) {
    throw new Error("local compatibility check count does not match the checked test set");
  }

  const sources: CompatibilityResultSource[] = [];
  const evidence: CompatibilityResultEvidence[] = [];
  const unsupported_ids = new Set(offline.unsupported);
  const all_cases = corpus.cases.map((entry, index): CompatibilityResultCase => {
    const entry_feature = feature(entry);
    const observations = entry.observations.map((observation): CompatibilityResultObservation => ({
      testedApp: observation.producer,
      version: observation.producerVersion,
      capturedAt: observation.capturedAt,
      reviewStatus: observation.status,
      ...(observation.result ? { result: observation.result } : {}),
      ...(observation.artifactSha256 ? { evidenceFileChecksum: observation.artifactSha256 } : {}),
      ...(observation.notes ? { notes: observation.notes } : {}),
      differences:
        observation.status === "reviewed"
          ? [...compareObservation(entry.expected, observation, entry.knownDivergence)]
          : [],
    }));
    const reviewed = observations.filter((observation) => observation.reviewStatus === "reviewed");
    const statuses: CompatibilityResultStatus[] = [];
    const unsupported = entry.unsupported === true;
    if (unsupported) {
      statuses.push("unsupported");
    } else {
      statuses.push("local-pass");
      if (reviewed.length === 0) statuses.push("result-unavailable");
      if (reviewed.some((observation) => observation.differences.length === 0)) {
        statuses.push("reviewed-pass");
      }
    }
    if (entry.knownDivergence) statuses.push("known-difference");
    if ((entry.operations ?? []).some((operation) => operation.op === "warnings")) {
      statuses.push("warning");
    }
    if (reviewed.some((observation) => observation.differences.length > 0)) {
      statuses.push("regression");
    }

    return {
      position: index + 1,
      id: entry.id,
      label: case_label(entry),
      kind: entry.kind,
      area: entry.area,
      category: entry.category,
      family: entry.family,
      behavior: entry.dialect,
      featureValue: entry_feature.value,
      featureLabel: entry_feature.label,
      statusTags: statuses,
      ...(entry.formula ? { formula: entry.formula } : {}),
      ...(entry.target ? { target: entry.target } : {}),
      ...(entry.inputs ? { inputs: entry.inputs } : {}),
      ...(entry.operations ? { operations: entry.operations } : {}),
      expected: entry.expected,
      tolerance: entry.tolerance,
      ...(entry.knownDivergence ? { knownDifference: entry.knownDivergence } : {}),
      unsupported,
      sourceIndex: unique_index(sources, entry.source),
      evidenceIndex: unique_index(evidence, {
        basis: entry.evidence.basis,
        kind: entry.evidence.kind,
        description: entry.evidence.oracle,
      }),
      testChecksum: case_checksum(manifest, index),
      observations,
    };
  });

  const actual_unsupported = all_cases.filter((entry) => entry.unsupported).length;
  if (actual_unsupported !== unsupported_ids.size) {
    throw new Error("unsupported compatibility count does not match the local check result");
  }
  for (const entry of all_cases) {
    if (entry.unsupported !== unsupported_ids.has(entry.id)) {
      throw new Error(`unsupported compatibility result drifted for ${entry.id}`);
    }
  }
  const missing_reviewed = all_cases.filter(
    (entry) => !entry.unsupported && entry.statusTags.includes("result-unavailable"),
  ).length;
  if (missing_reviewed !== offline.deferred) {
    throw new Error("missing reviewed result count does not match the local check result");
  }

  const feature_options = new Map<string, string>();
  for (const entry of all_cases) feature_options.set(entry.featureValue, entry.featureLabel);
  const statuses = [
    "local-pass",
    "result-unavailable",
    "reviewed-pass",
    "known-difference",
    "unsupported",
    "warning",
    "regression",
  ] as const satisfies readonly CompatibilityResultStatus[];

  const selected_ids = new Set<string>();
  const selected_features = new Set<string>();
  for (const entry of all_cases) {
    if (selected_features.has(entry.featureValue)) continue;
    selected_features.add(entry.featureValue);
    selected_ids.add(entry.id);
  }
  for (const status of statuses) {
    const representative = all_cases.find((entry) => entry.statusTags.includes(status));
    if (representative) selected_ids.add(representative.id);
  }
  for (const kind of ["formula", "mutation", "workbook"] as const) {
    const representative = all_cases.find((entry) => entry.kind === kind);
    if (representative) selected_ids.add(representative.id);
  }
  for (const category of [
    "normal",
    "empty",
    "mixed",
    "error",
    "boundary",
    "range-array",
    "mutation",
  ] as const) {
    const representative = all_cases.find((entry) => entry.category === category);
    if (representative) selected_ids.add(representative.id);
  }
  const cases = all_cases.filter((entry) => selected_ids.has(entry.id));

  return {
    schemaVersion: 1,
    testSet: {
      version: corpus.protocol,
      libraryVersion,
      checksum: manifest.corpusSha256,
      totalTests: expected_total,
      publishedExamples: cases.length,
      formulaTests: manifest.counts.formula,
      editSequenceTests: manifest.counts.mutation,
      workbookTests: manifest.counts.workbook,
      localPassed: offline.checked - offline.unsupported.length,
      reviewedResults: offline.reviewed,
      missingReviewedResults: offline.deferred,
      unsupported: offline.unsupported.length,
      unsupportedReasons: unsupported_reasons(corpus.cases),
      warningChecks: all_cases.filter((entry) => entry.statusTags.includes("warning")).length,
      knownDifferences: all_cases.filter((entry) => entry.statusTags.includes("known-difference"))
        .length,
      regressions: all_cases.filter((entry) => entry.statusTags.includes("regression")).length,
    },
    filterOptions: {
      features: [...feature_options].map(([value, label]) => ({ value, label })),
      behaviors: [...new Set(all_cases.map((entry) => entry.behavior))],
      statuses,
    },
    sources,
    evidence,
    cases,
  };
}

/** The manifest digest of one corpus case; the manifest lists one per case. */
function case_checksum(manifest: ConformanceManifest, index: number): string {
  const checksum = manifest.caseSha256[index];
  if (checksum === undefined)
    throw new Error(`Conformance manifest has no digest for case ${index}`);

  return checksum;
}
