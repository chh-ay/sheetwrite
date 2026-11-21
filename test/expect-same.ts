import { expect } from "bun:test";

const labels = new WeakMap<object, string>();
let labelled = 0;

/**
 * One line naming a value for an identity check: a DOM node by its tag, id,
 * classes, role and label; any other object (a Grid, a store, an engine) by
 * its class and a number that stays the same for that object.
 */
function nameOf(value: unknown): string {
  if (typeof Element !== "undefined" && value instanceof Element) {
    const id = value.id ? `#${value.id}` : "";
    const classes = [...value.classList].map((name) => `.${name}`).join("");
    const role = value.getAttribute("role");
    const label = value.getAttribute("aria-label");
    return `<${value.localName}${id}${classes}${role ? ` role="${role}"` : ""}${label ? ` aria-label="${label}"` : ""}>`;
  }
  if (typeof value === "object" && value !== null) {
    let name = labels.get(value);
    if (name === undefined) {
      labelled += 1;
      name = `${value.constructor?.name ?? "Object"} #${labelled}`;
      labels.set(value, name);
    }
    return name;
  }
  return String(value);
}

/**
 * Expects `actual` to be `expected` by identity. A failure names both values in
 * one line: bun's diff of two DOM nodes or two grids walks every object they
 * reach and can run out of memory instead of failing.
 */
export function expectSame(actual: unknown, expected: unknown, message?: string): void {
  const prefix = message ? `${message}: ` : "";
  expect(actual === expected, `${prefix}expected ${nameOf(expected)}, got ${nameOf(actual)}`).toBe(
    true,
  );
}

/** Expects `actual` not to be `other` by identity, failing in one line as {@link expectSame} does. */
export function expectDifferent(actual: unknown, other: unknown, message?: string): void {
  const prefix = message ? `${message}: ` : "";
  expect(actual !== other, `${prefix}expected another value than ${nameOf(other)}`).toBe(true);
}
