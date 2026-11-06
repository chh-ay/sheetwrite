/**
 * The speed story for a head-to-head benchmark: headline cards, one overview
 * of every interaction's speedup, and detail rows with both medians on demand.
 * Each machine is a panel behind a Linux | Mac switch; machines never share a
 * chart. Like `renderPerfBars`, it returns static HTML: the switch and the
 * disclosures are form controls and `<details>`, so the story needs no script.
 */
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
  /** "Scroll", "Edit", "Keyboard", "Rows" or "Paint". */
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

const MACHINE_ICONS: Readonly<Record<PerfMachine, "server" | "laptop">> = {
  linux: "server",
  mac: "laptop",
};

/** The overview's categories, in reading order; headline cards pick one result from each of the first four. */
export const STORY_CATEGORIES = ["Scroll", "Edit", "Rows", "Paint", "Keyboard"] as const;

function ratioOf(interaction: StoryInteraction): number | undefined {
  return interaction.base === undefined ? undefined : interaction.base / interaction.measured.value;
}

function headlineCards(machine: StoryMachine): string {
  const cards = STORY_CATEGORIES.slice(0, 4).flatMap((category) => {
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
  const at = (ratio: number): string =>
    `${((Math.max(0, Math.log10(ratio)) / decades) * 100).toFixed(2)}%`;
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
          : `<li class="speed-story__dot-row"><span class="speed-story__label">${escapeHtml(interaction.label)}</span><span class="speed-story__lane" aria-hidden="true"><i class="speed-story__stem" style="width:${at(ratio)}"></i><i class="speed-story__dot" style="left:${at(ratio)}"></i></span><b class="speed-story__ratio">${formatTimes(ratio)}</b></li>`,
      )
      .join("")}</ul></li>`;
  }).join("");
  return `<figure class="speed-story__overview" style="--story-steps:${decades}"><figcaption class="speed-story__axis"><span class="speed-story__axis-title">Times faster than ${escapeHtml(baseName)}, log scale from 1× (as fast)</span><span class="speed-story__ticks" aria-hidden="true">${ticks}</span></figcaption><ul class="speed-story__groups">${groups}</ul></figure>`;
}

function details(machine: StoryMachine, baseName: string): string {
  const rows = machine.interactions
    .map((interaction) => {
      const ratio = ratioOf(interaction);
      const [low = interaction.measured.value, high = interaction.measured.value] =
        interaction.measured.spread;
      return `<tr><th scope="row">${escapeHtml(interaction.label)}</th><td class="speed-story__ours"><b>${formatTime(interaction.measured.value)}</b><small>${formatTime(low)}–${formatTime(high)}</small></td><td>${interaction.base === undefined ? "did not complete" : formatTime(interaction.base)}</td><td>${ratio === undefined ? "" : `${formatTimes(ratio)} faster`}</td><td>${ratio === undefined ? "" : `−${Math.min(99.9, (1 - 1 / ratio) * 100).toFixed(ratio > 1000 ? 1 : 0)}%`}</td></tr>`;
    })
    .join("");
  return `<details class="speed-story__details"><summary>Show all numbers</summary><div class="speed-story__table" tabindex="0" role="region" aria-label="${escapeHtml(machine.name)}: every interaction"><table class="speed-story__data"><thead><tr><th scope="col">Interaction</th><th scope="col">Sheetwrite median (lowest–highest round)</th><th scope="col">${escapeHtml(baseName)} median</th><th scope="col">Speedup</th><th scope="col">Time saved</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

/** The story as HTML: a machine switch over one panel per machine. */
export function renderSpeedupStory(story: SpeedupStory, icon: PerfIconMarkup): string {
  const name = `${story.id}-machine`;
  const radios = story.machines
    .map(
      (machine, index) =>
        `<input type="radio" name="${name}" id="${name}-${machine.machine}" value="${machine.machine}"${index === 0 ? " data-default" : ""}><label for="${name}-${machine.machine}">${icon(MACHINE_ICONS[machine.machine])}${escapeHtml(machine.name)}</label>`,
    )
    .join("");
  const panels = story.machines
    .map(
      (machine, index) =>
        `<section class="speed-story__panel" data-machine="${machine.machine}"${index === 0 ? " data-default" : ""} aria-label="${escapeHtml(machine.name)} results"><p class="speed-story__meta"><b>${escapeHtml(machine.name)}</b><span>${escapeHtml(machine.detail)}</span><span class="speed-story__note">${escapeHtml(machine.note)}</span></p>${headlineCards(machine)}${overview(machine, story.baseName)}${details(machine, story.baseName)}</section>`,
    )
    .join("");
  return `<div class="speed-story" data-pagefind-ignore><div class="machine-switch" role="radiogroup" aria-label="Machine">${radios}</div>${panels}</div>`;
}
