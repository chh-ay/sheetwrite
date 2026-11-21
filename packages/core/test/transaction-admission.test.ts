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
function admitTwoGuards(log: string[]): GridTransactionAdmissionReservation {
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
    const disposeFirst = registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, "first") }),
    });
    disposeFirst();
    registerGridTransactionAdmission(grid, {
      reserve: () => ({ ok: true, reservation: reservation(log, "second") }),
    });
    disposeFirst();

    const admitted = beginGridTransactionAdmission(grid, []);
    if (!admitted.ok) throw new Error("admission unexpectedly rejected");
    admitted.reservation.finish(outcome);
    expect(log).toEqual(["second:finish:noop"]);
  });

  it("finishes or cancels every reservation exactly once", () => {
    const finishLog: string[] = [];
    const finished = admitTwoGuards(finishLog);
    finished.finish(outcome);
    finished.finish(outcome);
    finished.cancel();
    expect(finishLog).toEqual(["first:finish:noop", "second:finish:noop"]);

    const cancelLog: string[] = [];
    const cancelled = admitTwoGuards(cancelLog);
    cancelled.cancel();
    cancelled.cancel();
    cancelled.finish(outcome);
    expect(cancelLog).toEqual(["first:cancel", "second:cancel"]);
  });

  it("cancels earlier reservations when a later guard rejects or throws", () => {
    const rejectedGrid = {} as Grid;
    const rejectedLog: string[] = [];
    registerGridTransactionAdmission(rejectedGrid, {
      reserve: () => ({ ok: true, reservation: reservation(rejectedLog, "first") }),
    });
    registerGridTransactionAdmission(rejectedGrid, {
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
    const rejected = beginGridTransactionAdmission(rejectedGrid, []);
    expect(rejected.ok).toBe(false);
    expect(rejectedLog).toEqual(["first:cancel"]);

    const thrownGrid = {} as Grid;
    const thrownLog: string[] = [];
    const throwingGuard: GridTransactionAdmissionGuard = {
      reserve: () => {
        throw new Error("guard failed");
      },
    };
    registerGridTransactionAdmission(thrownGrid, {
      reserve: () => ({ ok: true, reservation: reservation(thrownLog, "first") }),
    });
    registerGridTransactionAdmission(thrownGrid, throwingGuard);
    expect(() => beginGridTransactionAdmission(thrownGrid, [])).toThrow("guard failed");
    expect(thrownLog).toEqual(["first:cancel"]);
  });
});
