import { expect, test } from "@playwright/test";

import { siteUrl } from "./fixtures.js";

// An island hydrates on first use; its first input, on a fresh page, must act once:
// a key the browser turns into a click, or text typed into a field. @portability:
// each browser performs its own activation. Only page errors fail a run (WebKit
// logs a console error for prefetches over HTTP).

const FIXTURES = siteUrl("/test/islands/");

for (const { name, role, label, keys, shown } of [
  { name: "button-enter", role: "button", label: "Press", keys: "Enter", shown: "presses: 1" },
  { name: "button-space", role: "button", label: "Press", keys: "Space", shown: "presses: 1" },
  { name: "link", role: "link", label: "Follow", keys: "Enter", shown: "presses: 1" },
  { name: "checkbox", role: "checkbox", label: "Check", keys: "Space", shown: "checked: true" },
  { name: "text", role: "textbox", label: "Type", keys: "abc", shown: "text: abc" },
] as const) {
  test(`@portability ${keys} on the ${name} fixture is the island's first input and acts once`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(FIXTURES);
    const control = page
      .locator(".sw-activation-fixture", { has: page.getByTestId(`activation-${name}`) })
      .getByRole(role, { name: label });
    await control.focus();
    if (role === "textbox") await page.keyboard.type(keys);
    else await page.keyboard.press(keys);
    await expect(page.getByTestId(`activation-${name}`)).toHaveText(shown);
    if (role === "link") await expect(page).toHaveURL(/#followed$/u);
    if (role === "checkbox") await expect(control).toBeChecked();
    if (role === "textbox") await expect(control).toHaveValue(keys);
    expect(errors).toEqual([]);
  });
}
