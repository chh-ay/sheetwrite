import { describe, expect, it } from "bun:test";

import { type NavigationItem, navigationBadge } from "../src/lib/navigation.js";

describe("navigationBadge", () => {
  const RELEASE = "0.6.0";
  const volatile: NavigationItem = {
    label: "Volatile",
    href: "/docs/formulas/volatile/",
    updated: RELEASE,
  };
  const calculation: NavigationItem = {
    label: "Calculation",
    items: [volatile, { label: "Iterative", href: "/docs/formulas/iterative/", added: RELEASE }],
  };
  const old: NavigationItem = { label: "Old", href: "/docs/old/", added: "0.5.0" };

  it.each([
    // A group holding one updated and one new page shows new.
    [calculation, RELEASE, "new"],
    [volatile, RELEASE, "updated"],
    // Badges last through patch releases and clear at the next minor release.
    [old, "0.5.4", "new"],
    [volatile, "0.6.1", "updated"],
    [old, RELEASE, undefined],
    [calculation, "0.7.0", undefined],
  ] as const)("gives %o at %s the badge %s", (item, release, badge) => {
    expect(navigationBadge(item, release)).toBe(badge);
  });
});
