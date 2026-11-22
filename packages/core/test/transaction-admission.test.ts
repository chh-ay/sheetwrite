import { describe, expect, it } from "bun:test";

import {
  beginGridTransactionAdmission,
  type GridTransactionAdmissionGuard,
  type GridTransactionAdmissionReservation,
  registerGridTransactionAdmission,
} from "../src/transaction-admission.js";
import type { Grid } from "../src/types/grid.js";
import type { ApplyTransactionResult } from "../src/types/transaction.js";

const outcome: ApplyTransactionResult = { status: "noop", epoch: 0, reason: "empty" };

function reservation(log: string[], name: string): GridTransactionAdmissionReservation {
  return {
    cancel: () => log.push(`${name}:cancel`),
    finish: (result) => log.push(`${name}:finish:${result.status}`),
  };
}

/** Admits an empty transaction through two guards on a fresh grid. */
function admit_two_guards(log: string[]): GridTransactionAdmissionReservation {
  const grid = {} as Grid;
  for (const name of ["first", "second"]) {
    registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, name) }),
    });
  }
  const admitted = beginGridTransactionAdmission(grid, []);
  if (!admitted.ok) throw new Error("multi-guard admission unexpectedly rejected");
  return admitted.reservation;
}

describe("grid transaction admission", () => {
  it("keeps a later guard when an earlier guard's dispose runs twice", () => {
    const grid = {} as Grid;
    const log: string[] = [];
    const dispose_first = registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, "first") }),
    });
    dispose_first();
    registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, "second") }),
    });
    dispose_first();

    const admitted = beginGridTransactionAdmission(grid, []);
    if (!admitted.ok) throw new Error("admission unexpectedly rejected");
    admitted.reservation.finish(outcome);
    expect(log).toEqual(["second:finish:noop"]);
  });

  it("finishes or cancels every reservation exactly once", () => {
    const finish_log: string[] = [];
    const finished = admit_two_guards(finish_log);
    finished.finish(outcome);
    finished.finish(outcome);
    finished.cancel();
    expect(finish_log).toEqual(["first:finish:noop", "second:finish:noop"]);

    const cancel_log: string[] = [];
    const cancelled = admit_two_guards(cancel_log);
    cancelled.cancel();
    cancelled.cancel();
    cancelled.finish(outcome);
    expect(cancel_log).toEqual(["first:cancel", "second:cancel"]);
  });

  it("cancels earlier reservations when a later guard rejects or throws", () => {
    const rejected_grid = {} as Grid;
    const rejected_log: string[] = [];
    registerGridTransactionAdmission(rejected_grid, {
      reserve: () => ({ ok: true, reservation: reservation(rejected_log, "first") }),
    });
    registerGridTransactionAdmission(rejected_grid, {
      reserve: () => ({
        ok: false,
        issue: {
          kind: "resource-limit",
          severity: "error",
          resource: "operations",
          actual: 2,
          max: 1,
          message: "too many operations",
        },
      }),
    });
    const rejected = beginGridTransactionAdmission(rejected_grid, []);
    expect(rejected.ok).toBe(false);
    expect(rejected_log).toEqual(["first:cancel"]);

    const thrown_grid = {} as Grid;
    const thrown_log: string[] = [];
    const throwing_guard: GridTransactionAdmissionGuard = {
      reserve: () => {
        throw new Error("guard failed");
      },
    };
    registerGridTransactionAdmission(thrown_grid, {
      reserve: () => ({ ok: true, reservation: reservation(thrown_log, "first") }),
    });
    registerGridTransactionAdmission(thrown_grid, throwing_guard);
    expect(() => beginGridTransactionAdmission(thrown_grid, [])).toThrow("guard failed");
    expect(thrown_log).toEqual(["first:cancel"]);
  });
});
