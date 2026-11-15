import type { FigureShape, FigureTone } from "../components/figures/scale.js";
/**
 * Performance lanes for release notes: each result of a release against the
 * previous one, as a mark on a shared "times faster" axis, one row per
 * workload. A note writes them as a fence, one workload per line, with each
 * machine's result in the words the note uses:
 *
 *   ```perf-lanes diagram title="Formulas, 0.7.0 against 0.6.1" base="0.6.1"
 *   200 lookups over 100,000 rows | Linux: 0.011 of the time | Mac: 0.008 of the time
 *   COUNTIF over 100k cells | Range: 11.5–18× faster
 *   ```
 *
 * `Range` is a result the note gives as one range across machines or engines;
 * it draws as a bar between its ends. The words are kept as written, so the
 * figure shows the same numbers as the text. Like the performance bars, the
 * renderer returns static HTML.
 */
import { laneHtml, legendMark } from "../components/figures/static.js";
import { type RatioAxis, ratioAxis, ratioTicks } from "./machine-compare.js";
import { escapeHtml, type PerfIconMarkup, type PerfIconName } from "./perf-bars.js";

type LaneKey = "linux" | "mac" | "range";

/** One result: its words, and how many times faster it is (a range has two ends). */
export interface LaneResult {
  readonly key: LaneKey;
  readonly text: string;
  readonly ratios: readonly [number] | readonly [low: number, high: number];
}

export interface ReleaseLaneRow {
  readonly label: string;
  readonly results: readonly LaneResult[];
}

export interface ReleaseLanes {
  readonly id: string;
  readonly title: string;
  /** The release the results are compared with: "0.6.1". */
  readonly base: string;
  readonly rows: readonly ReleaseLaneRow[];
}

const KEYS: Readonly<
  Record<
    LaneKey,
    {
      readonly name: string;
      readonly detail: string;
      readonly icon: PerfIconName;
      readonly shape: FigureShape;
      readonly tone: FigureTone;
    }
  >
> = {
  linux: {
    name: "Linux",
    detail: "Intel Core i9-12900H",
    icon: "server",
    shape: "circle",
    tone: "accent",
  },
  mac: { name: "Mac", detail: "Apple M5 Pro", icon: "laptop", shape: "diamond", tone: "violet" },
  range: {
    name: "Range",
    detail: "Lowest to highest across machines and engines",
    icon: "layers",
    shape: "square",
    tone: "muted",
  },
};

const KEY_NAMES: Readonly<Record<string, LaneKey>> = { Linux: "linux", Mac: "mac", Range: "range" };

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;
const RANGE = String.raw`(${NUMBER})(?:–(${NUMBER}))?`;
const TIME = String.raw`(${NUMBER}) (ns|µs|ms|s)`;
const FRACTION_OF_TIME = new RegExp(String.raw`^${RANGE} of the (?:time|work)$`, "u");
const TIMES_FASTER = new RegExp(String.raw`^(?:about )?${RANGE}× faster$`, "u");
const INSTEAD_OF = new RegExp(String.raw`^${TIME} instead of ${TIME}$`, "u");
const LESS_TIME = new RegExp(String.raw`^(${NUMBER})% less time$`, "u");
const SECONDS: Readonly<Record<string, number>> = { ns: 1e-9, µs: 1e-6, ms: 1e-3, s: 1 };

const number = (text: string) => Number(text.replaceAll(",", ""));

/** The ends written in a match: one value, or the two ends of a range. */
function ends(low: string | undefined, high: string | undefined): [number] | [number, number] {
  if (low === undefined) throw new Error("A result has no number");
  return high === undefined ? [number(low)] : [number(low), number(high)];
}

/** How many times faster a result in words is: "0.011 of the time" is about 91×. */
export function resultRatios(text: string): LaneResult["ratios"] {
  const fraction = FRACTION_OF_TIME.exec(text);
  if (fraction !== null) {
    const values = ends(fraction[1], fraction[2]).map((value) => 1 / value);
    return values.length === 1
      ? [values[0] ?? Number.NaN]
      : [Math.min(...values), Math.max(...values)];
  }
  const faster = TIMES_FASTER.exec(text);
  if (faster !== null) return ends(faster[1], faster[2]);
  const instead = INSTEAD_OF.exec(text);
  if (instead !== null) {
    const [, after = "", afterUnit = "", before = "", beforeUnit = ""] = instead;
    return [
      (number(before) * (SECONDS[beforeUnit] ?? 1)) / (number(after) * (SECONDS[afterUnit] ?? 1)),
    ];
  }
  const less = LESS_TIME.exec(text);
  if (less !== null) return [1 / (1 - number(less[1] ?? "") / 100)];
  throw new Error(
    `perf-lanes: "${text}" is not "0.2 of the time", "3× faster", "19 ms instead of 491 ms" or "7.3% less time"`,
  );
}

