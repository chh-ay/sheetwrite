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

function assert_record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function finite_non_negative_integer(value: unknown, label: string): number {
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

function lcov_integer(raw: string, label: string): number {
  if (!INTEGER.test(raw)) throw new Error(`${label} must be a finite non-negative integer`);
  const value = Number(raw);
  return finite_non_negative_integer(value, label);
}

export function normalizeSourcePath(path: string, root: string): string {
  if (typeof path !== "string" || path.trim() === "")
    throw new Error("Coverage source path is empty");
  const normalized_input = path.replaceAll("\\", "/");
  const absolute = normalized_input.startsWith("/")
    ? resolve(normalized_input)
    : resolve(root, normalized_input);
  const repository_root = resolve(root);
  const repository_path = relative(repository_root, absolute);
  if (
    repository_path === "" ||
    repository_path === ".." ||
    repository_path.startsWith(`..${sep}`) ||
    repository_path.startsWith("/")
  ) {
    throw new Error(`Coverage source escapes repository root: ${path}`);
  }
  return repository_path.split(sep).join("/");
}

function finalise_lcov_record(
  raw_path: string | undefined,
  root: string,
  line_counts: Map<number, number>,
  fields: Map<string, number>,
): LcovRecord {
  if (!raw_path) throw new Error("LCOV record is missing SF");
  const path = normalizeSourcePath(raw_path, root);
  const lines = {
    covered: [...line_counts.values()].filter((count) => count > 0).length,
    total: line_counts.size,
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
    uncoveredLines: [...line_counts]
      .filter(([, count]) => count === 0)
      .map(([line]) => line)
      .sort((left, right) => left - right),
    lineCounts: line_counts,
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
  let raw_path: string | undefined;
  let line_counts = new Map<number, number>();
  let fields = new Map<string, number>();
  let active = false;

  for (const [zero_based_line, raw_line] of text.split(/\r?\n/).entries()) {
    const report_line = zero_based_line + 1;
    if (raw_line === "") continue;
    if (raw_line.startsWith("TN:")) {
      if (active) throw new Error(`Unexpected TN inside LCOV record at line ${report_line}`);
      continue;
    }
    if (raw_line.startsWith("SF:")) {
      if (active) throw new Error(`Duplicate/nested SF at LCOV line ${report_line}`);
      active = true;
      raw_path = raw_line.slice(3);
      line_counts = new Map();
      fields = new Map();
      continue;
    }
    if (!active) throw new Error(`LCOV data outside a source record at line ${report_line}`);
    if (raw_line.startsWith("DA:")) {
      const fields_raw = raw_line.slice(3).split(",");
      if (fields_raw.length < 2) throw new Error(`Malformed LCOV DA at line ${report_line}`);
      const line = lcov_integer(fields_raw[0]!, `LCOV DA line at report line ${report_line}`);
      if (line === 0)
        throw new Error(`LCOV DA source line must be positive at line ${report_line}`);
      const count = lcov_integer(fields_raw[1]!, `LCOV DA count at report line ${report_line}`);
      if (line_counts.has(line)) throw new Error(`Duplicate LCOV DA source line ${line}`);
      line_counts.set(line, count);
      continue;
    }
    const summary = raw_line.match(/^(FNF|FNH|LF|LH):(.*)$/);
    if (summary) {
      const key = summary[1]!;
      if (fields.has(key)) throw new Error(`Duplicate LCOV ${key} field`);
      fields.set(key, lcov_integer(summary[2]!, `LCOV ${key}`));
      continue;
    }
    if (raw_line.startsWith("FN:") || raw_line.startsWith("FNDA:") || raw_line.startsWith("BR")) {
      // Function names and branches are not used for Bun scoring. Their counters are
      // represented by FNF/FNH; Rust region data comes from LLVM JSON.
      continue;
    }
    if (raw_line === "end_of_record") {
      if (lineSummary === "recompute") {
        fields.delete("LF");
        fields.delete("LH");
      }
      const record = finalise_lcov_record(raw_path, root, line_counts, fields);
      if (paths.has(record.path)) throw new Error(`Duplicate LCOV source record: ${record.path}`);
      paths.add(record.path);
      records.push(record);
      active = false;
      raw_path = undefined;
      continue;
    }
    throw new Error(`Unknown LCOV field at line ${report_line}: ${raw_line}`);
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
  const by_path = new Map<string, LcovRecord[]>();
  for (const report of reports) {
    for (const record of report) {
      const records = by_path.get(record.path) ?? [];
      records.push(record);
      by_path.set(record.path, records);
    }
  }
  return [...by_path]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, records]) => {
      const line_counts = new Map<number, number>();
      for (const record of records) {
        for (const [line, count] of record.lineCounts) {
          line_counts.set(line, (line_counts.get(line) ?? 0) + count);
        }
      }
      const ordered_line_counts = new Map([...line_counts].sort(([left], [right]) => left - right));
      return {
        path,
        lines: {
          covered: [...ordered_line_counts.values()].filter((count) => count > 0).length,
          total: ordered_line_counts.size,
        },
        functions: {
          covered: Math.max(...records.map((record) => record.functions.covered)),
          total: Math.max(...records.map((record) => record.functions.total)),
        },
        uncoveredLines: [...ordered_line_counts]
          .filter(([, count]) => count === 0)
          .map(([line]) => line),
        lineCounts: ordered_line_counts,
      };
    });
}

