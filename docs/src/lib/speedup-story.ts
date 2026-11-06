/**
 * The speed story for a head-to-head benchmark: headline cards, one overview
 * of every interaction's speedup, and every interaction's times on demand.
 * A Linux | Mac | All switch picks one machine's panel, or every machine's
 * speedups side by side on one ratio axis; absolute times stay per machine.
 * Like `renderPerfBars`, it returns static HTML: the switch and disclosures are
 * form controls and `<details>`, and the value panels show on hover and
 * keyboard focus, so the story needs no script.
 */
import { laneHtml, legendMark, rangeRowHtml } from "../components/figures/static.js";
import {
  ALL_MACHINES,
  type MachineRow,
  machineSwitch,
  renderMachineComparison,
} from "./machine-compare.js";
import {
  escapeHtml,
  formatTime,
  formatTimes,
  type PerfIconMarkup,
  type PerfMachine,
} from "./perf-bars.js";

export interface StoryInteraction {
  readonly id: string;
  /** "Scroll down · top left". */
  readonly label: string;
  /** One of `STORY_CATEGORIES`. */
  readonly category: string;
  /** Sheetwrite's median, with the lowest and highest round as `[low, high]`. */
  readonly measured: { readonly value: number; readonly spread: readonly number[] };
  /** The compared library's median; absent when it did not complete. */
  readonly base?: number;
}

export interface StoryMachine {
  readonly machine: PerfMachine;
  /** "Linux". */
  readonly name: string;
  /** "x86-64 · Intel Core i9-12900H". */
  readonly detail: string;
  /** "100,000 rows · median of 10 rounds · Chromium 153 · captured 2026-10-28". */
  readonly note: string;
  readonly interactions: readonly StoryInteraction[];
}

export interface SpeedupStory {
  readonly id: string;
  /** "Handsontable". */
  readonly baseName: string;
  readonly machines: readonly StoryMachine[];
}

/** The kinds of interaction, in reading order. */
export const STORY_CATEGORIES = ["Scroll", "Edit", "Altering", "Arrow", "Paint"] as const;

/** The headline cards: the largest speedup of each of these kinds. */
const HEADLINE_CATEGORIES = ["Scroll", "Edit", "Altering", "Paint"] as const;

/** A ratio chip's fill reaches full length at this speedup. */
const CHIP_FULL_RATIO = 1000;

function ratioOf(interaction: StoryInteraction): number | undefined {
  return interaction.base === undefined ? undefined : interaction.base / interaction.measured.value;
}

function spreadOf(interaction: StoryInteraction): [number, number] {
  const [low = interaction.measured.value, high = interaction.measured.value] =
    interaction.measured.spread;
  return [low, high];
}

function headlineCards(machine: StoryMachine): string {
  const cards = HEADLINE_CATEGORIES.flatMap((category) => {
    const best = machine.interactions
      .filter(
        (interaction) => interaction.category === category && ratioOf(interaction) !== undefined,
      )
      .sort((left, right) => (ratioOf(right) ?? 0) - (ratioOf(left) ?? 0))[0];
    const ratio = best === undefined ? undefined : ratioOf(best);
    if (best === undefined || ratio === undefined || best.base === undefined) return [];
    return [
      `<li class="speed-story__card"><p class="speed-story__kicker">${escapeHtml(category)}</p><p class="speed-story__big"><b>${formatTimes(ratio)}</b><span>faster</span></p><p class="speed-story__what">${escapeHtml(best.label)}</p><p class="speed-story__vs"><b>${formatTime(best.measured.value)}</b> vs ${formatTime(best.base)}</p></li>`,
    ];
  });
  return `<ul class="speed-story__cards">${cards.join("")}</ul>`;
}

