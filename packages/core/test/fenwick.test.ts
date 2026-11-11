import { describe, expect, it } from "bun:test";

import { ScaledScroll } from "../src/fenwick.js";

describe("ScaledScroll", () => {
  it("maps a capped scroll range onto the full virtual range above the cap", () => {
    const cap = 1000;
    const total = 10000;
    const viewport = 200;
    const s = new ScaledScroll(total, viewport, cap);
    expect(s.scaled).toBe(true);
    expect(s.sizerHeight).toBe(cap);
    // both ranges start at 0 and end at their max simultaneously
    expect(s.toContent(0)).toBe(0);
    expect(s.toContent(cap - viewport)).toBeCloseTo(total - viewport, 5);
    // round trips within the scrollable range [0, cap - viewport]
    const scroll = 600;
    expect(s.toScroll(s.toContent(scroll))).toBeCloseTo(scroll, 5);
  });

  it("re-engages scaling when the measured cap drops below the content height", () => {
    // A browser-zoom change shrinks the layout clamp mid-session: 30M px of
    // content fit under a 33M cap (identity) but not under the ~26.8M clamp
    // Chromium applies at 125% zoom. The remap must expose the full range.
    const total = 30_000_000;
    const viewport = 600;
    const s = new ScaledScroll(total, viewport, 33_000_000);
    expect(s.scaled).toBe(false);
    expect(s.sizerHeight).toBe(total);

    const zoomedCap = 26_843_545;
    s.update(total, viewport, zoomedCap);
    expect(s.scaled).toBe(true);
    expect(s.sizerHeight).toBe(zoomedCap);
    // The last row stays reachable at the clamped maximum scroll position.
    expect(s.toContent(zoomedCap - viewport)).toBeCloseTo(total - viewport, 5);
  });
});
