import { expect, it } from "bun:test";

import { expectedResultHeight } from "../src/playground/layout.ts";

it("reads the height an example gives its grid host", () => {
  expect(expectedResultHeight('const host = el;\nhost.style.height = "420px";')).toBe(420);
  expect(expectedResultHeight("host.style.height='320px'")).toBe(320);
  expect(expectedResultHeight('host.style.height = "50vh";')).toBeUndefined();
  expect(expectedResultHeight("createGrid(document.body, options);")).toBeUndefined();
});
