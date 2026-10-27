import { describe, expect, it } from "bun:test";

import { type NavigationItem, navigationBadge, navigationPages } from "../src/lib/navigation.js";

const RELEASE = "0.6.0";

const tree: readonly NavigationItem[] = [
  { label: "Overview", href: "/docs/" },
  {
    label: "Formulas",
    href: "/docs/formulas/",
    items: [
      { label: "References", href: "/docs/formulas/references/" },
      {
        label: "Calculation",
        items: [
          { label: "Volatile", href: "/docs/formulas/volatile/", updated: RELEASE },
          { label: "Iterative", href: "/docs/formulas/iterative/", added: RELEASE },
        ],
      },
    ],
  },
  { label: "Old", href: "/docs/old/", added: "0.5.0" },
];

describe("navigationPages", () => {
  it("lists pages depth-first, a group's own page before its children, and skips page-less groups", () => {
    expect(navigationPages(tree).map((page) => page.href)).toEqual([
      "/docs/",
      "/docs/formulas/",
      "/docs/formulas/references/",
      "/docs/formulas/volatile/",
      "/docs/formulas/iterative/",
      "/docs/old/",
    ]);
  });
});

describe("navigationBadge", () => {
  const [, formulas, old] = tree;
  const calculation = formulas?.items?.[1];

  it("lifts the strongest badge of a group's pages to the group", () => {
    // "Calculation" holds one updated and one new page: new wins.
    expect(calculation && navigationBadge(calculation, RELEASE)).toBe("new");
    expect(formulas && navigationBadge(formulas, RELEASE)).toBe("new");
  });

  it("shows a badge only while its release is the latest", () => {
    expect(old && navigationBadge(old, RELEASE)).toBeUndefined();
    expect(old && navigationBadge(old, "0.5.0")).toBe("new");
    expect(formulas && navigationBadge(formulas, "0.7.0")).toBeUndefined();
  });

  it("marks an updated page that adds nothing new as updated", () => {
    const volatile = calculation?.items?.[0];
    expect(volatile && navigationBadge(volatile, RELEASE)).toBe("updated");
  });
});
