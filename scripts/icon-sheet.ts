/**
 * Generates the command icon sheet from `scripts/icon-glyphs.ts`.
 *
 *   bun scripts/icon-sheet.ts          write the outputs
 *   bun scripts/icon-sheet.ts --check  fail when an output is stale
 *
 * Outputs:
 * - packages/core/styles/icons.svg: every glyph on a fixed pitch, the
 *   artwork designers edit against and the mask the CSS crops from. It ships
 *   as its own file, so only pages that draw icons load it and the browser
 *   caches it.
 * - packages/core/src/icons/icons.json: the public layout manifest (each
 *   glyph's column and row), which replacement sheets are drawn against.
 * - packages/core/src/icons/icon-names.ts: the glyph names, for runtime lookup
 *   and the `IconName` type. Path data never ships in JavaScript.
 * - packages/core/styles/icons.css: the mask rule that points at icons.svg,
 *   and one crop rule per glyph.
 *
 * Cells are 24 units on a 36-unit pitch. The 12-unit gutter keeps a crop from
 * ever reaching a neighbour, and 36 / 24 = 1.5 puts every crop offset on a
 * whole pixel at the 16, 20 and 32 px sizes the UI uses.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type GlyphPart, ICON_ROWS } from "./icon-glyphs.js";

const ROOT = resolve(import.meta.dir, "..");
const SHEET_PATH = resolve(ROOT, "packages/core/styles/icons.svg");
const NAMES_PATH = resolve(ROOT, "packages/core/src/icons/icon-names.ts");
const ICONS_CSS_PATH = resolve(ROOT, "packages/core/styles/icons.css");
const MANIFEST_PATH = resolve(ROOT, "packages/core/src/icons/icons.json");

const CELL = 24;
const PITCH = 36;
const SCALE = PITCH / CELL;
/**
 * The sheet is always 16 × 16 cells, whatever is drawn on it. A fixed canvas
 * keeps the crop maths identical across versions, so a host's replacement
 * sheet drawn for one release still lines up in the next.
 */
const CAPACITY = 16;
const MANIFEST_VERSION = 1;
const STROKE = 1.6;
const BOLD_STROKE = 2.6;
const TINT_OPACITY = 0.24;
const GUIDE_OPACITY = 0.5;
const GUIDE_DASH = "1.6 2.4";
/** Decimals kept in a crop offset, so float noise such as 1.4999999999 never reaches the CSS. */
const OFFSET_DECIMALS = 6;

function partElement(part: GlyphPart): string {
  if (typeof part === "string") return `<path d="${part}"/>`;
  switch (part.tone) {
    case "tint":
      return `<path d="${part.d}" fill="#000" fill-opacity="${TINT_OPACITY}" stroke="none"/>`;
    case "guide":
      return `<path d="${part.d}" stroke-dasharray="${GUIDE_DASH}" stroke-opacity="${GUIDE_OPACITY}"/>`;
    case "bold":
      return `<path d="${part.d}" stroke-width="${BOLD_STROKE}"/>`;
  }
}

interface Placed {
  name: string;
  column: number;
  row: number;
}

function layout(): Placed[] {
  if (ICON_ROWS.length > CAPACITY) throw new Error(`More than ${CAPACITY} icon rows`);
  const placed: Placed[] = [];
  const seen = new Set<string>();
  ICON_ROWS.forEach((glyphs, row) => {
    if (glyphs.length > CAPACITY)
      throw new Error(`Icon row ${row} has more than ${CAPACITY} glyphs`);
    glyphs.forEach(([name], column) => {
      if (seen.has(name)) throw new Error(`Duplicate icon name: ${name}`);
      seen.add(name);
      placed.push({ name, column, row });
    });
  });
  return placed;
}

/**
 * The layout is public: replacement sheets are drawn against it. A glyph may
 * be added in a free cell, but no published glyph may move or disappear.
 */
function assertAppendOnly(placed: Placed[]): void {
  // No manifest yet means nothing is published. A manifest that does not parse
  // must fail, or the append-only check would silently turn off.
  if (!existsSync(MANIFEST_PATH)) return;
  const previous = publishedCells(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));

  const now = new Map(placed.map((glyph) => [glyph.name, glyph]));
  const broken: string[] = [];
  for (const [name, cell] of Object.entries(previous)) {
    const current = now.get(name);
    if (current === undefined) broken.push(`${name} was removed`);
    else if (current.column !== cell.column || current.row !== cell.row) {
      broken.push(
        `${name} moved from (${cell.column}, ${cell.row}) to (${current.column}, ${current.row})`,
      );
    }
  }
  if (broken.length > 0) {
    throw new Error(`The icon sheet layout is append-only:\n${broken.join("\n")}`);
  }
}

/** The `icons` map of a parsed manifest; throws when the manifest has another shape. */
function publishedCells(json: unknown): Record<string, { column: number; row: number }> {
  const icons = typeof json === "object" && json !== null && "icons" in json ? json.icons : null;
  if (typeof icons !== "object" || icons === null) {
    throw new Error(`${MANIFEST_PATH} has no "icons" object`);
  }

  const cells: Record<string, { column: number; row: number }> = {};
  for (const [name, cell] of Object.entries(icons)) {
    const isCell =
      typeof cell === "object" &&
      cell !== null &&
      "column" in cell &&
      typeof cell.column === "number" &&
      "row" in cell &&
      typeof cell.row === "number";
    if (!isCell) throw new Error(`${MANIFEST_PATH}: icon "${name}" has no numeric column and row`);
    cells[name] = { column: cell.column, row: cell.row };
  }
  return cells;
}

