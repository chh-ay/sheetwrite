// Before/after screenshots of renderChartSvg column charts from two trees,
// with pixel diffs. Bun + Playwright.
//   bun bars-visual.ts <base-tree> <pr-tree> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const [baseTree, prTree, outDir] = process.argv.slice(2);
if (!baseTree || !prTree || !outDir) throw new Error("usage: base pr out");
mkdirSync(outDir, { recursive: true });

async function bundle(tree: string): Promise<string> {
  const entry = join(outDir, `entry-${tree.replace(/\W/g, "_")}.ts`);
  writeFileSync(
    entry,
    `import { renderChartSvg } from "${tree}/packages/charts/src/chart-svg.ts";\n(globalThis as Record<string, unknown>).renderChartSvg = renderChartSvg;\n`,
  );
  const result = await Bun.build({ entrypoints: [entry], target: "browser", minify: false });
  if (!result.success) throw new Error(result.logs.join("\n"));
  return await result.outputs[0].text();
}

const chartsCss = readFileSync(join(prTree, "packages/core/styles/charts.css"), "utf8");
const page = (script: string) => `<!doctype html><html><head><style>
${chartsCss}
body { margin: 0; }
.sheetwrite { --sheetwrite-fg: #1f2328; --sheetwrite-bg: #ffffff; --sheetwrite-grid-line: #d0d7de; --sheetwrite-font: 11px system-ui, sans-serif; background: var(--sheetwrite-bg); color: var(--sheetwrite-fg); display: inline-block; }
[data-theme="dark"] .sheetwrite { --sheetwrite-fg: #e6edf3; --sheetwrite-bg: #0d1117; --sheetwrite-grid-line: #30363d; }
</style></head><body><div id="theme"><div class="sheetwrite" id="host"></div></div><script>${script}</script></body></html>`;

interface Case { name: string; points: number }
const WIDTH = 480;
const HEIGHT = 300;

function view(points: number) {
  const series = [0, 1, 2].map((s) => {
    const values = Array.from({ length: points }, (_, i) => 20 + ((i * (13 + s * 7) + s * 31) % 97));
    return {
      name: `Series ${s + 1}`,
      values,
      categories: values.map((_, i) => `Day ${i + 1}`),
      categoryLevels: [],
      numberFormats: values.map(() => null),
      categoryFormats: values.map(() => null),
      numberLocale: null,
      truncated: false,
      referenceError: false,
    };
  });
  return {
    chart: { id: "c", kind: "column", title: "Daily units", anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: WIDTH, height: HEIGHT }, series: [] },
    series,
  };
}

const browser = await chromium.launch({ headless: true });
const scripts = { before: await bundle(baseTree), after: await bundle(prTree) };

async function shoot(side: "before" | "after", points: number, scale: number, theme: string) {
  const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 600, height: 400 } });
  const tab = await context.newPage();
  await tab.setContent(page(scripts[side]));
  const stats = await tab.evaluate(
    ({ points, theme, viewJson, width, height }) => {
      document.querySelector("#theme")?.setAttribute("data-theme", theme);
      const render = (globalThis as unknown as { renderChartSvg: (v: unknown, s: unknown) => SVGSVGElement }).renderChartSvg;
      const svg = render(JSON.parse(viewJson), { width, height });
      document.querySelector("#host")?.replaceChildren(svg);
      return {
        rects: svg.querySelectorAll(".sheetwrite-chart-bar").length,
        paths: svg.querySelectorAll(".sheetwrite-chart-bars").length,
        elements: svg.querySelectorAll("*").length,
        titles: svg.querySelectorAll("title").length,
        labelled: svg.querySelectorAll("[aria-label],[aria-labelledby],[role]").length,
      };
    },
    { points, theme, viewJson: JSON.stringify(view(points)), width: WIDTH, height: HEIGHT },
  );
  const png = await tab.locator("#host svg").screenshot();
  await context.close();
  return { png, stats };
}

