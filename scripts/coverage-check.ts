import { relative, resolve, sep } from "node:path";

export type CoverageLanguage = "typescript" | "rust";
export type CoverageMetricName = "lines" | "functions" | "regions";

export interface CoverageCounts {
  readonly covered: number;
  readonly total: number;
}

export interface CoverageRecord {
  readonly path: string;
  readonly lines: CoverageCounts;
  readonly functions: CoverageCounts;
  readonly regions?: CoverageCounts;
  readonly uncoveredLines: readonly number[];
  readonly lineCounts?: ReadonlyMap<number, number>;
}

export interface CoverageFloor {
  readonly lines: number;
  readonly functions: number;
  readonly regions?: number;
}

export interface CoverageExclusion {
  readonly path: string;
  readonly reason: string;
}

/** Aggregate per-language floors plus the runtime files that are deliberately not scored. */
export interface CoveragePolicy {
  readonly schemaVersion: number;
  readonly floors: Readonly<Record<CoverageLanguage, CoverageFloor>>;
  readonly exclusions: readonly CoverageExclusion[];
}

export interface LcovRecord extends CoverageRecord {
  readonly lineCounts: ReadonlyMap<number, number>;
}

export const COVERAGE_SCHEMA_VERSION = 3;
const COVERAGE_METRICS = ["lines", "functions", "regions"] as const;