function is_rust_inline_test_symbol(name: string): boolean {
  // Rust 1.96's v0 mangling encodes the path segment `tests` as `5tests`.
  // cargo-llvm-cov drops a separate tests.rs, but not inline #[cfg(test)] modules.
  return name.includes("5tests");
}

function rust_region(
  value: unknown,
  label: string,
): readonly [number, number, number, number, number, number, number, number] {
  if (!Array.isArray(value) || value.length < 8) throw new Error(`${label} is malformed`);
  return value
    .slice(0, 8)
    .map((item, index) =>
      finite_non_negative_integer(item, `${label}[${index}]`),
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
  assert_record(raw, "LLVM JSON");
  if (!Array.isArray(raw.data) || raw.data.length !== 1) {
    throw new Error("LLVM JSON must contain exactly one data report");
  }
  const data = raw.data[0];
  assert_record(data, "LLVM JSON data report");
  if (!Array.isArray(data.files) || !Array.isArray(data.functions)) {
    throw new Error("LLVM JSON is missing files/functions arrays");
  }

  const reported_filenames = new Set<string>();
  for (const [file_index, value] of data.files.entries()) {
    assert_record(value, `LLVM file ${file_index}`);
    if (typeof value.filename !== "string") {
      throw new Error(`LLVM file ${file_index} filename is invalid`);
    }
    reported_filenames.add(value.filename);
  }

  const lcov_by_path = new Map(lcovRecords.map((record) => [record.path, record]));
  const functions = data.functions.map((value, index) => {
    assert_record(value, `LLVM function ${index}`);
    if (
      typeof value.name !== "string" ||
      !Array.isArray(value.filenames) ||
      !Array.isArray(value.regions)
    ) {
      throw new Error(`LLVM function ${index} has an invalid schema`);
    }
    const count = finite_non_negative_integer(value.count, `LLVM function ${index} count`);
    const filenames = value.filenames
      .filter((filename, filename_index) => {
        if (typeof filename !== "string") {
          throw new Error(`LLVM function ${index} filename ${filename_index} is invalid`);
        }
        return reported_filenames.has(filename);
      })
      .map((filename) => normalizeSourcePath(filename as string, root));
    return {
      name: value.name,
      count,
      filenames,
      regions: value.regions.map((region, region_index) =>
        rust_region(region, `LLVM function ${index} region ${region_index}`),
      ),
    };
  });

  const result: CoverageRecord[] = [];
  const seen = new Set<string>();
  for (const [file_index, value] of data.files.entries()) {
    assert_record(value, `LLVM file ${file_index}`);
    if (typeof value.filename !== "string")
      throw new Error(`LLVM file ${file_index} filename is invalid`);
    const path = normalizeSourcePath(value.filename, root);
    if (seen.has(path)) throw new Error(`Duplicate LLVM source record: ${path}`);
    seen.add(path);
    const lcov = lcov_by_path.get(path);
    if (!lcov) throw new Error(`LLVM JSON source is missing from LCOV: ${path}`);

    const file_functions = functions.filter((fn) => fn.filenames.includes(path));
    const test_functions = file_functions.filter((fn) => is_rust_inline_test_symbol(fn.name));
    const production_functions = file_functions.filter(
      (fn) => !is_rust_inline_test_symbol(fn.name),
    );
    const test_ranges = test_functions.flatMap((fn) =>
      fn.regions.map((region) => ({ start: region[0], end: region[2] })),
    );
    const line_counts = new Map(
      [...lcov.lineCounts].filter(
        ([line]) => !test_ranges.some((range) => line >= range.start && line <= range.end),
      ),
    );

    const definitions = new Map<string, number[]>();
    const regions = new Map<string, number[]>();
    for (const fn of production_functions) {
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
        covered: [...line_counts.values()].filter((count) => count > 0).length,
        total: line_counts.size,
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
      uncoveredLines: [...line_counts]
        .filter(([, count]) => count === 0)
        .map(([line]) => line)
        .sort((left, right) => left - right),
      lineCounts: line_counts,
    });
  }
  return result;
}

