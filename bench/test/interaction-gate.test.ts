import { expect, test } from "bun:test";

import { coldTaskDurations, type TraceEvent } from "../src/interaction-bench.js";
import {
  INTERACTION_CEILING_KEYS,
  INTERACTION_CEILINGS,
  INTERACTION_SAMPLE_CEILING_KEYS,
  type InteractionCeilingMetric,
  type InteractionPerformanceArtifact,
  type InteractionValues,
  validateInteractionArtifact,
} from "../src/interaction-gate.js";
import { summarize } from "../src/stats.js";
import {
  type DeepMutable,
  expectRejections,
  must,
  mutableCopy,
  type Rejection,
} from "./gate-fixtures.js";

type Fixture = DeepMutable<InteractionPerformanceArtifact>;

/** The committed capture, which the docs scale showcase publishes. */
const RECORDED = validateInteractionArtifact(
  await Bun.file(new URL("../results/interaction-results.json", import.meta.url)).json(),
);
const fixture = () => mutableCopy(RECORDED);

test("rejects drifted identity, provenance, values, ceilings and previous captures", () => {
  const aboveCeiling = (key: InteractionCeilingMetric) => (artifact: Fixture) => {
    const samples = artifact.samples[key];
    samples.fill(INTERACTION_CEILINGS[key] + 1, 0, 3);
    artifact.values = mutableCopy(
      Object.fromEntries(
        Object.entries(artifact.samples).map(([metric, values]) => [metric, summarize(values)]),
      ) as InteractionValues,
    );
  };
  const rejections: Rejection<Fixture>[] = [
    [
      (artifact) => Reflect.set(artifact.metadata.engineVersions, "sheetwrite", "^0.4.0"),
      "engineVersions.sheetwrite",
    ],
    [(artifact) => Reflect.set(artifact, "protocolVersion", 3), "stale protocol: expected 2"],
    [(artifact) => Reflect.set(artifact, "matrixId", "interaction-full-v1"), "stale matrix"],
    [(artifact) => Reflect.set(artifact, "mode", "rehearsal"), "must be full or smoke"],
    [(artifact) => (artifact.mode = "smoke"), "lookupMedianNs requires 2 raw samples"],
    [(artifact) => Reflect.set(artifact, "rows", 1_000), "workload changed"],
    [(artifact) => (artifact.metadata.commit = ""), "metadata.commit must be a non-empty"],
    [
      (artifact) => Reflect.set(artifact.metadata, "dirty", "false"),
      "metadata.dirty must be a boolean",
    ],
    [
      (artifact) => (artifact.values.lookupMedianNs = summarize([1e6, 2e6])),
      "values.lookupMedianNs.stat.median does not match raw samples",
    ],
    [
      aboveCeiling("lookupP95Ns"),
      `lookupP95Ns median ${INTERACTION_CEILINGS.lookupP95Ns + 1} exceeds the release ceiling`,
    ],
    ...INTERACTION_SAMPLE_CEILING_KEYS.map((key): Rejection<Fixture> => [
      aboveCeiling(key),
      `${key} sample ${INTERACTION_CEILINGS[key] + 1} exceeds the release ceiling`,
    ]),
    ...INTERACTION_CEILING_KEYS.map((key): Rejection<Fixture> => [
      (artifact) => (artifact.ceilings[key] = INTERACTION_CEILINGS[key] * 2),
      `ceilings.${key} is not the release ceiling`,
    ]),
    [
      (artifact) =>
        Reflect.set(must(artifact.previous, "previous"), "matrixId", "interaction-full-v1"),
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
    "reports a long task that mostly runs other code as unattributed",
    [task(0, 60), samples(1, PACKAGE_URL, 20), samples(21, SHELL_URL, 40)],
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
