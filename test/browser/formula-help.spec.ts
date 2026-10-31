import { expect, test, type Page } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

const ROUTE = siteUrl("/showcases/spreadsheet/");

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
}

/** Select `reference` with the name box, then start typing in the cell, as a user does. */
async function editCell(page: Page, reference: string, text: string) {
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill(reference);
  await nameBox.press("Enter");
  await page.keyboard.type(text);
}

test("the cell editor lists functions, picks one with the keyboard, and guides the arguments", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);

  await editCell(page, "J2", "=ROU");
  const editor = page.locator("textarea.sheetwrite-editor");
  const list = page.getByRole("listbox", { name: "Functions" });
  await expect(list.getByRole("option", { name: "ROUND", exact: true })).toBeVisible();
  await expect(editor).toHaveAttribute("aria-autocomplete", "list");
  await expect(editor).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");
  const active = await editor.getAttribute("aria-activedescendant");
  await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue("=ROUND(");
  await expect(list).toHaveCount(0);

  const guide = page.getByRole("status").filter({ hasText: "ROUND(" });
  await expect(guide.locator("strong")).toHaveText("number");
  await page.keyboard.type("A1:A3, ");
  await expect(guide.locator("strong")).toHaveText("digits");

  await page.keyboard.type("2");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a click picks a function, references get colours, and errors show while typing", async ({
  page,
}) => {
  await open(page);

  await editCell(page, "J2", "=SU");
  const option = page.getByRole("option", { name: "SUMIF", exact: true });
  await option.click();
  const editor = page.locator("textarea.sheetwrite-editor");
  await expect(editor).toHaveValue("=SUMIF(");
  await expect(editor).toBeFocused();

  await page.keyboard.type("C2:C5, 1))");
  const range = page.locator(".sheetwrite-formula-mirror span", { hasText: "C2:C5" });
  await expect(range).toHaveCSS("color", "rgb(66, 133, 244)");
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("status")).toContainText("This ) has no matching (.");

  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".sheetwrite-formula-mirror")).toHaveCount(0);
});

test("the formula bar is a combobox with the same help", async ({ page }) => {
  await open(page);

  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("J2");
  await nameBox.press("Enter");
  const bar = page.getByRole("combobox", { name: "Formula bar" });
  await page.getByRole("textbox", { name: "Formula bar" }).click();
  await page.keyboard.type("=AVERAG");

  await expect(bar).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await expect(bar).toHaveValue("=AVERAGE(");
  await expect(bar).toHaveAttribute("aria-expanded", "false");
});

test("Formulas › Explain Formula describes the formula in the focus cell", async ({ page }) => {
  await open(page);

  await editCell(page, "J2", "=ROUND(G2, 1)");
  await page.keyboard.press("Enter");
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("J2");
  await nameBox.press("Enter");

  await page.getByRole("tab", { name: "Formulas" }).click();
  await page.getByRole("button", { name: "Explain Formula" }).click();

  const panel = page.getByRole("complementary", { name: "Explain Formula" });
  await expect(panel).toContainText("Formula in J2");
  await expect(panel).toContainText("ROUND(number, digits)");
  await expect(panel).toContainText("digits: 1");
  await expect(panel).toContainText("G2: 1 cell on this sheet");
});
