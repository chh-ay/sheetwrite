/**
 * Renders the social card of every docs page after `vite build`: one
 * 1200×630 PNG per prerendered page under dist/client/og/, at the path
 * `ogImagePath` gives the page's `og:image`. Each card shows the page's
 * section, title and description beside the section's illustration, in the
 * dark theme's tokens and the site's own fonts.
 *
 *   bun src/figures/og-images.ts dist/client     (after the vite build; the
 *   argument is the built client directory of either docs app)
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";

import { renderAsync } from "@resvg/resvg-js";

import { themeTokens, tokenColour } from "../lib/design-tokens.ts";
import { DOCS_NAVIGATION, type NavigationItem } from "../lib/navigation.ts";
import { RELEASES, releaseHref } from "../lib/releases.ts";
import { ogImagePath } from "../lib/seo.ts";

const DOCS = join(import.meta.dir, "../..");
const [clientDirectory] = process.argv.slice(2);
if (clientDirectory === undefined) {
  throw new Error("usage: bun og-images.ts <built client directory>");
}
const CLIENT = resolve(clientDirectory);
const ILLUSTRATIONS = join(DOCS, "public/figures/illustrations");
const WIDTH = 1200;
/** Social platforms fetch cards on demand; each stays small. */
const MAX_CARD_BYTES = 60 * 1024;
const HEIGHT = 630;

/**
 * The site's typefaces as static instances: resvg reads TrueType files and no
 * variable fonts. Each WOFF file is unpacked once for every card.
 */
const FONT_FILES = [
  "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff",
  "@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff",
  "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff",
].map((file) => Bun.resolveSync(file, DOCS));
const DISPLAY_FONT = "Bricolage Grotesque";
const BODY_FONT = "Instrument Sans";
const MONO_FONT = "JetBrains Mono";

/** Average glyph advance per font size, for wrapping lines without a layout engine. */
const DISPLAY_ADVANCE = 0.56;
const BODY_ADVANCE = 0.5;

/** The illustration on the card of each top-level docs path. */
const SECTION_ART: Readonly<Record<string, string>> = {
  start: "getting-started",
  frameworks: "frameworks",
  concepts: "concepts",
  features: "features",
  "import-export": "import-export",
  tutorials: "tutorials",
  performance: "performance",
  api: "api-reference",
  reference: "formulas",
  releases: "grid",
};

/** Section labels of the paths the sidebar does not list page by page. */
const PATH_SECTIONS: Readonly<Record<string, string>> = {
  start: "Getting started",
  frameworks: "Frameworks",
  concepts: "Concepts",
  features: "Features",
  "import-export": "Import and export",
  tutorials: "Tutorials",
  api: "API reference",
  reference: "Reference",
  performance: "Performance",
  releases: "Release notes",
};

const colours = themeTokens("dark");
const colour = (name: string) => tokenColour(colours, name);
const C = {
  page: colour("--sw-surface-0"),
  surface: colour("--sw-surface-1"),
  raised: colour("--sw-surface-2"),
  border: colour("--sw-border"),
  borderStrong: colour("--sw-border-strong"),
  fg: colour("--sw-fg-strong"),
  muted: colour("--sw-fg-muted"),
  accent: colour("--sw-accent"),
  accentStrong: colour("--sw-accent-strong"),
  accentSoft: colour("--sw-accent-soft"),
  accentInk: colour("--sw-accent-ink"),
};

/** The art's custom properties, resolved: resvg draws no CSS variables. */
const ART_COLOURS: Readonly<Record<string, string>> = {
  "--sw-art-line": C.borderStrong,
  "--sw-art-ink": C.muted,
  "--sw-art-muted": C.borderStrong,
  "--sw-art-surface": C.surface,
  "--sw-art-accent": C.accent,
  "--sw-art-accent-soft": C.accentSoft,
  "--sw-art-on-accent": C.accentInk,
  "--sw-art-dot": C.border,
};

