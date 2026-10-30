import { expect, type Locator, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

// Browser contracts for shared documentation controls: framework tabs, the
// package command, reader preferences, fragments, the symbol filter outline,
// the landing story reel, and focus in forced-colors mode.

const INSTALLATION_URL = siteUrl("/docs/start/installation/");
/** The page clock runs on to this point, then stops; timers then fire only on demand. */
const CLOCK_PAUSE_LEAD_MS = 1_000;

interface PageErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): PageErrors {
  const errors: PageErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  return errors;
}

/** Interactive steps need attached listeners; the root component marks hydration. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

function frameworkTabs(page: Page): Locator {
  return page.getByRole("tablist", { name: "Framework" }).first().getByRole("tab");
}

test("framework tabs follow arrow, Home, and End keys with one tab stop", async ({ page }) => {
  await page.goto(INSTALLATION_URL);
  await waitForHydration(page);
  const tabs = frameworkTabs(page);
  // The article mounts after hydration; wait for its tabs before counting them.
  await expect(tabs.first()).toBeVisible();
  const count = await tabs.count();
  expect(count).toBeGreaterThan(2);

  const expectActive = async (index: number) => {
    const tab = tabs.nth(index);
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute("tabindex", "0");
    await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
  };

  await tabs.first().click();
  await expectActive(0);
  await page.keyboard.press("ArrowRight");
  await expectActive(1);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expectActive(count - 1);
  await page.keyboard.press("Home");
  await expectActive(0);
  await page.keyboard.press("End");
  await expectActive(count - 1);
});

test("blocked browser storage leaves every preference control working", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });
  const errors = collectErrors(page);
  await page.goto(INSTALLATION_URL);
  await waitForHydration(page);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const tabs = frameworkTabs(page);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  // Each framework tab holds its own install command; use the visible one.
  const terminal = page.locator(".sw-terminal:visible").first();
  await terminal.getByRole("tab", { name: "pnpm", exact: true }).click();
  await expect(terminal.locator("pre")).toContainText("pnpm add");

  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: /^Use (light|dark) theme$/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", theme ?? "");

  expect(errors.page).toEqual([]);
});

test("copied feedback belongs to the command that was copied", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  // A paused clock keeps the feedback timer from clearing "Copied" on its own.
  await page.clock.install();
  await page.goto(INSTALLATION_URL);
  await waitForHydration(page);
  await page.clock.pauseAt(Date.now() + CLOCK_PAUSE_LEAD_MS);
  const terminal = page.locator(".sw-terminal:visible").first();

  await terminal.getByRole("tab", { name: "npm", exact: true }).click();
  await terminal.getByRole("button", { name: "Copy" }).click();
  await expect(terminal.getByRole("button", { name: "Copied" })).toBeVisible();

  await terminal.getByRole("tab", { name: "pnpm", exact: true }).click();
  await expect(terminal.locator(".sw-terminal__copy")).toHaveText("Copy");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("npm install");
});

test("a malformed fragment is ignored", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${INSTALLATION_URL}#%`);
  await waitForHydration(page);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors.page).toEqual([]);
});

test("the formula reference engine filter has the select popup styles", async ({ page }) => {
  await page.goto(siteUrl("/docs/reference/formula-functions/math/"));
  await waitForHydration(page);

  await page.getByRole("combobox", { name: "Available in" }).click();
  const popup = page.locator(".sw-demo-select__popup");
  await expect(popup).toBeVisible();

  const style = await popup.evaluate((element) => {
    const computed = getComputedStyle(element);
    const positioner = element.closest(".sw-demo-select__positioner");
    return {
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,
      positionerLayer: positioner === null ? "" : getComputedStyle(positioner).zIndex,
    };
  });
  expect(style.borderRadius).toBe("8px");
  expect(style.boxShadow).not.toBe("none");
  expect(style.positionerLayer).toBe("100");
});

test("the outline lists only symbol groups that the filter shows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(siteUrl("/docs/api/core/"));
  await waitForHydration(page);
  const outline = page.getByRole("navigation", { name: "On this page", exact: true });
  await expect(outline.getByRole("link", { name: "Classes", exact: true })).toHaveCount(1);

  await page.getByRole("searchbox", { name: "Filter exported symbols" }).fill("createGrid");

  await expect(outline.getByRole("link", { name: "Classes", exact: true })).toHaveCount(0);
  const hiddenTargets = await outline.locator("a").evaluateAll((links) =>
    links.filter((link) => {
      const target = document.getElementById(link.getAttribute("href")?.slice(1) ?? "");
      return target === null || target.hidden;
    }),
  );
  expect(hiddenTargets).toHaveLength(0);
});

test("the story reel holds its story while focus is inside or the reader pauses it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(siteUrl("/"));
  await waitForHydration(page);
  const reel = page.locator(".sw-reel");
  await reel.scrollIntoViewIfNeeded();
  const timer = reel.locator(".sw-reel__timer");
  await expect(timer).toHaveCount(1);

  // A focused story link must not be removed by an automatic story change.
  await reel.locator(".sw-reel__copy a").focus();
  await expect(timer).toHaveCount(0);
  await blurFocus(page);
  await expect(timer).toHaveCount(1);

  const pause = reel.getByRole("button", { name: "Pause stories" });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await blurFocus(page);
  await expect(timer).toHaveCount(0);

  await pause.click();
  await blurFocus(page);
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect(timer).toHaveCount(1);
});

test("keyboard focus stays visible in forced-colors mode", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto(siteUrl("/docs/"));
  await waitForHydration(page);

  const outlineOfFocused = () =>
    page.evaluate(() => {
      const focused = document.activeElement;
      return focused === null ? "none" : getComputedStyle(focused).outlineStyle;
    });

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("A");
  expect(await outlineOfFocused()).toBe("solid");

  await page.getByRole("button", { name: /^Use (light|dark) theme$/ }).focus();
  expect(await outlineOfFocused()).toBe("solid");
});

const FIRST_GRID_URL = siteUrl("/docs/start/first-grid/");
/** Longer than the popover close delay, so a scheduled close has run. */
const AFTER_POPOVER_CLOSE_MS = 300;