const CONTAMINATED_SEGMENTS = new Set(["dist", "test", "tests", "node_modules", "examples"]);
const INTEGER = /^\d+$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function finiteNonNegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${label} must be a finite non-negative integer`);
  }
  return value;
}

function lcovInteger(raw: string, label: string): number {
  if (!INTEGER.test(raw)) throw new Error(`${label} must be a finite non-negative integer`);
  const value = Number(raw);
  return finiteNonNegativeInteger(value, label);
}

export function normalizeSourcePath(path: string, root: string): string {
  if (typeof path !== "string" || path.trim() === "")
    throw new Error("Coverage source path is empty");
  const normalizedInput = path.replaceAll("\\", "/");
  const absolute = normalizedInput.startsWith("/")
    ? resolve(normalizedInput)
    : resolve(root, normalizedInput);
  const repositoryRoot = resolve(root);
  const repositoryPath = relative(repositoryRoot, absolute);
  if (
    repositoryPath === "" ||
    repositoryPath === ".." ||
    repositoryPath.startsWith(`..${sep}`) ||
    repositoryPath.startsWith("/")
  ) {
    throw new Error(`Coverage source escapes repository root: ${path}`);
  }
  return repositoryPath.split(sep).join("/");
}

function finaliseLcovRecord(
  rawPath: string | undefined,
  root: string,
  lineCounts: Map<number, number>,
  fields: Map<string, number>,
): LcovRecord {
  if (!rawPath) throw new Error("LCOV record is missing SF");
  const path = normalizeSourcePath(rawPath, root);
  const lines = {
    covered: [...lineCounts.values()].filter((count) => count > 0).length,
    total: lineCounts.size,
  };
  const functions = {
    covered: fields.get("FNH") ?? 0,
    total: fields.get("FNF") ?? 0,
  };
  if (functions.covered > functions.total) {
    throw new Error(`LCOV FNH exceeds FNF for ${path}`);
  }
  if (fields.has("LF") && fields.get("LF") !== lines.total) {
    throw new Error(`LCOV LF does not match DA records for ${path}`);
  }
  if (fields.has("LH") && fields.get("LH") !== lines.covered) {
    throw new Error(`LCOV LH does not match DA records for ${path}`);
  }
  return {
    path,
    lines,
    functions,
    uncoveredLines: [...lineCounts]
      .filter(([, count]) => count === 0)
      .map(([line]) => line)
      .sort((left, right) => left - right),
    lineCounts,
  };
}

/** Parse the line/function subset emitted by both Bun and cargo-llvm-cov. */
export function parseLcov(
  text: string,
  root: string,
  lineSummary: "validate" | "recompute" = "validate",
): readonly LcovRecord[] {
  if (typeof text !== "string" || text.trim() === "") throw new Error("LCOV report is empty");
  const records: LcovRecord[] = [];
  const paths = new Set<string>();
  let rawPath: string | undefined;
  let lineCounts = new Map<number, number>();
  let fields = new Map<string, number>();
  let active = false;

  for (const [zeroBasedLine, rawLine] of text.split(/\r?\n/).entries()) {
    const reportLine = zeroBasedLine + 1;
    if (rawLine === "") continue;
    if (rawLine.startsWith("TN:")) {
      if (active) throw new Error(`Unexpected TN inside LCOV record at line ${reportLine}`);
      continue;
    }
    if (rawLine.startsWith("SF:")) {
      if (active) throw new Error(`Duplicate/nested SF at LCOV line ${reportLine}`);
      active = true;
      rawPath = rawLine.slice(3);
      lineCounts = new Map();
      fields = new Map();
      continue;
    }
    if (!active) throw new Error(`LCOV data outside a source record at line ${reportLine}`);
    if (rawLine.startsWith("DA:")) {
      const fieldsRaw = rawLine.slice(3).split(",");
      if (fieldsRaw.length < 2) throw new Error(`Malformed LCOV DA at line ${reportLine}`);
      const line = lcovInteger(fieldsRaw[0]!, `LCOV DA line at report line ${reportLine}`);
      if (line === 0) throw new Error(`LCOV DA source line must be positive at line ${reportLine}`);
      const count = lcovInteger(fieldsRaw[1]!, `LCOV DA count at report line ${reportLine}`);
      if (lineCounts.has(line)) throw new Error(`Duplicate LCOV DA source line ${line}`);
      lineCounts.set(line, count);
      continue;
    }
    const summary = rawLine.match(/^(FNF|FNH|LF|LH):(.*)$/);
    if (summary) {
      const key = summary[1]!;
      if (fields.has(key)) throw new Error(`Duplicate LCOV ${key} field`);
      fields.set(key, lcovInteger(summary[2]!, `LCOV ${key}`));
      continue;
    }
    if (rawLine.startsWith("FN:") || rawLine.startsWith("FNDA:") || rawLine.startsWith("BR")) {
      // Function names and branches are not used for Bun scoring. Their counters are
      // represented by FNF/FNH; Rust region data comes from LLVM JSON.
      continue;
    }
    if (rawLine === "end_of_record") {
      if (lineSummary === "recompute") {
        fields.delete("LF");
        fields.delete("LH");
      }
      const record = finaliseLcovRecord(rawPath, root, lineCounts, fields);
      if (paths.has(record.path)) throw new Error(`Duplicate LCOV source record: ${record.path}`);
      paths.add(record.path);
      records.push(record);
      active = false;
      rawPath = undefined;
      continue;
    }
    throw new Error(`Unknown LCOV field at line ${reportLine}: ${rawLine}`);
  }
  if (active) throw new Error("LCOV report ended before end_of_record");
  if (records.length === 0) throw new Error("LCOV report contains no source records");
  return records;
}

/**
 * Merge independently collected Bun reports without double-counting function
 * definitions. Bun's LCOV omits function identities, so the maximum covered
 * function count is a conservative lower bound across shards.
 */
export function mergeLcovRecords(
  reports: readonly (readonly LcovRecord[])[],
): readonly LcovRecord[] {
  if (reports.length === 0) throw new Error("No LCOV reports to merge");
  const byPath = new Map<string, LcovRecord[]>();
  for (const report of reports) {
    for (const record of report) {
      const records = byPath.get(record.path) ?? [];
      records.push(record);
      byPath.set(record.path, records);
    }
  }
  return [...byPath]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, records]) => {
      const lineCounts = new Map<number, number>();
      for (const record of records) {
        for (const [line, count] of record.lineCounts) {
          lineCounts.set(line, (lineCounts.get(line) ?? 0) + count);
        }
      }
      const orderedLineCounts = new Map([...lineCounts].sort(([left], [right]) => left - right));
      return {
        path,
        lines: {
          covered: [...orderedLineCounts.values()].filter((count) => count > 0).length,
          total: orderedLineCounts.size,
        },
        functions: {
          covered: Math.max(...records.map((record) => record.functions.covered)),
          total: Math.max(...records.map((record) => record.functions.total)),
        },
        uncoveredLines: [...orderedLineCounts]
          .filter(([, count]) => count === 0)
          .map(([line]) => line),
        lineCounts: orderedLineCounts,
      };
    });
}

function isRustInlineTestSymbol(name: string): boolean {
  // Rust 1.96's v0 mangling encodes the path segment `tests` as `5tests`.
  // cargo-llvm-cov drops a separate tests.rs, but not inline #[cfg(test)] modules.
  return name.includes("5tests");
}

function rustRegion(
  value: unknown,
  label: string,
): readonly [number, number, number, number, number, number, number, number] {
  if (!Array.isArray(value) || value.length < 8) throw new Error(`${label} is malformed`);
  return value
    .slice(0, 8)
    .map((item, index) =>
      finiteNonNegativeInteger(item, `${label}[${index}]`),
    ) as unknown as readonly [number, number, number, number, number, number, number, number];
}

/**
 * Normalize LLVM JSON while removing regions/functions belonging to inline
 * `#[cfg(test)] mod tests`. Line counters come from the matching LCOV report;
 * function/region definitions are grouped by source location to collapse Rust
 * monomorph instantiations exactly as llvm-cov's file summary does.
 */
