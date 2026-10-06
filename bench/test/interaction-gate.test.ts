import { describe, expect, test } from "bun:test";
import { coldTaskDurations, type TraceEvent } from "../src/interaction-bench.js";
import {
  INTERACTION_CEILING_KEYS,
  INTERACTION_CEILINGS,
  INTERACTION_LOOKUPS_PER_RUN,
  INTERACTION_MATRIX_ID,
  INTERACTION_PROTOCOL_VERSION,
  INTERACTION_ROWS,
  INTERACTION_SAMPLE_CEILING_KEYS,
  type InteractionCeilingMetric,
  type InteractionSamples,
  type InteractionValues,
  validateInteractionArtifact,
} from "../src/interaction-gate.js";
import { summarize } from "../src/stats.js";

const TEST_COMMIT = "1".repeat(40);
const TEST_TIMESTAMP = "2026-10-07T00:00:00.000Z";

const FULL_SAMPLES: InteractionSamples = {
  lookupMedianNs: [30, 31, 32, 33, 34],
  lookupP95Ns: [60, 61, 62, 63, 64],
  inverseIndexBytes: [4_000_000, 4_000_000, 4_000_000, 4_000_000, 4_000_000],
  dirty100Bytes: [5_679, 5_680, 5_678, 5_681, 5_679],
  ownedColdLongTaskMs: [0, 12, 0, 0, 8],
  unattributedColdLongTaskMs: [54, 0, 0, 0, 0],
  usableMs: [210, 215, 220, 225, 230],
};

const SMOKE_SAMPLES: InteractionSamples = {
  lookupMedianNs: [31, 32],
  lookupP95Ns: [61, 62],
  inverseIndexBytes: [4_000_000, 4_000_000],
  dirty100Bytes: [5_679, 5_680],
  ownedColdLongTaskMs: [0, 9],
  unattributedColdLongTaskMs: [54, 0],
  usableMs: [212, 218],
};

function valuesOf(samples: InteractionSamples): InteractionValues {
  return {
    lookupMedianNs: summarize(samples.lookupMedianNs),
    lookupP95Ns: summarize(samples.lookupP95Ns),
    inverseIndexBytes: summarize(samples.inverseIndexBytes),
    dirty100Bytes: summarize(samples.dirty100Bytes),
    ownedColdLongTaskMs: summarize(samples.ownedColdLongTaskMs),
    unattributedColdLongTaskMs: summarize(samples.unattributedColdLongTaskMs),
    usableMs: summarize(samples.usableMs),
  };
}

const TEST_RUNNER = {
  runtime: "Bun test on linux x64",
  browser: "Chromium test",
  cpu: "test cpu",
};

const TEST_METHOD = {
  lookup: "test lookup method",
  dirty: "test dirty method",
  coldRoute: "test cold-route method",
  attribution: "test attribution method",
  previous: "test previous-capture method",
};

interface FixtureEdits {
  readonly protocolVersion?: number;
  readonly matrixId?: string;
  readonly mode?: string;
  readonly rows?: number;
  readonly metadata?: { readonly commit?: string; readonly dirty?: unknown };
  readonly samples?: Partial<InteractionSamples>;
  readonly values?: InteractionValues;
  readonly ceilings?: Partial<Record<InteractionCeilingMetric, number>>;
  readonly previous?: unknown;
}

/**
 * A valid artifact with the requested hand-edit-style changes. Values derive
 * from the samples of the same fixture, so only the edit under test can make a
 * case invalid.
 */
function fixture(edits: FixtureEdits = {}): unknown {
  const samples: InteractionSamples = { ...FULL_SAMPLES, ...edits.samples };
  return {
    protocolVersion: edits.protocolVersion ?? INTERACTION_PROTOCOL_VERSION,
    matrixId: edits.matrixId ?? INTERACTION_MATRIX_ID,
    mode: edits.mode ?? "full",
    metadata: {
      commit: edits.metadata?.commit ?? TEST_COMMIT,
      dirty: edits.metadata?.dirty ?? false,
      timestamp: TEST_TIMESTAMP,
    },
    runner: TEST_RUNNER,
    method: TEST_METHOD,
    rows: edits.rows ?? INTERACTION_ROWS,
    lookupsPerRun: INTERACTION_LOOKUPS_PER_RUN,
    samples,
    values: edits.values ?? valuesOf(samples),
    previous: edits.previous === undefined ? null : edits.previous,
    ceilings: { ...INTERACTION_CEILINGS, ...edits.ceilings },
  };
}