/** The first code trigger whose hover panel holds a link the reader can focus. */
async function popoverWithLink(page: Page): Promise<{ trigger: Locator; panelId: string }> {
  // The URL and shell can change before lazy MDX replaces the old article.
  // Scope discovery to this page's example, never the outgoing page's triggers.
  const example = page.getByRole("figure", { name: "Complete first grid", exact: true });
  await expect(example).toBeVisible();
  const findPanelId = () =>
    example.evaluate((element) => {
      for (const trigger of element.querySelectorAll<HTMLElement>(
        "[data-sw-code-popover-trigger]",
      )) {
        const id = trigger.dataset.swCodePopoverTrigger ?? "";
        if (document.getElementById(id)?.querySelector("a[href]")) return id;
      }
      return "";
    });
  // The article mounts after hydration and after client-side navigation.
  await expect.poll(findPanelId).not.toBe("");
  const panelId = await findPanelId();
  return { trigger: page.locator(`[data-sw-code-popover-trigger="${panelId}"]`).first(), panelId };
}

test("a code popover stays open while focus is on its link and closes on Escape", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(FIRST_GRID_URL);
  await waitForHydration(page);
  const { trigger, panelId } = await popoverWithLink(page);
  const panel = page.locator(`[id="${panelId}"]`);

  await trigger.focus();
  await expect(panel).toBeVisible();
  const link = panel.locator("a[href]").first();
  await link.focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(AFTER_POPOVER_CLOSE_MS);
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("leaving and revisiting a page leaves one copy of each code popover", async ({ page }) => {
  await page.goto(FIRST_GRID_URL);
  await waitForHydration(page);
  const { trigger, panelId } = await popoverWithLink(page);
  await trigger.focus();
  await expect(page.locator(`body > [id="${panelId}"]`)).toHaveCount(1);

  await page
    .getByRole("navigation", { name: "Documentation" })
    .getByRole("link", { name: "Installation", exact: true })
    .click();
  await expect(page).toHaveURL(INSTALLATION_URL);
  await expect(page.locator(`[id="${panelId}"]`)).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(FIRST_GRID_URL);
  await (await popoverWithLink(page)).trigger.focus();
  await expect(page.locator(`[id="${panelId}"]`)).toHaveCount(1);
});
