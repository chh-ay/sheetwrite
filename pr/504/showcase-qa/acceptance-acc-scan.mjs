// acc-scan.mjs <static dir>: figures per page and content image checks for #504's acceptance.
import fs from "node:fs"; import path from "node:path";
const root = process.argv[2];
const SECTIONS = { features: "feature", concepts: "concept", start: "guide", tutorials: "guide", frameworks: "guide", "import-export": "guide", performance: "guide", releases: "release" };
const KINDS = [
  ["screenshot", /<img [^>]*class="sw-shot\b/g],
  ["diagram/illustration", /<figure class="sw-art-figure"|class="sw-section-art"/g],
  ["live grid", /class="sw-live-grid"|data-island="runnable-code"/g],
  ["grid result", /<figure class="sw-grid-result"/g],
  ["chart", /<figure class="(perf-bars|version-bars|sw-memory-comparison)"/g],
  ["framed figure", /<figure class="sw-frame\b/g],
];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "index.html" ? [path.join(d, e.name)] : []);
const pages = [], images = [];
for (const [sec, kind] of Object.entries(SECTIONS)) {
  for (const f of walk(path.join(root, "docs", sec))) {
    const html = fs.readFileSync(f, "utf8");
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    const found = KINDS.map(([k, re]) => [k, (main.match(re) ?? []).length]).filter(([, n]) => n > 0);
    const url = "/" + path.relative(root, path.dirname(f)) + "/";
    pages.push({ url, kind, found });
    for (const img of main.match(/<img\b[^>]*>/g) ?? []) {
      const attr = (a) => { const m = new RegExp(`\\s${a}="([^"]*)"`).exec(img); return m ? m[1] : null; };
      const src = attr("src") ?? "";
      images.push({ url, src, ext: (src.split("?")[0].match(/\.(\w+)$/) ?? [, "?"])[1], width: attr("width"), height: attr("height"), alt: attr("alt"), cls: attr("class") });
    }
  }
}
const none = pages.filter((p) => p.found.length === 0);
console.log(`PAGES ${pages.length}; by kind: ${Object.entries(pages.reduce((a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`NO FIGURE ${none.length}:`); for (const p of none) console.log(`  ${p.kind}\t${p.url}`);
console.log(`WITH FIGURE ${pages.length - none.length}`);
console.log(`IMAGES ${images.length}; formats: ${Object.entries(images.reduce((a, i) => ((a[i.ext] = (a[i.ext] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", ")}`);
const bad = images.filter((i) => !["avif", "webp"].includes(i.ext) || !i.width || !i.height || i.alt === null);
console.log(`IMAGES FAILING format/size/alt-attribute ${bad.length}:`); for (const i of bad) console.log(`  ${i.url} ${i.src} w=${i.width} h=${i.height} alt=${i.alt === null ? "MISSING" : JSON.stringify(i.alt)}`);
const emptyAlt = images.filter((i) => i.alt === "");
console.log(`IMAGES WITH EMPTY alt ${emptyAlt.length}:`); for (const i of emptyAlt) console.log(`  ${i.url} ${i.src} class=${i.cls}`);
fs.writeFileSync("/home/vvin/learn/scratch/dsq/logs/acc-scan.json", JSON.stringify({ pages, images }, null, 1));