function overview(machine: StoryMachine, baseName: string): string {
  const ratios = machine.interactions.flatMap((interaction) => ratioOf(interaction) ?? []);
  const decades = Math.max(1, Math.ceil(Math.log10(Math.max(...ratios, 10))));
  const ticks = Array.from(
    { length: decades + 1 },
    (_, index) =>
      `<span style="left:${((index / decades) * 100).toFixed(2)}%">${(10 ** index).toLocaleString("en-US")}×</span>`,
  ).join("");
  const groups = STORY_CATEGORIES.map((category) => {
    const rows = machine.interactions
      .filter((interaction) => interaction.category === category)
      .map((interaction) => ({ interaction, ratio: ratioOf(interaction) }))
      .sort((left, right) => (right.ratio ?? 0) - (left.ratio ?? 0));
    if (rows.length === 0) return "";
    return `<li class="speed-story__group"><p class="speed-story__category">${escapeHtml(category)}</p><ul>${rows
      .map(({ interaction, ratio }) =>
        ratio === undefined
          ? `<li class="speed-story__dot-row"><span class="speed-story__label">${escapeHtml(interaction.label)}</span><span class="speed-story__missing">${escapeHtml(baseName)} did not complete</span></li>`
          : `<li class="speed-story__dot-row"><span class="speed-story__label">${escapeHtml(interaction.label)}</span><span class="speed-story__lane">${laneHtml({ label: interaction.label, scale: { kind: "log", domain: [1, 10 ** decades] }, origin: 1, gridlines: Array.from({ length: decades + 1 }, (_, index) => 10 ** index), series: [{ key: "sheetwrite", label: "Sheetwrite", value: ratio, valueText: `${formatTimes(ratio)} faster than ${baseName}`, shape: "circle", tone: "accent" }] })}</span><b class="speed-story__ratio">${formatTimes(ratio)}</b></li>`,
      )
      .join("")}</ul></li>`;
  }).join("");
  return `<figure class="speed-story__overview" style="--story-steps:${decades}"><figcaption class="speed-story__axis"><span class="speed-story__axis-title">Times faster than ${escapeHtml(baseName)}, log scale from 1× (as fast)</span><span class="speed-story__ticks" aria-hidden="true">${ticks}</span></figcaption><ul class="speed-story__groups">${groups}</ul></figure>`;
}

/** A log-scale time axis in whole decades, shared by every row of one group. */
function timeAxis(values: readonly number[]): { low: number; high: number } {
  const positive = values.filter((value) => value > 0);
  const low = Math.floor(Math.log10(Math.min(...positive)));
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...positive))));
  return { low, high };
}

function timeAt(value: number, axis: { low: number; high: number }): string {
  const position = ((Math.log10(value) - axis.low) / (axis.high - axis.low)) * 100;
  return `${Math.min(100, Math.max(0, position)).toFixed(2)}%`;
}

/** "1 µs", "10 ms", "1 s": a decade tick in the unit a reader expects. */
function decadeLabel(exponent: number): string {
  const ms = 10 ** exponent;
  if (ms >= 1000) return `${(ms / 1000).toLocaleString("en-US")}\u00a0s`;
  if (ms >= 1) return `${ms.toLocaleString("en-US")}\u00a0ms`;
  return `${(ms * 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}\u00a0µs`;
}

/** "−94%": the share of the compared library's time that Sheetwrite saves. */
function timeSaved(ratio: number): string {
  return `−${Math.min(99.9, (1 - 1 / ratio) * 100).toFixed(ratio > 1000 ? 1 : 0)}%`;
}

