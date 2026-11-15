import { describe, expect, it } from "bun:test";

import { nextTurn, Scope } from "../src/scope.js";

describe("Scope", () => {
  it("frees a deferred resource once: at the delay or when the scope closes first", async () => {
    const scope = new Scope();
    const freed: string[] = [];
    scope.disposeAfter(() => freed.push("early"), 0);
    scope.disposeAfter(() => freed.push("late"), 60_000);
    await nextTurn(new Scope());

    scope.close();

    expect(freed).toEqual(["early", "late"]);
  });
});
