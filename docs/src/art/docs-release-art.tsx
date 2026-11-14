// The visual summary that opens each older release post: one tile per
// highlight, led by its number or its one-word change. Every number and claim
// comes from that release's Highlights and Changes sections.
import type { JSX } from "solid-js";

import { TileFigure } from "./blueprint-layouts.js";

/** One highlight: its number or one-word change, its title and up to two short lines. */
type Highlight = readonly [lead: string, title: string, lines: readonly string[]];

interface Release {
  readonly version: string;
  readonly highlights: readonly Highlight[];
}

/** A release's highlights as blueprint tiles: the change as the title, under what it is about. */
function ReleaseSummary(props: Readonly<{ release: Release }>) {
  return (
    <TileFigure
      columns={3}
      narrowColumns={2}
      text={{
        title: `Sheetwrite ${props.release.version} at a glance`,
        description: props.release.highlights
          .map(([lead, title, lines]) => `${title}: ${lead}. ${lines.join(" ")}`)
          .join(" "),
      }}
      tiles={props.release.highlights.map(([lead, title, lines]) => ({
        eyebrow: title,
        title: lead,
        lines,
      }))}
    />
  );
}

const RELEASES: readonly Release[] = [
  {
    version: "0.5.0",
    highlights: [
      [
        "LAMBDA",
        "Full formula engine",
        ["Grouping, pivots, stats,", "finance, regex and", "reshaping functions"],
      ],
      ["A1#", "Spill references", ["=SUM(A1#) and", "={1,2;3,4} in both", "engines"]],
      ["1 step", "Large undo", ["A very large clear", "undoes as one", "history step"]],
      [
        "No reload",
        "Conflict recovery",
        ["recoverConflict()", "recovers a conflict", "on the live Grid"],
      ],
      ["38 MiB", "Engine memory", ["Down from 173 MiB", "once a million-row", "sheet is cleared"]],
      ["52%", "Faster CSV import", ["XLSX import 38%", "faster; loading", "26–35% faster"]],
    ],
  },
  {
    version: "0.5.1",
    highlights: [
      ["⌘⇧K", "Typed shortcuts", ["Platform-aware labels", "in menus and toolbars"]],
      ["Busy", "Command feedback", ["Busy states and", "visible errors on", "built-in buttons"]],
      ["2×", "Faster column sums", ["About twice as fast", "as 0.5.0"]],
      ["Docs", "Redesigned docs", ["A task-focused home", "and grouped navigation"]],
    ],
  },
  {
    version: "0.5.2",
    highlights: [
      ["4.5%", "Smaller downloads", ["Installs are 13.2%", "smaller too"]],
      ["21 MiB", "Less CSV memory", ["Peak for a 1,000,000-", "row import, 9.6% lower"]],
      ["Fixed", "Shifted shortcuts", ["Mod+Shift+1 runs", "when the browser", "reports !"]],
      [
        "Patched",
        "Build runtimes",
        ["Bun 1.4.4 and Node", "26.12.1 fix a Brotli", "vulnerability"],
      ],
    ],
  },
  {
    version: "0.5.3",
    highlights: [
      ["Readable", "Package code", ["Stack traces point", "to real lines"]],
      ["4", "Install commands", ["npm, pnpm, Yarn and", "Bun on every package", "README"]],
    ],
  },
  {
    version: "0.5.4",
    highlights: [
      ["0", "Missing source maps", ["No .map references to", "files the packages", "don't ship"]],
      ["Bars", "Size charts", ["Before and after bars", "for each package"]],
    ],
  },
  {
    version: "0.6.0",
    highlights: [
      ["7", "Chart types", ["Column, bar, line,", "area, pie, doughnut", "and scatter"]],
      ["Pivots", "Pivot tables", ["Insert and edit from", "the ribbon; kept in", "XLSX files"]],
      ["3-D", "More formulas", ["Intersection, union,", "3-D references,", "OFFSET, INDIRECT"]],
      ["Cycles", "Iterative calculation", ["Circular references", "with Excel's settings"]],
      ["Ribbon", "Excel-style ribbon", ["A grouped context", "menu, notes, status", "line totals"]],
      ["Kept", "XLSX parts", ["Charts, pivots, images", "and VBA written back", "unchanged"]],
    ],
  },
  {
    version: "0.6.1",
    highlights: [
      ["0.79×", "Data-grid edits", ["The time of 0.6.0,", "the same as 0.5.4"]],
      ["0.60×", "Paged scrolling", ["Back to evicted pages,", "the time of 0.6.0"]],
      ["9–17%", "Faster text lookups", ["Over 1,000 text cells,", "against 0.5.4"]],
      [
        "0.84×",
        "XLSX safety rejects",
        ["Too much expansion is", "rejected before any", "part is read"],
      ],
    ],
  },
];

/** Release summaries by the name a placement uses: `release-<version>`. */
export const RELEASE_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = Object.fromEntries(
  RELEASES.map((release) => [
    `release-${release.version}`,
    () => <ReleaseSummary release={release} />,
  ]),
);