function laneRow(
  interaction: StoryInteraction,
  axis: { low: number; high: number },
  machine: StoryMachine,
  baseName: string,
  id: string,
): string {
  const ratio = ratioOf(interaction);
  const [low, high] = spreadOf(interaction);
  const median = interaction.measured.value;
  return rangeRowHtml({
    id: `${id}-${machine.machine}-${interaction.id.replaceAll(/[^a-z0-9]+/giu, "-")}`,
    label: interaction.label,
    scale: { kind: "log", domain: [10 ** axis.low, 10 ** axis.high] },
    gridlines: Array.from(
      { length: axis.high - axis.low + 1 },
      (_, index) => 10 ** (axis.low + index),
    ),
    primary: {
      label: "Sheetwrite median",
      value: median,
      valueText: formatTime(median),
      shape: "circle",
      tone: "accent",
      range: [low, high],
    },
    others:
      interaction.base === undefined
        ? []
        : [
            {
              label: `${baseName} median`,
              value: interaction.base,
              valueText: formatTime(interaction.base),
              shape: "diamond",
              tone: "muted",
            },
          ],
    ...(ratio === undefined
      ? {}
      : {
          chip: {
            text: `${formatTimes(ratio)} faster`,
            // Full at CHIP_FULL_RATIO, on a log scale, so 2× and 2,000× both read.
            fill: Math.log10(ratio) / Math.log10(CHIP_FULL_RATIO),
            tone: "accent" as const,
          },
        }),
    details: [
      ["Sheetwrite median", formatTime(median)],
      ["Lowest–highest round", `${formatTime(low)} – ${formatTime(high)}`],
      [
        `${baseName} median`,
        interaction.base === undefined ? "did not complete" : formatTime(interaction.base),
      ],
      ...(ratio === undefined
        ? []
        : ([
            ["Speedup", `${formatTimes(ratio)} faster`],
            ["Time saved", timeSaved(ratio)],
          ] as const)),
    ],
  });
}

/** Every interaction's times on lanes grouped by kind, each group on its own time axis. */
function laneTable(machine: StoryMachine, baseName: string, id: string): string {
  const groups = STORY_CATEGORIES.map((category) => {
    const interactions = machine.interactions.filter(
      (interaction) => interaction.category === category,
    );
    if (interactions.length === 0) return "";
    const axis = timeAxis(
      interactions.flatMap((interaction) => [
        ...spreadOf(interaction),
        ...(interaction.base === undefined ? [] : [interaction.base]),
      ]),
    );
    const ticks = Array.from({ length: axis.high - axis.low + 1 }, (_, index) => {
      const exponent = axis.low + index;
      return `<span style="left:${timeAt(10 ** exponent, axis)}">${decadeLabel(exponent)}</span>`;
    }).join("");
    return `<li class="lane-group" style="--lane-steps:${axis.high - axis.low}"><p class="lane-group__head"><b>${escapeHtml(category)}</b><span class="lane-group__ticks" aria-hidden="true">${ticks}</span></p><ul>${interactions
      .map((interaction) => laneRow(interaction, axis, machine, baseName, id))
      .join("")}</ul></li>`;
  }).join("");
  return `<ul class="lane-table">${groups}</ul>`;
}