async function diff(a: Buffer, b: Buffer): Promise<{ differing: number; over4: number; over8: number; total: number; maxDelta: number; image: Buffer }> {
  const tab = await browser.newPage();
  const result = await tab.evaluate(
    async ({ a, b }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = src;
        });
      const [left, right] = await Promise.all([load(a), load(b)]);
      const canvas = (image: HTMLImageElement) => {
        const element = document.createElement("canvas");
        element.width = image.width;
        element.height = image.height;
        const context = element.getContext("2d");
        context?.drawImage(image, 0, 0);
        return element;
      };
      const ca = canvas(left);
      const cb = canvas(right);
      const da = ca.getContext("2d")?.getImageData(0, 0, ca.width, ca.height).data ?? new Uint8ClampedArray();
      const db = cb.getContext("2d")?.getImageData(0, 0, cb.width, cb.height).data ?? new Uint8ClampedArray();
      const out = document.createElement("canvas");
      out.width = ca.width;
      out.height = ca.height;
      const octx = out.getContext("2d");
      const image = octx?.createImageData(ca.width, ca.height);
      let differing = 0;
      let over4 = 0;
      let over8 = 0;
      let maxDelta = 0;
      for (let i = 0; i < da.length; i += 4) {
        let delta = 0;
        for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs((da[i + c] ?? 0) - (db[i + c] ?? 0)));
        if (delta > 0) differing++;
        if (delta > 4) over4++;
        if (delta > 8) over8++;
        maxDelta = Math.max(maxDelta, delta);
        if (image) {
          const grey = Math.round(((da[i] ?? 0) + (da[i + 1] ?? 0) + (da[i + 2] ?? 0)) / 12) + 170;
          image.data[i] = delta > 0 ? 255 : grey;
          image.data[i + 1] = delta > 0 ? 0 : grey;
          image.data[i + 2] = delta > 0 ? 0 : grey;
          image.data[i + 3] = 255;
        }
      }
      if (image) octx?.putImageData(image, 0, 0);
      return { differing, over4, over8, total: da.length / 4, maxDelta, sameSize: ca.width === cb.width && ca.height === cb.height, url: out.toDataURL("image/png") };
    },
    { a: `data:image/png;base64,${a.toString("base64")}`, b: `data:image/png;base64,${b.toString("base64")}` },
  );
  await tab.close();
  if (!result.sameSize) throw new Error("screenshot sizes differ");
  return { ...result, image: Buffer.from(result.url.split(",")[1] ?? "", "base64") };
}

// The threshold: the fewest points the PR draws as paths.
async function threshold(): Promise<number> {
  for (let points = 380; points < 480; points++) {
    const { stats } = await shoot("after", points, 1, "light");
    if (stats.paths > 0) return points;
  }
  throw new Error("no threshold under 480 points");
}

const over = await threshold();
const cases: Case[] = [
  { name: "dense-1000", points: 1000 },
  { name: `over-${over}`, points: over },
  { name: `under-${over - 1}`, points: over - 1 },
];
const rows: string[] = [];
for (const item of cases) {
  for (const theme of ["light", "dark"]) {
    for (const scale of [1, 2]) {
      const before = await shoot("before", item.points, scale, theme);
      const after = await shoot("after", item.points, scale, theme);
      const result = await diff(before.png, after.png);
      const stem = `${item.name}-${theme}-${scale}x`;
      writeFileSync(join(outDir, `${stem}-before.png`), before.png);
      writeFileSync(join(outDir, `${stem}-after.png`), after.png);
      writeFileSync(join(outDir, `${stem}-diff.png`), result.image);
      rows.push(
        JSON.stringify({ stem, before: before.stats, after: after.stats, differing: result.differing, over4: result.over4, over8: result.over8, total: result.total, maxDelta: result.maxDelta }),
      );
    }
  }
}
writeFileSync(join(outDir, "summary.jsonl"), `${rows.join("\n")}\n`);
process.stdout.write(`${rows.join("\n")}\n`);
await browser.close();