export function normalizeRustCoverage(
  raw: unknown,
  lcovRecords: readonly LcovRecord[],
  root: string,
): readonly CoverageRecord[] {
  assertRecord(raw, "LLVM JSON");
  if (!Array.isArray(raw.data) || raw.data.length !== 1) {
    throw new Error("LLVM JSON must contain exactly one data report");
  }
  const data = raw.data[0];
  assertRecord(data, "LLVM JSON data report");
  if (!Array.isArray(data.files) || !Array.isArray(data.functions)) {
    throw new Error("LLVM JSON is missing files/functions arrays");
  }

  const reportedFilenames = new Set<string>();
  for (const [fileIndex, value] of data.files.entries()) {
    assertRecord(value, `LLVM file ${fileIndex}`);
    if (typeof value.filename !== "string") {
      throw new Error(`LLVM file ${fileIndex} filename is invalid`);
    }
    reportedFilenames.add(value.filename);
  }

  const lcovByPath = new Map(lcovRecords.map((record) => [record.path, record]));
  const functions = data.functions.map((value, index) => {
    assertRecord(value, `LLVM function ${index}`);
    if (
      typeof value.name !== "string" ||
      !Array.isArray(value.filenames) ||
      !Array.isArray(value.regions)
    ) {
      throw new Error(`LLVM function ${index} has an invalid schema`);
    }
    const count = finiteNonNegativeInteger(value.count, `LLVM function ${index} count`);
    const filenames = value.filenames
      .filter((filename, filenameIndex) => {
        if (typeof filename !== "string") {
          throw new Error(`LLVM function ${index} filename ${filenameIndex} is invalid`);
        }
        return reportedFilenames.has(filename);
      })
      .map((filename) => normalizeSourcePath(filename as string, root));
    return {
      name: value.name,
      count,
      filenames,
      regions: value.regions.map((region, regionIndex) =>
        rustRegion(region, `LLVM function ${index} region ${regionIndex}`),
      ),
    };
  });

  const result: CoverageRecord[] = [];
  const seen = new Set<string>();
  for (const [fileIndex, value] of data.files.entries()) {
    assertRecord(value, `LLVM file ${fileIndex}`);
    if (typeof value.filename !== "string")
      throw new Error(`LLVM file ${fileIndex} filename is invalid`);
    const path = normalizeSourcePath(value.filename, root);
    if (seen.has(path)) throw new Error(`Duplicate LLVM source record: ${path}`);
    seen.add(path);
    const lcov = lcovByPath.get(path);
    if (!lcov) throw new Error(`LLVM JSON source is missing from LCOV: ${path}`);

    const fileFunctions = functions.filter((fn) => fn.filenames.includes(path));
    const testFunctions = fileFunctions.filter((fn) => isRustInlineTestSymbol(fn.name));
    const productionFunctions = fileFunctions.filter((fn) => !isRustInlineTestSymbol(fn.name));
    const testRanges = testFunctions.flatMap((fn) =>
      fn.regions.map((region) => ({ start: region[0], end: region[2] })),
    );
    const lineCounts = new Map(
      [...lcov.lineCounts].filter(
        ([line]) => !testRanges.some((range) => line >= range.start && line <= range.end),
      ),
    );

    const definitions = new Map<string, number[]>();
    const regions = new Map<string, number[]>();
    for (const fn of productionFunctions) {
      const first = fn.regions[0];
      if (first) {
        const key = `${first[0]}:${first[1]}`;
        const counts = definitions.get(key) ?? [];
        counts.push(fn.count);
        definitions.set(key, counts);
      }
      for (const region of fn.regions) {
        if (region[7] !== 0) continue;
        const key = `${region[0]}:${region[1]}:${region[2]}:${region[3]}`;
        const counts = regions.get(key) ?? [];
        counts.push(region[4]);
        regions.set(key, counts);
      }
    }

    result.push({
      path,
      lines: {
        covered: [...lineCounts.values()].filter((count) => count > 0).length,
        total: lineCounts.size,
      },
      functions: {
        covered: [...definitions.values()].filter((counts) => counts.some((count) => count > 0))
          .length,
        total: definitions.size,
      },
      regions: {
        covered: [...regions.values()].filter((counts) => counts.some((count) => count > 0)).length,
        total: regions.size,
      },
      uncoveredLines: [...lineCounts]
        .filter(([, count]) => count === 0)
        .map(([line]) => line)
        .sort((left, right) => left - right),
      lineCounts,
    });
  }
  return result;
}