function manifest(placed: Placed[]): string {
  const icons = Object.fromEntries(placed.map(({ name, column, row }) => [name, { column, row }]));
  return `${JSON.stringify(
    {
      version: MANIFEST_VERSION,
      cell: CELL,
      pitch: PITCH,
      columns: CAPACITY,
      rows: CAPACITY,
      icons,
    },
    null,
    2,
  )}\n`;
}

function sheetSvg(): string {
  const width = CAPACITY * PITCH;
  const height = CAPACITY * PITCH;
  const cells = ICON_ROWS.flatMap((glyphs, row) =>
    glyphs.map(
      ([name, parts], column) =>
        `  <g id="${name}" transform="translate(${column * PITCH} ${row * PITCH})">${parts
          .map(partElement)
          .join("")}</g>`,
    ),
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`,
    ...cells,
    "</svg>",
    "",
  ].join("\n");
}

function offset(cells: number): number {
  return Number((cells * -SCALE).toFixed(OFFSET_DECIMALS));
}

function iconsCss(placed: Placed[]): string {
  const size = "var(--sheetwrite-icon-size, 16px)";
  // The sheet URL is relative to this file, so bundlers emit icons.svg as an asset.
  const sheet = 'var(--sheetwrite-icon-sheet, url("./icons.svg"))';
  const maskSize = `calc(${size} * ${CAPACITY * SCALE}) calc(${size} * ${CAPACITY * SCALE})`;
  const maskPosition = `calc(${size} * var(--sheetwrite-icon-x, 0)) calc(${size} * var(--sheetwrite-icon-y, 0))`;
  const lines = [
    "/* Generated by scripts/icon-sheet.ts from scripts/icon-glyphs.ts. Do not edit. */",
    "/* @sheetwrite/core/styles/icons.css: the command icons of the ribbon, the",
    "   toolbar, the context menu and the chart panel. One sheet, icons.svg, cropped",
    "   per glyph. Set --sheetwrite-icon-size on the icon or any ancestor to scale",
    "   it. To replace every glyph, set --sheetwrite-icon-sheet to url() of a sheet",
    "   drawn on the layout in @sheetwrite/core/icons.json. */",
    "",
    "/* Development builds read this to warn once when this part is missing. */",
    ".sheetwrite-icon {",
    "  --sheetwrite-icons-ready: 1;",
    "}",
    "",
    ".sheetwrite-icon {",
    "  display: block;",
    "  flex: none;",
    `  width: ${size};`,
    `  height: ${size};`,
    "  background-color: currentColor;",
    `  -webkit-mask: ${sheet} no-repeat;`,
    `  mask: ${sheet} no-repeat;`,
    `  -webkit-mask-size: ${maskSize};`,
    `  mask-size: ${maskSize};`,
    `  -webkit-mask-position: ${maskPosition};`,
    `  mask-position: ${maskPosition};`,
    "}",
    "/* High Contrast replaces background colours; keep the glyph in the text colour. */",
    "@media (forced-colors: active) {",
    "  .sheetwrite-icon {",
    "    forced-color-adjust: none;",
    "    background-color: CanvasText;",
    "  }",
    "}",
  ];
  for (const { name, column, row } of placed) {
    lines.push(
      `.sheetwrite-icon[data-icon="${name}"] { --sheetwrite-icon-x: ${offset(column)}; --sheetwrite-icon-y: ${offset(row)}; }`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function namesModule(placed: Placed[]): string {
  return [
    "// Generated by scripts/icon-sheet.ts from scripts/icon-glyphs.ts. Do not edit.",
    "",
    "/** Every glyph on the command icon sheet. */",
    "export const ICON_NAMES = [",
    ...placed.map(({ name }) => `  "${name}",`),
    "] as const;",
    "",
    "/** The name of one glyph on the command icon sheet; the key of `IconOverrides`. */",
    "export type IconName = (typeof ICON_NAMES)[number];",
    "",
  ].join("\n");
}

/** Formats with `bun fmt` and the repo config, so generated and formatted output never disagree. */
function formatted(path: string, content: string): string {
  if (path.endsWith(".svg")) return content;
  const result = Bun.spawnSync(["bun", "fmt", `--stdin-filepath=${path}`], {
    cwd: ROOT,
    stdin: new TextEncoder().encode(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`bun fmt failed on ${path}: ${result.stderr}`);
  return result.stdout.toString();
}

const placed = layout();
assertAppendOnly(placed);
const svg = sheetSvg();
const outputs: [path: string, content: string][] = (
  [
    [SHEET_PATH, svg],
    [MANIFEST_PATH, manifest(placed)],
    [NAMES_PATH, namesModule(placed)],
    [ICONS_CSS_PATH, iconsCss(placed)],
  ] as const
).map(([path, content]) => [path, formatted(path, content)]);

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([path, content]) => {
    try {
      return readFileSync(path, "utf8") !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    for (const [path] of stale) console.error(`Stale icon output: ${path}`);
    console.error("Run: bun scripts/icon-sheet.ts");
    process.exit(1);
  }
} else {
  for (const [path, content] of outputs) writeFileSync(path, content);
}
