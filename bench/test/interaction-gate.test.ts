import { expect, test } from "bun:test";

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
import { expectRejections, type Rejection } from "./gate-fixtures.js";

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
  return Object.fromEntries(
    Object.entries(samples).map(([key, values]) => [key, summarize(values)]),
  ) as InteractionValues;
}

/** A valid full artifact as a writable record; values derive from its own samples. */
function fixture(samples: InteractionSamples = FULL_SAMPLES) {
  return {
    protocolVersion: INTERACTION_PROTOCOL_VERSION as number,
    matrixId: INTERACTION_MATRIX_ID as string,
    mode: "full" as string,
    metadata: {
      commit: TEST_COMMIT,
      dirty: false as unknown,
      timestamp: TEST_TIMESTAMP,
      engineVersions: { sheetwrite: "0.4.0" as string | undefined },
    },
    runner: { runtime: "Bun test on linux x64", browser: "Chromium test", cpu: "test cpu" },
    method: {
      lookup: "test lookup method",
      dirty: "test dirty method",
      coldRoute: "test cold-route method",
      attribution: "test attribution method",
      previous: "test previous-capture method",
    },
    rows: INTERACTION_ROWS as number,
    lookupsPerRun: INTERACTION_LOOKUPS_PER_RUN,
    samples,
    values: valuesOf(samples),
    previous: null as unknown,
    ceilings: { ...INTERACTION_CEILINGS },
  };
}
type Fixture = ReturnType<typeof fixture>;

const PREVIOUS = {
  matrixId: INTERACTION_MATRIX_ID,
  mode: "full",
  commit: TEST_COMMIT,
  timestamp: TEST_TIMESTAMP,
  values: valuesOf(FULL_SAMPLES),
};

test("accepts a full capture, its smoke rehearsal and a previous capture", () => {
  const smoke = { ...fixture(SMOKE_SAMPLES), mode: "smoke" };
  expect(() => validateInteractionArtifact(smoke)).not.toThrow();
  const artifact = validateInteractionArtifact({ ...fixture(), previous: PREVIOUS });
  expect(artifact.previous?.commit).toBe(TEST_COMMIT);
  expect(artifact.values.usableMs.median).toBe(220);
});

test("rejects drifted identity, provenance, values, ceilings and previous captures", () => {
  const aboveCeiling = (key: InteractionCeilingMetric) => (artifact: Fixture) => {
    const samples = [...FULL_SAMPLES[key]];
    samples.fill(INTERACTION_CEILINGS[key] + 1, 0, 3);
    artifact.samples = { ...FULL_SAMPLES, [key]: samples };
    artifact.values = valuesOf(artifact.samples);
  };
  const rejections: Rejection<Fixture>[] = [
    ["protocol", (artifact) => (artifact.protocolVersion = 3), "stale protocol: expected 2"],
    ["matrix", (artifact) => (artifact.matrixId = "interaction-full-v1"), "stale matrix"],
    ["mode", (artifact) => (artifact.mode = "rehearsal"), "must be full or smoke"],
    [
      "smoke size",
      (artifact) => (artifact.mode = "smoke"),
      "lookupMedianNs requires 2 raw samples",
    ],
    ["workload", (artifact) => (artifact.rows = 1_000), "workload changed"],
    [
      "version",
      (artifact) => (artifact.metadata.engineVersions.sheetwrite = "0.4"),
      "engineVersions.sheetwrite",
    ],
    [
      "commit",
      (artifact) => (artifact.metadata.commit = ""),
      "metadata.commit must be a non-empty",
    ],
    [
      "dirty",
      (artifact) => (artifact.metadata.dirty = "false"),
      "metadata.dirty must be a boolean",
    ],
    [
      "values",
      (artifact) => (artifact.values = { ...artifact.values, lookupMedianNs: summarize([40, 45]) }),
      "values.lookupMedianNs.stat.median does not match raw samples",
    ],
    [
      "lookup median",
      aboveCeiling("lookupP95Ns"),
      `lookupP95Ns median ${INTERACTION_CEILINGS.lookupP95Ns + 1} exceeds the release ceiling`,
    ],
    ...INTERACTION_SAMPLE_CEILING_KEYS.map((key): Rejection<Fixture> => [
      `${key} sample`,
      aboveCeiling(key),
      `${key} sample ${INTERACTION_CEILINGS[key] + 1} exceeds the release ceiling`,
    ]),
    ...INTERACTION_CEILING_KEYS.map((key): Rejection<Fixture> => [
      `${key} ceiling`,
      (artifact) => (artifact.ceilings[key] = INTERACTION_CEILINGS[key] * 2),
      `ceilings.${key} is not the release ceiling`,
    ]),
    [
      "previous schema",
      (artifact) => (artifact.previous = { ...PREVIOUS, matrixId: "interaction-full-v1" }),
      "previous must be a capture of the same schema",
    ],
  ];
  expectRejections(fixture, validateInteractionArtifact, rejections);
});