export function isCoverageContamination(path: string): boolean {
  const segments = path.split("/");
  return (
    segments.some((segment) => CONTAMINATED_SEGMENTS.has(segment)) ||
    path.endsWith(".d.ts") ||
    path.includes("/pkg/") ||
    path.includes("wasm-bindgen")
  );
}

export function filterRuntimeRecords(
  records: readonly CoverageRecord[],
  runtimePaths: ReadonlySet<string>,
): readonly CoverageRecord[] {
  return records.filter((record) => runtimePaths.has(record.path));
}

const POLICY_KEYS: Readonly<Record<string, true>> = {
  schemaVersion: true,
  floors: true,
  exclusions: true,
};
const FLOOR_LANGUAGE_KEYS: Readonly<Record<string, true>> = { typescript: true, rust: true };
const METRIC_KEYS: Readonly<Record<string, true>> = {
  lines: true,
  functions: true,
  regions: true,
};
const EXCLUSION_KEYS: Readonly<Record<string, true>> = { path: true, reason: true };

function validateKeys(
  value: Record<string, unknown>,
  allowed: Readonly<Record<string, true>>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (allowed[key] !== true) throw new Error(`${label} has an unknown field: ${key}`);
  }
}

function validateText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be non-empty`);
}

function validateRepositoryPath(value: unknown, label: string): asserts value is string {
  validateText(value, label);
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) {
    throw new Error(`${label} must be repository-relative`);
  }
}

function parsePercent(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be an integer percentage`);
  }
  return value;
}

function parseFloor(raw: unknown, language: CoverageLanguage): CoverageFloor {
  const label = `Coverage ${language} floor`;
  assertRecord(raw, label);
  validateKeys(raw, METRIC_KEYS, label);
  const lines = parsePercent(raw.lines, `${label} lines`);
  const functions = parsePercent(raw.functions, `${label} functions`);
  if (raw.regions === undefined) return { lines, functions };
  return { lines, functions, regions: parsePercent(raw.regions, `${label} regions`) };
}