/** The TrueType font inside a WOFF 1.0 file: each table inflated and laid out again. */
function unpackWoff(woff: Buffer): Buffer {
  const count = woff.readUInt16BE(12);
  const directory = Buffer.alloc(12 + count * 16);
  directory.writeUInt32BE(woff.readUInt32BE(4), 0);
  directory.writeUInt16BE(count, 4);
  const log2 = Math.floor(Math.log2(count));
  directory.writeUInt16BE(2 ** log2 * 16, 6);
  directory.writeUInt16BE(log2, 8);
  directory.writeUInt16BE(count * 16 - 2 ** log2 * 16, 10);
  const tables: Buffer[] = [];
  let offset = directory.length;
  for (let index = 0; index < count; index += 1) {
    const entry = 44 + index * 20;
    const start = woff.readUInt32BE(entry + 4);
    const stored = woff.readUInt32BE(entry + 8);
    const length = woff.readUInt32BE(entry + 12);
    const data = woff.subarray(start, start + stored);
    const table = Buffer.alloc((length + 3) & ~3);
    (stored === length ? data : inflateSync(data)).copy(table);
    const record = 12 + index * 16;
    directory.writeUInt32BE(woff.readUInt32BE(entry), record);
    directory.writeUInt32BE(woff.readUInt32BE(entry + 16), record + 4);
    directory.writeUInt32BE(offset, record + 8);
    directory.writeUInt32BE(length, record + 12);
    tables.push(table);
    offset += table.length;
  }
  return Buffer.concat([directory, ...tables]);
}

interface Page {
  href: string;
  title: string;
  description: string;
}

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const decodeEntities = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** Every prerendered docs page that search engines index. */
function docsPages(): Page[] {
  const pages: Page[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === "index.html") {
        const html = readFileSync(path, "utf8");
        // Either app's head: a meta tag may carry other attributes first.
        if (/<meta\b[^>]*\bname="robots"[^>]*\bcontent="noindex/.test(html)) continue;
        const meta = (property: string) =>
          new RegExp(`<meta\\b[^>]*\\bproperty="${property}"[^>]*\\bcontent="([^"]*)"`).exec(
            html,
          )?.[1];
        const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "");
        const description = meta("og:description");
        if (title === undefined || description === undefined) continue;
        const href = `/${relative(CLIENT, dirname(path)).split("\\").join("/")}/`;
        pages.push({
          href,
          title: decodeEntities(title).trim(),
          description: decodeEntities(description),
        });
      }
    }
  };
  walk(join(CLIENT, "docs"));
  return pages;
}

/** The posts of releases that are not published yet. */
const NEXT_RELEASE_HREFS = new Set(
  RELEASES.filter((release) => release.unreleased === true).map((release) =>
    releaseHref(release.version),
  ),
);

/** The sidebar section that lists `href`, or the section its path names; an unpublished release post is the next release. */
function sectionOf(href: string): string {
  if (NEXT_RELEASE_HREFS.has(href)) return "Next release";
  const lists = (items: readonly NavigationItem[]): boolean =>
    items.some((item) => item.href === href || lists(item.items ?? []));
  const section = DOCS_NAVIGATION.find((entry) => entry.href === href || lists(entry.items));
  const segment = href.split("/")[2] ?? "";
  return section?.label ?? PATH_SECTIONS[segment] ?? "Documentation";
}

/** Greedy word wrap to `maxLines`, the last line ending in an ellipsis when cut. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line !== "") lines.push(line);
  else if (lines.length === maxLines && line !== "") {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
  return lines;
}

/** One illustration's drawing, with its colours resolved. */
function art(name: string): string {
  const source = readFileSync(join(ILLUSTRATIONS, `${name}.svg`), "utf8");
  const symbol = /<symbol id="art" viewBox="0 0 320 160">([\s\S]*)<\/symbol>/.exec(source)?.[1];
  if (symbol === undefined) throw new Error(`${name}.svg has no #art symbol`);
  return symbol.replace(/var\((--sw-art-[a-z-]+)\)/g, (_, token: string) => {
    const value = ART_COLOURS[token];
    if (value === undefined)
      throw new Error(`${name}.svg uses ${token}, which the card does not set`);
    return value;
  });
}

