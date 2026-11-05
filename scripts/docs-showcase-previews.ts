/**
 * Captures the preview image of every showcase, in both themes, for the
 * landing page and the showcase index.
 *
 *   bun scripts/docs-showcase-previews.ts <site-url>
 *
 * Start the docs site first (`bun run --cwd docs dev` or a preview build) and
 * pass its URL. Each showcase is opened at a desktop width, its live demo is
 * left to settle, and the demo region is saved as
 * docs/public/showcase-previews/<owner>-<theme>.jpg. Rerun it when a
 * showcase's look changes; the images are committed with that change.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { chromium, type Page } from "@playwright/test";

import { CAPABILITY_OWNERS } from "../docs/src/showcases/capabilities.ts";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT_DIR = join(ROOT, "docs/public/showcase-previews");
const VIEWPORT = { width: 1280, height: 800 } as const;
/** Device pixels per CSS pixel: cards show previews near 400 px wide, so 960 px is sharp enough. */
const SCALE = 0.75;
const JPEG_QUALITY = 70;
/** Time for a live demo's engine to start and paint its first frame. */
const SETTLE_MS = 2500;
const THEMES = ["light", "dark"] as const;
/** The demo region of the shared showcase layout; older pages fall back to the main element. */
const DEMO_SELECTORS = [".sw-showcase__demo", "main"] as const;

async function demoRegion(page: Page) {
  for (const selector of DEMO_SELECTORS) {
    const region = page.locator(selector).first();
    if ((await region.count()) > 0) return region;
  }
  throw new Error(`${page.url()} has no demo region to capture`);
}

async function capture(siteUrl: string): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
      });
      await context.addInitScript(
        (saved) => localStorage.setItem("sheetwrite-theme", saved),
        theme,
      );
      const page = await context.newPage();
      for (const owner of CAPABILITY_OWNERS) {
        await page.goto(new URL(owner.href, siteUrl).href, { waitUntil: "networkidle" });
        await page.waitForTimeout(SETTLE_MS);
        const region = await demoRegion(page);
        await region.scrollIntoViewIfNeeded();
        const box = await region.boundingBox();
        if (box === null) throw new Error(`${owner.href} has an invisible demo region`);
        const path = join(OUTPUT_DIR, `${owner.id}-${theme}.jpg`);
        await page.screenshot({
          path,
          type: "jpeg",
          quality: JPEG_QUALITY,
          clip: {
            x: box.x,
            y: box.y,
            width: Math.min(box.width, VIEWPORT.width),
            height: Math.min(box.height, (box.width * 5) / 8),
          },
        });
        console.log(path);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

const siteUrl = process.argv[2];
if (siteUrl === undefined) {
  console.error("usage: bun scripts/docs-showcase-previews.ts <site-url>");
  process.exit(2);
}
await capture(siteUrl);