/** The base samples of `key`, three of them just above the ceiling. */
function aboveCeiling(key: InteractionCeilingMetric): Partial<InteractionSamples> {
  const samples = [...FULL_SAMPLES[key]];
  for (const index of [0, 1, 2]) samples[index] = INTERACTION_CEILINGS[key] + 1;
  return { [key]: samples };
}

describe("interaction performance artifact", () => {
  test("accepts a full capture and a smoke rehearsal of the published schema", () => {
    expect(() => validateInteractionArtifact(fixture())).not.toThrow();
    expect(() =>
      validateInteractionArtifact(fixture({ mode: "smoke", samples: SMOKE_SAMPLES })),
    ).not.toThrow();
    const previous = fixture({
      previous: {
        matrixId: INTERACTION_MATRIX_ID,
        mode: "full",
        commit: TEST_COMMIT,
        timestamp: TEST_TIMESTAMP,
        values: valuesOf(FULL_SAMPLES),
      },
    });
    const artifact = validateInteractionArtifact(previous);
    expect(artifact.previous?.commit).toBe(TEST_COMMIT);
    expect(artifact.values.usableMs.median).toBe(220);
  });

  test("rejects a different protocol, matrix, mode, or workload", () => {
    expect(() => validateInteractionArtifact(fixture({ protocolVersion: 3 }))).toThrow(
      "stale protocol: expected 2",
    );
    expect(() => validateInteractionArtifact(fixture({ matrixId: "interaction-full-v1" }))).toThrow(
      "stale matrix",
    );
    expect(() => validateInteractionArtifact(fixture({ mode: "rehearsal" }))).toThrow(
      "must be full or smoke",
    );
    expect(() => validateInteractionArtifact(fixture({ mode: "smoke" }))).toThrow(
      "lookupMedianNs requires 2 raw samples",
    );
    expect(() =>
      validateInteractionArtifact(fixture({ mode: "smoke", samples: SMOKE_SAMPLES, rows: 1_000 })),
    ).toThrow("workload changed");
  });

  test("rejects incomplete or dirty capture provenance", () => {
    expect(() => validateInteractionArtifact(fixture({ metadata: { commit: "" } }))).toThrow(
      "metadata.commit must be a non-empty string",
    );
    expect(() => validateInteractionArtifact(fixture({ metadata: { dirty: "false" } }))).toThrow(
      "metadata.dirty must be a boolean",
    );
  });

  test("rejects a value that is not the summary of its samples", () => {
    const values = valuesOf(FULL_SAMPLES);
    const notDerived = {
      ...values,
      // Internally consistent, but not the summary of the samples above.
      lookupMedianNs: { median: 40, p95: 45, mean: 40, stddev: 2, min: 38, max: 45, iters: 5 },
    };
    expect(() => validateInteractionArtifact(fixture({ values: notDerived }))).toThrow(
      "values.lookupMedianNs.stat.median does not match raw samples",
    );
  });

  test("rejects a sample above any release ceiling", () => {
    for (const key of INTERACTION_SAMPLE_CEILING_KEYS) {
      expect(() => validateInteractionArtifact(fixture({ samples: aboveCeiling(key) }))).toThrow(
        `${key} sample ${INTERACTION_CEILINGS[key] + 1} exceeds the release ceiling`,
      );
    }
    expect(() =>
      validateInteractionArtifact(fixture({ samples: aboveCeiling("lookupP95Ns") })),
    ).toThrow(
      `lookupP95Ns median ${INTERACTION_CEILINGS.lookupP95Ns + 1} exceeds the release ceiling`,
    );
  });

  test("rejects a weakened release ceiling", () => {
    for (const key of INTERACTION_CEILING_KEYS) {
      expect(() =>
        validateInteractionArtifact(
          fixture({ ceilings: { [key]: INTERACTION_CEILINGS[key] * 2 } }),
        ),
      ).toThrow(`ceilings.${key} is not the release ceiling`);
    }
  });

  test("rejects a previous capture of another schema", () => {
    expect(() =>
      validateInteractionArtifact(
        fixture({
          previous: {
            matrixId: "interaction-full-v1",
            mode: "full",
            commit: TEST_COMMIT,
            timestamp: TEST_TIMESTAMP,
            values: valuesOf(FULL_SAMPLES),
          },
        }),
      ),
    ).toThrow("previous must be a capture of the same schema");
  });
});

