import { expect, type Page, test } from "@playwright/test";

import { siteUrl } from "./playwright.config.js";

// An interaction island hydrates on first use. Its first input must act once
// the code has loaded: a key the browser turns into a click (Enter or Space on
// a button, Enter on a link, Space on a checkbox) and text typed into a field.
// Each test's input is the first its island receives. Tagged @portability:
// the activation each browser performs is what is under test.

const FIXTURES = siteUrl("/test/islands/");

function fixture(page: Page, name: string) {
  return page.locator(".sw-activation-fixture", {
    has: page.getByTestId(`activation-${name}`),
  });
}

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(FIXTURES);
  return errors;
}

for (const key of ["Enter", "Space"] as const) {
  test(`@portability ${key} on a button is the island's first input and clicks it once`, async ({
    page,
  }) => {
    const errors = await open(page);
    const name = `button-${key.toLowerCase()}`;
    await fixture(page, name).getByRole("button", { name: "Press" }).focus();
    await page.keyboard.press(key);
    await expect(page.getByTestId(`activation-${name}`)).toHaveText("presses: 1");
    expect(errors).toEqual([]);
  });
}

test("@portability Enter on a link is the island's first input and follows it once", async ({
  page,
}) => {
  const errors = await open(page);
  await fixture(page, "link").getByRole("link", { name: "Follow" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("activation-link")).toHaveText("presses: 1");
  await expect(page).toHaveURL(/#followed$/u);
  expect(errors).toEqual([]);
});

test("@portability Space on a checkbox is the island's first input and checks it", async ({
  page,
}) => {
  const errors = await open(page);
  const checkbox = fixture(page, "checkbox").getByRole("checkbox", { name: "Check" });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("activation-checkbox")).toHaveText("checked: true");
  await expect(checkbox).toBeChecked();
  expect(errors).toEqual([]);
});

test("@portability text typed before the island hydrates is kept", async ({ page }) => {
  const errors = await open(page);
  const field = fixture(page, "text").getByRole("textbox", { name: "Type" });
  await field.focus();
  await page.keyboard.type("abc");
  await expect(field).toHaveValue("abc");
  await expect(page.getByTestId("activation-text")).toHaveText("text: abc");
  expect(errors).toEqual([]);
});
