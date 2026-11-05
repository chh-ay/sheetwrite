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
function orderedFloat(value: number): bigint {
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

function comparedFields(result: ConformanceResult): ComparedFields {
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

function numbersMatch(
  left: number,
  right: number,
  tolerance: ResultTolerance | undefined,
): boolean {
  if (tolerance?.kind === "absolute") return Math.abs(left - right) <= tolerance.value;
  if (tolerance?.kind === "relative") {
    return Math.abs(left - right) <= tolerance.value * Math.max(1, Math.abs(left));
  }

  if (tolerance?.kind === "ulp") {
    const leftBits = orderedFloat(left);
    const rightBits = orderedFloat(right);
    return (
      Number(leftBits < rightBits ? rightBits - leftBits : leftBits - rightBits) <= tolerance.value
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
    if (!numbersMatch(expected.value, actual.value, expected.tolerance)) {
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

  const expectedFields = comparedFields(expected);
  const actualFields = comparedFields(actual);
  for (const field of ["rows", "columns", "displayedText", "formula"] as const) {
    if (expectedFields[field] !== undefined && actualFields[field] !== expectedFields[field]) {
      differences.push(
        `${field}: expected ${String(expectedFields[field])}, received ${String(actualFields[field])}`,
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
  const expectedDifferences = compareResults(expected, observation.result);
  if (expectedDifferences.length === 0) return [];
  if (!divergence?.producers.includes(observation.producer)) return expectedDifferences;
  const alternateDifferences = compareResults(divergence.alternate, observation.result);
  if (alternateDifferences.length === 0) return [];
  return [
    ...expectedDifferences,
    `declared alternate did not match (${alternateDifferences.join("; ")})`,
  ];
}