const ATTRIBUTE = /([a-z]+)="([^"]*)"/gu;

/** The figure a `perf-lanes` fence describes, from its meta and its lines; a malformed fence fails the build. */
export function parseReleaseLanes(meta: string, body: string, id: string): ReleaseLanes {
  const attributes = new Map(
    [...meta.matchAll(ATTRIBUTE)].map((match) => [match[1], match[2] ?? ""]),
  );
  const title = attributes.get("title");
  const base = attributes.get("base");
  if (!title || !base) throw new Error('A perf-lanes fence needs title="…" and base="…"');
  const rows = body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [label, ...cells] = line.split("|").map((cell) => cell.trim());
      if (!label || cells.length === 0) {
        throw new Error(`perf-lanes line "${line}" needs: workload | Linux: … | Mac: …`);
      }
      return {
        label,
        results: cells.map((cell) => {
          const colon = cell.indexOf(": ");
          const key = KEY_NAMES[cell.slice(0, colon)];
          if (colon < 0 || key === undefined) {
            throw new Error(`perf-lanes result "${cell}" starts with Linux:, Mac: or Range:`);
          }
          const text = cell.slice(colon + 2);
          return { key, text, ratios: resultRatios(text) };
        }),
      };
    });
  return { id, title, base, rows };
}

/** Escaped text with `code` spans, as a workload label writes them. */
function labelHtml(label: string): string {
  return escapeHtml(label).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function row(entry: ReleaseLaneRow, axis: RatioAxis): string {
  const plain = entry.label.replaceAll("`", "");
  const lane = laneHtml({
    label: plain,
    scale: { kind: "log", domain: axis.domain },
    origin: 1,
    gridlines: axis.ticks,
    series: entry.results.map((result) => ({
      key: result.key,
      label: KEYS[result.key].name,
      value: result.ratios.length === 1 ? result.ratios[0] : null,
      ...(result.ratios.length === 2 ? { range: result.ratios } : {}),
      valueText: result.text,
      shape: KEYS[result.key].shape,
      tone: KEYS[result.key].tone,
    })),
  });
  const values = entry.results
    .map(
      (result) =>
        `<span data-machine="${result.key}">${legendMark(KEYS[result.key].shape, KEYS[result.key].tone)}${KEYS[result.key].name} <b>${escapeHtml(result.text)}</b></span>`,
    )
    .join("");
  return `<li class="machines__row"><span class="machines__label">${labelHtml(entry.label)}</span><span class="machines__lane">${lane}</span><span class="machines__values">${values}</span></li>`;
}

/** The lanes as HTML: a legend of the machines used, the axis, then one row per workload. */
export function renderReleaseLanes(figure: ReleaseLanes, icon: PerfIconMarkup): string {
  const used = (Object.keys(KEYS) as LaneKey[]).filter((key) =>
    figure.rows.some((entry) => entry.results.some((result) => result.key === key)),
  );
  const axis = ratioAxis(
    figure.rows.flatMap((entry) => entry.results.flatMap((result) => result.ratios)),
  );
  const legend = used
    .map(
      (key) =>
        `<li data-machine="${key}">${legendMark(KEYS[key].shape, KEYS[key].tone)}${icon(KEYS[key].icon)}<b>${KEYS[key].name}</b><span>${escapeHtml(KEYS[key].detail)}</span></li>`,
    )
    .join("");
  return [
    `<figure class="machines machines--words" aria-labelledby="${figure.id}-title" data-pagefind-ignore>`,
    `<p class="machines__title" id="${figure.id}-title">${escapeHtml(figure.title)}</p>`,
    `<ul class="machines__legend">${legend}</ul>`,
    `<p class="machines__axis-title">Times faster than ${escapeHtml(figure.base)} on the same machine, log scale: 1× is as fast as ${escapeHtml(figure.base)}.</p>`,
    `<div class="machines__axis" aria-hidden="true"><span class="machines__ticks">${ratioTicks(axis)}</span></div>`,
    `<ul class="machines__rows">${figure.rows.map((entry) => row(entry, axis)).join("")}</ul>`,
    "</figure>",
  ].join("");
}
