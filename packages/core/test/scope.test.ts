import { describe, expect, it } from "bun:test";

import { nextTurn, Scope, ScopeSlot } from "../src/scope.js";

describe("Scope", () => {
  it("aborts its signal first, then runs disposers in reverse order", () => {
    const scope = new Scope();
    const order: string[] = [];
    scope.add(() => order.push(`first, aborted ${scope.signal.aborted}`));
    scope.add(() => order.push("second"));

    scope.close();

    expect(order).toEqual(["second", "first, aborted true"]);
  });

  it("runs every disposer when one throws, then throws the first error", () => {
    const scope = new Scope();
    const ran: string[] = [];
    scope.add(() => ran.push("last"));
    scope.add(() => {
      throw new Error("first failure");
    });
    scope.add(() => {
      throw new Error("second failure");
    });

    expect(() => scope.close()).toThrow("second failure");
    expect(ran).toEqual(["last"]);
  });

  it("runs a disposer added after close at once", () => {
    const scope = new Scope();
    scope.close();
    let ran = false;

    scope.add(() => {
      ran = true;
    });

    expect(ran).toBe(true);
  });

  it("closes a child with the parent's reason, and a closed child leaves the parent", () => {
    const parent = new Scope();
    const finished = parent.child();
    finished.close();
    const running = parent.child();
    let finishedClosedAgain = false;
    finished.add(() => {
      finishedClosedAgain = true;
    });
    const reason = new Error("grid destroyed");

    parent.close(reason);

    expect(running.signal.reason).toBe(reason);
    expect(finishedClosedAgain).toBe(true);
  });

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

describe("ScopeSlot", () => {
  it("closes the running operation when the next one opens", () => {
    const slot = new ScopeSlot(new Scope());
    const older = slot.next();
    const newer = slot.next();

    expect(older.closed).toBe(true);
    expect(newer.closed).toBe(false);
    expect(slot.current()).toBe(newer);
  });
});

describe("nextTurn", () => {
  it("rejects with the scope's reason when the scope closes during the turn", async () => {
    const scope = new Scope();
    const turn = nextTurn(scope);
    const reason = new Error("selection changed");

    scope.close(reason);

    await expect(turn).rejects.toBe(reason);
  });
});