const ART_CACHE = new Map<string, string>();
const artFor = (href: string) => {
  const name = SECTION_ART[href.split("/")[2] ?? ""] ?? "grid";
  let drawing = ART_CACHE.get(name);
  if (drawing === undefined) {
    drawing = art(name);
    ART_CACHE.set(name, drawing);
  }
  return drawing;
};

/** The card's layout, in pixels. */
const L = {
  margin: 80,
  textWidth: 560,
  titleSize: 60,
  titleLeading: 68,
  bodySize: 27,
  bodyLeading: 38,
  art: { x: 660, y: 150, width: 460, height: 300 },
};

function cardSvg(page: Page): string {
  const titleLines = wrap(page.title, Math.floor(L.textWidth / (L.titleSize * DISPLAY_ADVANCE)), 3);
  const bodyLines = wrap(
    page.description,
    Math.floor(L.textWidth / (L.bodySize * BODY_ADVANCE)),
    // The description gets the lines the title leaves.
    4 - titleLines.length,
  );
  const titleTop = 236;
  const bodyTop = titleTop + titleLines.length * L.titleLeading + 18;
  const text = (lines: string[], y: number, leading: number) =>
    lines
      .map(
        (line, index) =>
          `<tspan x="${L.margin}" y="${y + index * leading}">${escapeXml(line)}</tspan>`,
      )
      .join("");
  const { x, y, width, height } = L.art;
  const scale = (width - 40) / 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${C.page}"/>
<rect x="0" y="0" width="${WIDTH}" height="8" fill="${C.accent}"/>
<g transform="translate(${L.margin} 72)" fill="none" stroke="${C.accent}" stroke-width="2.5" stroke-linejoin="round">
  <rect x="3" y="3" width="26" height="26" rx="5"/><path d="M3 11h26M11 3v26M20 11v18M11 20h18"/>
</g>
<text x="${L.margin + 46}" y="98" font-family="${DISPLAY_FONT}" font-weight="700" font-size="30" fill="${C.fg}">Sheetwrite</text>
<text x="${L.margin}" y="178" font-family="${MONO_FONT}" font-size="22" letter-spacing="1.5" fill="${C.accentStrong}">${escapeXml(sectionOf(page.href).toUpperCase())}</text>
<text font-family="${DISPLAY_FONT}" font-weight="700" font-size="${L.titleSize}" fill="${C.fg}">${text(titleLines, titleTop, L.titleLeading)}</text>
<text font-family="${BODY_FONT}" font-size="${L.bodySize}" fill="${C.muted}">${text(bodyLines, bodyTop + L.bodySize, L.bodyLeading)}</text>
<text x="${L.margin}" y="${HEIGHT - 64}" font-family="${MONO_FONT}" font-size="22" fill="${C.muted}">sheetwrite.dev${escapeXml(page.href)}</text>
<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${C.raised}" stroke="${C.border}" stroke-width="2"/>
<g transform="translate(${x + 20} ${y + (height - 160 * scale) / 2}) scale(${scale})">${artFor(page.href)}</g>
</svg>`;
}

const started = performance.now();
// resvg loads fonts from files: unpack each WOFF once into a scratch folder.
const scratch = mkdtempSync(join(tmpdir(), "sheetwrite-og-"));
const fontFiles = FONT_FILES.map((path, index) => {
  const font = join(scratch, `${index}.ttf`);
  writeFileSync(font, unpackWoff(readFileSync(path)));
  return font;
});
const pages = docsPages();
const queue = [...pages];
let largest = 0;
const worker = async () => {
  for (let page = queue.pop(); page !== undefined; page = queue.pop()) {
    const image = await renderAsync(cardSvg(page), {
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: BODY_FONT },
    });
    const png = image.asPng();
    if (png.length > MAX_CARD_BYTES) throw new Error(`The card of ${page.href} is ${png.length} B`);
    largest = Math.max(largest, png.length);
    const out = join(CLIENT, ogImagePath(page.href));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
  }
};
try {
  await Promise.all(Array.from({ length: availableParallelism() }, worker));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(
  `Rendered ${pages.length} social cards in ${((performance.now() - started) / 1000).toFixed(1)} s; largest ${(largest / 1024).toFixed(1)} KiB`,
);