export function parseCoveragePolicy(raw: unknown): CoveragePolicy {
  assertRecord(raw, "Coverage policy");
  validateKeys(raw, POLICY_KEYS, "Coverage policy");
  if (raw.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported coverage policy schema version: ${String(raw.schemaVersion)}`);
  }
  assertRecord(raw.floors, "Coverage policy floors");
  validateKeys(raw.floors, FLOOR_LANGUAGE_KEYS, "Coverage policy floors");
  const floors = {
    typescript: parseFloor(raw.floors.typescript, "typescript"),
    rust: parseFloor(raw.floors.rust, "rust"),
  };
  if (!Array.isArray(raw.exclusions))
    throw new Error("Coverage policy exclusions must be an array");
  const excludedPaths = new Set<string>();
  const exclusions = raw.exclusions.map((value, index): CoverageExclusion => {
    const label = `Coverage exclusion ${index}`;
    assertRecord(value, label);
    validateKeys(value, EXCLUSION_KEYS, label);
    validateRepositoryPath(value.path, `${label} path`);
    validateText(value.reason, `${label} reason`);
    if (excludedPaths.has(value.path))
      throw new Error(`Duplicate coverage exclusion: ${value.path}`);
    excludedPaths.add(value.path);
    return { path: value.path, reason: value.reason };
  });
  return { schemaVersion: COVERAGE_SCHEMA_VERSION, floors, exclusions };
}

/** Every discovered runtime file is scored unless the policy excludes it with a reason. */
export function scoredRuntimePaths(
  policy: CoveragePolicy,
  language: CoverageLanguage,
  runtimePaths: readonly string[],
): ReadonlySet<string> {
  const discovered = new Set(runtimePaths);
  const excluded = new Set<string>();
  for (const exclusion of policy.exclusions) {
    const exclusionLanguage = exclusion.path.endsWith(".rs") ? "rust" : "typescript";
    if (exclusionLanguage !== language) continue;
    if (!discovered.has(exclusion.path)) {
      throw new Error(`Coverage exclusion has no runtime source file: ${exclusion.path}`);
    }
    excluded.add(exclusion.path);
  }
  return new Set(runtimePaths.filter((path) => !excluded.has(path)));
}

function assertCounts(counts: CoverageCounts, label: string): void {
  finiteNonNegativeInteger(counts.covered, `${label} covered`);
  finiteNonNegativeInteger(counts.total, `${label} total`);
  if (counts.covered > counts.total) throw new Error(`${label} covered exceeds total`);
}

export type CoverageTotals = Readonly<Partial<Record<CoverageMetricName, CoverageCounts>>>;

/** Sum scored records and fail when an aggregate metric falls below the language floor. */
export function evaluateCoveragePolicy(options: {
  readonly policy: CoveragePolicy;
  readonly language: CoverageLanguage;
  readonly records: readonly CoverageRecord[];
  readonly scoredPaths: ReadonlySet<string>;
}): CoverageTotals {
  const { policy, language, records, scoredPaths } = options;
  const recordByPath = new Map<string, CoverageRecord>();
  for (const record of records) {
    if (recordByPath.has(record.path))
      throw new Error(`Duplicate normalized coverage source: ${record.path}`);
    if (isCoverageContamination(record.path)) {
      throw new Error(`Generated/test output entered scored coverage: ${record.path}`);
    }
    assertCounts(record.lines, `${record.path} lines`);
    assertCounts(record.functions, `${record.path} functions`);
    if (record.regions) assertCounts(record.regions, `${record.path} regions`);
    recordByPath.set(record.path, record);
  }
  for (const path of scoredPaths) {
    if (!recordByPath.has(path))
      throw new Error(`Coverage report is missing scored source: ${path}`);
  }

  const floor = policy.floors[language];
  const totals: Partial<Record<CoverageMetricName, CoverageCounts>> = {};
  for (const metric of COVERAGE_METRICS) {
    const minimum = floor[metric];
    if (minimum === undefined) continue;
    let covered = 0;
    let total = 0;
    for (const record of recordByPath.values()) {
      const counts = record[metric];
      if (!counts) throw new Error(`Coverage report is missing ${metric} data for ${record.path}`);
      covered += counts.covered;
      total += counts.total;
    }
    totals[metric] = { covered, total };
    if (covered * 100 < minimum * total) {
      const actual = (covered * 100) / total;
      throw new Error(
        `${language} ${metric} coverage ${actual.toFixed(2)}% (${covered}/${total}) is below the ${minimum}% floor`,
      );
    }
  }
  return totals;
}

export function serialiseNormalizedLcov(records: readonly CoverageRecord[]): string {
  return records
    .map((record) => {
      const lines = [
        "TN:",
        `SF:${record.path}`,
        `FNF:${record.functions.total}`,
        `FNH:${record.functions.covered}`,
      ];
      const lineCounts = record.lineCounts;
      if (!lineCounts) {
        throw new Error(`Normalized coverage is missing line counters for ${record.path}`);
      }
      for (const [line, count] of [...lineCounts].sort(([left], [right]) => left - right)) {
        lines.push(`DA:${line},${count}`);
      }
      lines.push(`LF:${record.lines.total}`, `LH:${record.lines.covered}`, "end_of_record");
      return lines.join("\n");
    })
    .join("\n");
}