function is_coverage_contamination(path: string): boolean {
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

function validate_keys(
  value: Record<string, unknown>,
  allowed: Readonly<Record<string, true>>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (allowed[key] !== true) throw new Error(`${label} has an unknown field: ${key}`);
  }
}

function validate_text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be non-empty`);
}

function validate_repository_path(value: unknown, label: string): asserts value is string {
  validate_text(value, label);
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) {
    throw new Error(`${label} must be repository-relative`);
  }
}

function parse_percent(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be an integer percentage`);
  }
  return value;
}

function parse_floor(raw: unknown, language: CoverageLanguage): CoverageFloor {
  const label = `Coverage ${language} floor`;
  assert_record(raw, label);
  validate_keys(raw, METRIC_KEYS, label);
  const lines = parse_percent(raw.lines, `${label} lines`);
  const functions = parse_percent(raw.functions, `${label} functions`);
  if (raw.regions === undefined) return { lines, functions };
  return { lines, functions, regions: parse_percent(raw.regions, `${label} regions`) };
}

export function parseCoveragePolicy(raw: unknown): CoveragePolicy {
  assert_record(raw, "Coverage policy");
  validate_keys(raw, POLICY_KEYS, "Coverage policy");
  if (raw.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported coverage policy schema version: ${String(raw.schemaVersion)}`);
  }
  assert_record(raw.floors, "Coverage policy floors");
  validate_keys(raw.floors, FLOOR_LANGUAGE_KEYS, "Coverage policy floors");
  const floors = {
    typescript: parse_floor(raw.floors.typescript, "typescript"),
    rust: parse_floor(raw.floors.rust, "rust"),
  };
  if (!Array.isArray(raw.exclusions))
    throw new Error("Coverage policy exclusions must be an array");
  const excluded_paths = new Set<string>();
  const exclusions = raw.exclusions.map((value, index): CoverageExclusion => {
    const label = `Coverage exclusion ${index}`;
    assert_record(value, label);
    validate_keys(value, EXCLUSION_KEYS, label);
    validate_repository_path(value.path, `${label} path`);
    validate_text(value.reason, `${label} reason`);
    if (excluded_paths.has(value.path))
      throw new Error(`Duplicate coverage exclusion: ${value.path}`);
    excluded_paths.add(value.path);
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
    const exclusion_language = exclusion.path.endsWith(".rs") ? "rust" : "typescript";
    if (exclusion_language !== language) continue;
    if (!discovered.has(exclusion.path)) {
      throw new Error(`Coverage exclusion has no runtime source file: ${exclusion.path}`);
    }
    excluded.add(exclusion.path);
  }
  return new Set(runtimePaths.filter((path) => !excluded.has(path)));
}

function assert_counts(counts: CoverageCounts, label: string): void {
  finite_non_negative_integer(counts.covered, `${label} covered`);
  finite_non_negative_integer(counts.total, `${label} total`);
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
  const { policy, language, records, scoredPaths: scored_paths } = options;
  const record_by_path = new Map<string, CoverageRecord>();
  for (const record of records) {
    if (record_by_path.has(record.path))
      throw new Error(`Duplicate normalized coverage source: ${record.path}`);
    if (is_coverage_contamination(record.path)) {
      throw new Error(`Generated/test output entered scored coverage: ${record.path}`);
    }
    assert_counts(record.lines, `${record.path} lines`);
    assert_counts(record.functions, `${record.path} functions`);
    if (record.regions) assert_counts(record.regions, `${record.path} regions`);
    record_by_path.set(record.path, record);
  }
  for (const path of scored_paths) {
    if (!record_by_path.has(path))
      throw new Error(`Coverage report is missing scored source: ${path}`);
  }

  const floor = policy.floors[language];
  const totals: Partial<Record<CoverageMetricName, CoverageCounts>> = {};
  for (const metric of COVERAGE_METRICS) {
    const minimum = floor[metric];
    if (minimum === undefined) continue;
    let covered = 0;
    let total = 0;
    for (const record of record_by_path.values()) {
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
      const line_counts = record.lineCounts;
      if (!line_counts) {
        throw new Error(`Normalized coverage is missing line counters for ${record.path}`);
      }
      for (const [line, count] of [...line_counts].sort(([left], [right]) => left - right)) {
        lines.push(`DA:${line},${count}`);
      }
      lines.push(`LF:${record.lines.total}`, `LH:${record.lines.covered}`, "end_of_record");
      return lines.join("\n");
    })
    .join("\n");
}