const PACKAGE_URL = "http://127.0.0.1:5197/@fs/repo/packages/core/dist/canvas-paint.js";
const SHELL_URL = "http://127.0.0.1:5197/node_modules/.vite/deps/react-dom_client.js";
const PROFILE_INTERVAL_US = 1_000;
const MS_US = 1_000;

function task(startMs: number, durationMs: number): TraceEvent {
  const event = { name: "RunTask", ph: "X", ts: startMs * MS_US, dur: durationMs * MS_US };
  return { ...event, pid: 1, tid: 1, url: undefined, profile: undefined };
}

/** `count` profiled samples of one URL, one millisecond apart from `startMs`. */
function samples(startMs: number, url: string, count: number, tid = 1): TraceEvent {
  const nodes = [
    { id: 1, url: PACKAGE_URL },
    { id: 2, url: SHELL_URL },
  ];
  const profile = {
    startTime: startMs * MS_US,
    nodes,
    samples: Array.from({ length: count }, () => (url === PACKAGE_URL ? 1 : 2)),
    timeDeltas: Array.from({ length: count }, (_, index) =>
      index === 0 ? 0 : PROFILE_INTERVAL_US,
    ),
  };
  const event = { name: "ProfileChunk", ph: "P", ts: startMs * MS_US, dur: undefined };
  return { ...event, pid: 1, tid, url: undefined, profile };
}

test.each([
  [
    "charges a long task that mostly runs package frames to Sheetwrite",
    [task(0, 60), samples(1, PACKAGE_URL, 50), samples(51, SHELL_URL, 5)],
    { ownedMs: 60, unattributedMs: 0 },
  ],
  [
    "reports a long task that mostly runs other code as unattributed",
    [task(0, 60), samples(1, PACKAGE_URL, 20), samples(21, SHELL_URL, 40)],
    { ownedMs: 0, unattributedMs: 60 },
  ],
  [
    "reports a long task the profile does not cover as unattributed",
    [task(0, 60)],
    { ownedMs: 0, unattributedMs: 60 },
  ],
  [
    "ignores tasks below the long-task threshold",
    [task(0, 49), samples(1, PACKAGE_URL, 60)],
    { ownedMs: 0, unattributedMs: 0 },
  ],
  [
    "does not attribute samples of another thread or outside the task window",
    [task(0, 60), samples(1, PACKAGE_URL, 50, 2), samples(90, PACKAGE_URL, 50)],
    { ownedMs: 0, unattributedMs: 60 },
  ],
  [
    "reports the longest owned and unattributed task of a sample",
    [
      ...[task(0, 55), samples(1, PACKAGE_URL, 50)],
      ...[task(200, 70), samples(201, PACKAGE_URL, 65)],
      ...[task(400, 80), samples(401, SHELL_URL, 75)],
    ],
    { ownedMs: 70, unattributedMs: 80 },
  ],
])("%s", (_name, events, expected) => {
  expect(coldTaskDurations(events)).toEqual(expected);
});
