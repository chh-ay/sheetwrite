import { expect, siteUrl, test } from "./fixtures.js";

// An interaction island hydrates on first use. Its first input must act once
// the code has loaded: a key the browser turns into a click (Enter or Space on
// a button, Enter on a link, Space on a checkbox) and text typed into a field.
// Each test's input is the first its island receives, on a fresh page.
// Tagged @portability: the activation each browser performs is what is under test.

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
  });
}
