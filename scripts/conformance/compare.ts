import { canonicalJson } from "./normalize.js";
import type {
  ConformanceResult,
  KnownDivergence,
  ResultTolerance,
  ReviewedObservation,
} from "./types.js";

const SIGN_BIT = 1n << 63n;

/**
 * Maps a float to an integer in the same order, so the distance between two
 * mapped values counts the floats between them. Non-negative floats map to
 * `SIGN_BIT + magnitude bits` and negative floats to `SIGN_BIT - magnitude
 * bits`, so `-0` and `+0` share one point and every value fits in 64 bits.
 */
function ordered_float(value: number): bigint {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  const bits = view.getBigUint64(0, false);
  const magnitude = bits & (SIGN_BIT - 1n);
  return bits & SIGN_BIT ? SIGN_BIT - magnitude : SIGN_BIT + magnitude;
}

/** Optional fields compared whenever the expectation states them. */
interface ComparedFields {
  rows?: number;
  columns?: number;
  displayedText?: string;
  formula?: string;
}

function compared_fields(result: ConformanceResult): ComparedFields {
  switch (result.type) {
    case "array":
      return { rows: result.rows, columns: result.columns, formula: result.formula };
    case "workbook":
    case "unsupported":
      return {};
    default:
      return { displayedText: result.displayedText, formula: result.formula };
  }
}

function numbers_match(
  left: number,
  right: number,
  tolerance: ResultTolerance | undefined,
): boolean {
  if (tolerance?.kind === "absolute") return Math.abs(left - right) <= tolerance.value;
  if (tolerance?.kind === "relative") {
    return Math.abs(left - right) <= tolerance.value * Math.max(1, Math.abs(left));
  }

  if (tolerance?.kind === "ulp") {
    const left_bits = ordered_float(left);
    const right_bits = ordered_float(right);
    return (
      Number(left_bits < right_bits ? right_bits - left_bits : left_bits - right_bits) <=
      tolerance.value
    );
  }

  return Object.is(left, right);
}

export function compareResults(expected: ConformanceResult, actual: ConformanceResult): string[] {
  if (actual.type !== expected.type) {
    return [`type: expected ${expected.type}, received ${actual.type}`];
  }

  const differences: string[] = [];
  if (expected.type === "number" && actual.type === "number") {
    if (!numbers_match(expected.value, actual.value, expected.tolerance)) {
      differences.push(`value: expected ${expected.value}, received ${actual.value}`);
    }
  } else if (expected.type === "error" && actual.type === "error") {
    if (actual.error !== expected.error) {
      differences.push(`error: expected ${expected.error}, received ${actual.error}`);
    }
  } else if ("value" in expected && "value" in actual) {
    if (canonicalJson(actual.value) !== canonicalJson(expected.value)) {
      differences.push(
        `value: expected ${canonicalJson(expected.value)}, received ${canonicalJson(actual.value)}`,
      );
    }
  }

  const expected_fields = compared_fields(expected);
  const actual_fields = compared_fields(actual);
  for (const field of ["rows", "columns", "displayedText", "formula"] as const) {
    if (expected_fields[field] !== undefined && actual_fields[field] !== expected_fields[field]) {
      differences.push(
        `${field}: expected ${String(expected_fields[field])}, received ${String(actual_fields[field])}`,
      );
    }
  }

  return differences;
}

export function compareReviewedObservation(
  expected: ConformanceResult,
  observation: ReviewedObservation,
  divergence?: KnownDivergence,
): string[] {
  const expected_differences = compareResults(expected, observation.result);
  if (expected_differences.length === 0) return [];
  if (!divergence?.producers.includes(observation.producer)) return expected_differences;
  const alternate_differences = compareResults(divergence.alternate, observation.result);
  if (alternate_differences.length === 0) return [];
  return [
    ...expected_differences,
    `declared alternate did not match (${alternate_differences.join("; ")})`,
  ];
}