/** The numbers as a plain table: one column per tool and per machine. */
function numbersTable(
  machines: readonly StoryMachine[],
  baseName: string,
  caption: string,
): string {
  const labels = [
    ...new Map(
      machines.flatMap((machine) =>
        machine.interactions.map((interaction) => [interaction.id, interaction.label] as const),
      ),
    ),
  ];
  const head = [
    "Interaction",
    ...machines.flatMap((machine) => [
      `Sheetwrite, ${machine.name}`,
      `${baseName}, ${machine.name}`,
      `Speedup, ${machine.name}`,
    ]),
  ]
    .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
    .join("");
  const rows = labels
    .map(([id, label]) => {
      const cells = machines.flatMap((machine) => {
        const interaction = machine.interactions.find((entry) => entry.id === id);
        if (interaction === undefined) return ["<td>no result</td>", "<td></td>", "<td></td>"];
        const ratio = ratioOf(interaction);
        const [low, high] = spreadOf(interaction);
        return [
          `<td>${formatTime(interaction.measured.value)}<small>${formatTime(low)}–${formatTime(high)}</small></td>`,
          `<td>${interaction.base === undefined ? "did not complete" : formatTime(interaction.base)}</td>`,
          `<td>${ratio === undefined ? "" : `${formatTimes(ratio)} faster`}</td>`,
        ];
      });
      return `<tr><th scope="row">${escapeHtml(label)}</th>${cells.join("")}</tr>`;
    })
    .join("");
  return `<div class="speed-story__table" tabindex="0" role="region" aria-label="${escapeHtml(caption)}"><table class="speed-story__data"><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Every number on demand: the lanes, with a "Numbers only" switch to a plain
 * table; without lanes (every machine at once), the table alone.
 */
function details(
  machines: readonly StoryMachine[],
  baseName: string,
  id: string,
  lanes: string,
): string {
  const names = machines.map((machine) => machine.name).join(" and ");
  const numbers = numbersTable(machines, baseName, `Every interaction, ${names}`);
  const toggle = `${id}-numbers`;
  const body =
    lanes === ""
      ? numbers
      : `<input type="checkbox" class="speed-story__toggle" id="${toggle}"><label class="speed-story__toggle-label" for="${toggle}">Numbers only</label>${lanes}${numbers}`;
  return `<details class="speed-story__details"><summary>Show all numbers</summary><div class="speed-story__numbers">${body}</div></details>`;
}

function legend(baseName: string): string {
  return `<p class="lane-legend"><span>${legendMark("circle", "accent")}Sheetwrite median</span><span><i class="lane-legend__range" aria-hidden="true"></i>Lowest–highest round</span><span>${legendMark("diamond", "muted")}${escapeHtml(baseName)} median</span><span class="lane-legend__hint">Hover or focus a row for every value</span></p>`;
}

/** Every machine's speedups side by side, and every machine's numbers. */
function allPanel(story: SpeedupStory, icon: PerfIconMarkup): string {
  const rows: MachineRow[] = [
    ...new Map(
      story.machines.flatMap((machine) =>
        machine.interactions.map((interaction) => [interaction.id, interaction] as const),
      ),
    ).values(),
  ].map((interaction) => ({
    label: interaction.label,
    id: interaction.id,
    results: Object.fromEntries(
      story.machines.map((machine) => {
        const own = machine.interactions.find((entry) => entry.id === interaction.id);
        const ratio = own === undefined ? undefined : ratioOf(own);
        return [
          machine.machine,
          ratio === undefined
            ? { pending: `${story.baseName} did not complete` }
            : { ratio, text: `${formatTimes(ratio)} faster` },
        ];
      }),
    ),
  }));
  return `<section class="speed-story__panel" data-machine="${ALL_MACHINES}" aria-label="Every machine">${renderMachineComparison(
    {
      id: `${story.id}-all`,
      measure: `Times faster than ${story.baseName}`,
      parity: `as fast as ${story.baseName}`,
      rowHeader: "Interaction",
      machines: story.machines.map((machine) => ({
        machine: machine.machine,
        name: machine.name,
        detail: `${machine.detail} · ${machine.note}`,
      })),
      rows,
    },
    icon,
  )}${details(story.machines, story.baseName, `${story.id}-all`, "")}</section>`;
}

/** The story as HTML: a machine switch over one panel per machine and one for all. */
export function renderSpeedupStory(story: SpeedupStory, icon: PerfIconMarkup): string {
  const panels = story.machines
    .map(
      (machine) =>
        `<section class="speed-story__panel" data-machine="${machine.machine}" aria-label="${escapeHtml(machine.name)} results"><p class="speed-story__meta"><b>${escapeHtml(machine.name)}</b><span>${escapeHtml(machine.detail)}</span><span class="speed-story__note">${escapeHtml(machine.note)}</span></p>${headlineCards(machine)}${overview(machine, story.baseName)}${details([machine], story.baseName, `${story.id}-${machine.machine}`, `${legend(story.baseName)}${laneTable(machine, story.baseName, story.id)}`)}</section>`,
    )
    .join("");
  const switcher = machineSwitch(
    {
      id: story.id,
      label: `Machine for the comparison with ${story.baseName}`,
      machines: story.machines,
    },
    icon,
  );
  return `<div class="speed-story" data-pagefind-ignore>${switcher}${panels}${story.machines.length > 1 ? allPanel(story, icon) : ""}</div>`;
}