function task(ts: number, durationMs: number, overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    name: "RunTask",
    ph: "X",
    ts,
    dur: durationMs * 1_000,
    pid: 1,
    tid: 1,
    url: undefined,
    profile: undefined,
    ...overrides,
  };
}

const PACKAGE_URL = "http://127.0.0.1:5197/@fs/repo/packages/core/dist/canvas-paint.js";
const SHELL_URL = "http://127.0.0.1:5197/node_modules/.vite/deps/react-dom_client.js";
const PROFILE_INTERVAL_US = 1_000;

function profileEvent(startUs: number, urls: readonly string[]): TraceEvent {
  const nodes = [
    { id: 1, url: PACKAGE_URL },
    { id: 2, url: SHELL_URL },
    { id: 3, url: undefined },
  ];
  const nodeIdOf = (url: string): number => (url === PACKAGE_URL ? 1 : url === SHELL_URL ? 2 : 3);
  return {
    name: "ProfileChunk",
    ph: "P",
    ts: startUs,
    dur: undefined,
    pid: 1,
    tid: 1,
    url: undefined,
    profile: {
      startTime: startUs,
      nodes,
      samples: urls.map(nodeIdOf),
      timeDeltas: urls.map((_, index) => (index === 0 ? 0 : PROFILE_INTERVAL_US)),
    },
  };
}

/** `count` profiled samples of one URL, one millisecond apart from `ts`. */
function scriptSamples(
  ts: number,
  url: string,
  count: number,
  overrides: Partial<TraceEvent> = {},
): TraceEvent {
  return {
    ...profileEvent(
      ts,
      Array.from({ length: count }, () => url),
    ),
    ...overrides,
  };
}

describe("cold-route long-task attribution", () => {
  test("charges a long task that mostly runs package frames to Sheetwrite", () => {
    const events = [
      task(0, 60),
      scriptSamples(1_000, PACKAGE_URL, 50),
      scriptSamples(51_000, SHELL_URL, 5),
    ];
    expect(coldTaskDurations(events)).toEqual({ ownedMs: 60, unattributedMs: 0 });
  });

  test("reports a long task that mostly runs other code as unattributed", () => {
    const events = [
      task(0, 60),
      scriptSamples(1_000, PACKAGE_URL, 20),
      scriptSamples(21_000, SHELL_URL, 40),
    ];
    expect(coldTaskDurations(events)).toEqual({ ownedMs: 0, unattributedMs: 60 });
  });

  test("reports a long task the profile does not cover as unattributed", () => {
    expect(coldTaskDurations([task(0, 60)])).toEqual({ ownedMs: 0, unattributedMs: 60 });
  });

  test("ignores tasks below the long-task threshold", () => {
    expect(coldTaskDurations([task(0, 49), scriptSamples(1_000, PACKAGE_URL, 60)])).toEqual({
      ownedMs: 0,
      unattributedMs: 0,
    });
  });

  test("does not attribute samples of another thread or outside the task window", () => {
    const otherThread = scriptSamples(1_000, PACKAGE_URL, 50, { tid: 2 });
    const afterTask = scriptSamples(90_000, PACKAGE_URL, 50);
    expect(coldTaskDurations([task(0, 60), otherThread, afterTask])).toEqual({
      ownedMs: 0,
      unattributedMs: 60,
    });
  });

  test("reports the longest owned and unattributed task of a sample", () => {
    const events = [
      task(0, 55),
      scriptSamples(1_000, PACKAGE_URL, 50),
      task(200_000, 70),
      scriptSamples(201_000, PACKAGE_URL, 65),
      task(400_000, 80),
      scriptSamples(401_000, SHELL_URL, 75),
    ];
    expect(coldTaskDurations(events)).toEqual({ ownedMs: 70, unattributedMs: 80 });
  });
});
