// QA script: screenshots one section of a docs page (from a heading to the
// next heading of the same or higher level) on two sites, before and after.
//
//   node section-shots.mjs <before-origin> <after-origin> <output-directory> <shots.json>
// shots.json: [{ "name": "...", "path": "/docs/...", "heading": "heading-id" }]
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [beforeOrigin = "", afterOrigin = "", outputDirectory = "", shotsFile = ""] = process.argv.slice(2);
if (shotsFile === "") {
  throw new Error("Usage: node section-shots.mjs <before-origin> <after-origin> <output-directory> <shots.json>");
}
mkdirSync(outputDirectory, { recursive: true });
const shots = JSON.parse(readFileSync(shotsFile, "utf8"));
const VIEWPORT = { width: 1280, height: 900 };

/** Wraps the heading and its section in one element so it screenshots as one box. */
async function sectionBox(page, headingId) {
  return page.evaluate((id) => {
    const heading = document.getElementById(id)?.closest("h1,h2,h3,h4") ?? document.getElementById(id);
    if (heading === null) return null;
    const level = Number(heading.tagName.slice(1));
    let last = heading;
    for (let node = heading.nextElementSibling; node !== null; node = node.nextElementSibling) {
      if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      last = node;
    }
    const top = heading.getBoundingClientRect().top + window.scrollY;
    const bottom = last.getBoundingClientRect().bottom + window.scrollY;
    const left = Math.min(heading.getBoundingClientRect().left, last.getBoundingClientRect().left);
    const width = Math.max(heading.getBoundingClientRect().width, last.getBoundingClientRect().width);
    return { x: Math.max(0, left - 8), y: Math.max(0, top - 8), width: width + 16, height: bottom - top + 16 };
  }, headingId);
}

const browser = await chromium.launch();
try {
  for (const shot of shots) {
    for (const [label, origin] of [["before", beforeOrigin], ["after", afterOrigin]]) {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.goto(new URL(shot.path, origin).href, { waitUntil: "networkidle" });
      const box = await sectionBox(page, shot.heading);
      if (box === null) {
        process.stdout.write(`${label} ${shot.name}: no heading ${shot.heading}\n`);
      } else {
        await page.screenshot({ path: join(outputDirectory, `${shot.name}-${label}.png`), clip: box, fullPage: true });
        process.stdout.write(`${label} ${shot.name}: ok\n`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
