import { beforeAll, describe, expect, it } from "bun:test";

import { DocumentController } from "../src/document-controller.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { DocumentOp } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("DocumentController", () => {
  it("keeps an out-of-range sparse write a no-op without adding history", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    const controller = new DocumentController({
      store,
      loadable: store,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {},
    });

    expect(
      controller.commit(
        [
          {
            op: "setRange",
            range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
            cells: [{ rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "outside" } }],
          },
        ],
        "api",
      ).status,
    ).toBe("noop");
    expect(controller.canUndo).toBe(false);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBeNull();
    controller.destroy();
    store.dispose();
  });

  it.each(["dense", "sparse"])(
    "restores %s batched formulas, references, styles and spill children through undo/redo",
    (layout) => {
      const store = new SheetwriteStore(makeWorkbook(6));
      const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 5, col: 2 } };
      const formula = { sheet: "s1", row: 0, col: 0 };
      const reference =
        layout === "dense" ? { sheet: "s1", row: 3, col: 0 } : { sheet: "s1", row: 5, col: 2 };
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: formula,
            value: { kind: "formula", src: "=SEQUENCE(3)" },
            style: { bold: true },
          },
          {
            op: "set",
            addr: reference,
            value: { kind: "ref", target: formula },
            style: { italic: true },
          },
        ],
      });
      const controller = new DocumentController({
        store,
        loadable: store,
        readOnly: () => false,
        epoch: () => 0,
        materializeVirtualColumns: (patches) => patches,
        onMutationRejected: () => {},
        onHistoryApplied: () => {},
      });

      expect(
        controller.commit(
          [
            { op: "clearRange", range },
            { op: "set", addr: formula, value: { kind: "literal", value: "changed" } },
            { op: "set", addr: { ...formula, row: 1 }, value: { kind: "literal", value: "child" } },
            {
              op: "set",
              addr: { ...formula, row: 2 },
              value: { kind: "literal", value: "child-two" },
            },
            { op: "set", addr: reference, value: { kind: "literal", value: "replaced" } },
          ],
          "api",
        ).status,
      ).toBe("applied");
      controller.undo();

      expect(store.getFormula(formula)).toBe("=SEQUENCE(3)");
      expect(store.getRefTarget(reference)).toEqual(formula);
      expect(store.getCell(formula).style).toEqual({ bold: true });
      expect(store.getCell(reference).style).toEqual({ italic: true });
      expect(store.getCell({ ...formula, row: 2 }).resolved).toBe(3);
      expect(store.getSpillAnchor({ ...formula, row: 1 })).toEqual(formula);

      controller.redo();
      expect(store.getCell({ ...formula, row: 1 }).resolved).toBe("child");
      expect(store.getCell(reference).resolved).toBe("replaced");
      controller.destroy();
      store.dispose();
    },
  );

  it.each([8 * 1024 * 1024, 1200])(
    "replays range undo identically on another peer under a %i-byte ceiling",
    (maxEncodedBytes) => {
      const rowCount = 128;
      const transactionResourceLimits = { maxEncodedBytes, maxOperations: 10_000 };
      const store = new SheetwriteStore(makeWorkbook(rowCount), undefined, {
        transactionResourceLimits,
      });
      const peer = new SheetwriteStore(makeWorkbook(rowCount), undefined, {
        transactionResourceLimits,
      });
      const formula = { sheet: "s1", row: 0, col: 0 };
      const reference = { sheet: "s1", row: 0, col: 1 };
      const range = { sheet: "s1", start: { row: 0, col: 0 }, end: { row: rowCount - 1, col: 2 } };
      // Repeated text makes the plain restore exceed the small ceiling while
      // keeping its compressed replay within one server version.
      for (const target of [store, peer]) {
        for (let row = 0; row < rowCount; row++) {
          expect(
            target.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "s1", row, col: 2 },
                  value: { kind: "literal", value: 'saved "text" — 😀' },
                  style: { italic: true },
                },
              ],
            }).status,
          ).toBe("applied");
        }
        expect(
          target.applyTransaction({
            patches: [
              {
                op: "set",
                addr: formula,
                value: { kind: "formula", src: "=SEQUENCE(3)" },
                style: { bold: true },
              },
              { op: "set", addr: reference, value: { kind: "ref", target: formula } },
            ],
          }).status,
        ).toBe("applied");
      }
      const expected = structuredClone(
        store.getVisibleWindow("s1", { start: 0, end: rowCount }, [0, 1, 2]).values,
      );
      const controller = new DocumentController({
        store,
        loadable: store,
        transactionResourceLimits,
        readOnly: () => false,
        epoch: () => 0,
        materializeVirtualColumns: (patches) => patches,
        trustedResourceCallbacks: true,
        onMutationRejected: (issues) => {
          throw new Error(JSON.stringify(issues));
        },
        onHistoryApplied: () => {},
      });
      const replay = store.on("change", (event) => {
        const patches: DocumentOp[] = JSON.parse(JSON.stringify(event.transaction.patches));
        expect(peer.applyTransaction({ patches }, { source: "remote" }).status).toBe("applied");
      });
      try {
        expect(controller.commit([{ op: "clearRange", range }], "api").status).toBe("applied");
        controller.undo();
        for (const target of [store, peer]) {
          expect(
            target.getVisibleWindow("s1", { start: 0, end: rowCount }, [0, 1, 2]).values,
          ).toEqual(expected);
          expect(target.getFormula(formula)).toBe("=SEQUENCE(3)");
          expect(target.getRefTarget(reference)).toEqual(formula);
          expect(target.getCell(formula).style).toEqual({ bold: true });
          expect(target.getCell({ sheet: "s1", row: 127, col: 2 }).style).toEqual({ italic: true });
        }
        controller.redo();
        expect(peer.getCell(formula).resolved).toBeNull();
        controller.undo();
        expect(peer.getVisibleWindow("s1", { start: 0, end: rowCount }, [0, 1, 2]).values).toEqual(
          expected,
        );
      } finally {
        replay();
        controller.destroy();
        store.dispose();
        peer.dispose();
      }
    },
  );

  it("rejects nested payload growth from callbacks that retain operation identity", () => {
    const maxEncodedBytes = 256;
    const oversizedValue = "x".repeat(maxEncodedBytes * 2);
    for (const mutationBoundary of ["materialization", "admission"] as const) {
      const transactionResourceLimits = { maxEncodedBytes, maxOperations: 1 };
      const store = new SheetwriteStore(makeWorkbook(4), undefined, { transactionResourceLimits });
      const mutatePayload = (patches: readonly import("../src/types.js").DocumentOp[]) => {
        const patch = patches[0];
        if (patch?.op === "set" && patch.value.kind === "literal") {
          patch.value.value = oversizedValue;
        }
      };
      const controller = new DocumentController({
        store,
        loadable: store,
        transactionResourceLimits,
        readOnly: () => false,
        epoch: () => 0,
        materializeVirtualColumns: (patches) => {
          if (mutationBoundary === "materialization") mutatePayload(patches);
          return patches;
        },
        admitTransaction: (patches) => {
          if (mutationBoundary === "admission") mutatePayload(patches);
          return { ok: true, reservation: { cancel() {}, finish() {} } };
        },
        onMutationRejected: () => {},
        onHistoryApplied: () => {},
      });
      const addr = { sheet: "s1", row: 0, col: 0 };
      try {
        expect(
          controller.commit(
            [{ op: "set", addr, value: { kind: "literal", value: "small" } }],
            "api",
          ).status,
        ).toBe("rejected");
        expect(store.getCell(addr).resolved).toBeNull();
      } finally {
        controller.destroy();
        store.dispose();
      }
    }
  });
  it("captures structural and range inverses for Store implementations without compact history", () => {
    const store = new SheetwriteStore(makeWorkbook(4));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: "row-one" },
          style: { bold: true },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 2, col: 1 },
          value: { kind: "formula", src: "=A2" },
        },
      ],
    });
    const controller = new DocumentController({
      store,
      // A custom Store has no compact SheetwriteStore range snapshots. The
      // controller must still construct complete serializable inverses.
      loadable: null,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {},
    });

    expect(
      controller.commit([{ op: "removeRows", sheet: "s1", at: 1, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 })).toMatchObject({
      resolved: "row-one",
      style: { bold: true },
    });
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    expect(
      controller.commit([{ op: "removeColumns", sheet: "s1", at: 0, count: 2 }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(
      store
        .getWorkbook()
        .sheets[0]!.columns.slice(0, 2)
        .map(({ key }) => key),
    ).toEqual(["name", "amount"]);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");

    const range = {
      sheet: "s1",
      start: { row: 2, col: 1 },
      end: { row: 1, col: 0 },
    };
    expect(controller.commit([{ op: "clearRange", range }], "api").status).toBe("applied");
    controller.undo();
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe("row-one");
    expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A2");

    const namedRange = {
      name: "Selection",
      scope: "s1",
      range: { ...range, start: range.end, end: range.start },
    };
    expect(controller.commit([{ op: "setNamedRange", namedRange }], "api").status).toBe("applied");
    expect(
      controller.commit(
        [{ op: "setNamedRange", namedRange: { ...namedRange, name: "selection" } }],
        "api",
      ).status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);
    expect(
      controller.commit([{ op: "removeNamedRange", name: "SELECTION", scope: "s1" }], "api").status,
    ).toBe("applied");
    controller.undo();
    expect(store.getWorkbook().namedRanges).toEqual([namedRange]);

    const iterative = { iterate: true, maxIterations: 50, maxChange: 0.01 };
    const tighter = { iterate: true, maxIterations: 500, maxChange: 0 };
    expect(
      controller.commit([{ op: "setCalculation", calculation: iterative }], "api").status,
    ).toBe("applied");
    expect(controller.commit([{ op: "setCalculation", calculation: tighter }], "api").status).toBe(
      "applied",
    );
    expect(store.getWorkbook().calculation).toEqual(tighter);
    controller.undo();
    expect(store.getWorkbook().calculation).toEqual(iterative);
    controller.undo();
    expect(store.getWorkbook().calculation).toBeUndefined();
    controller.redo();
    expect(store.getWorkbook().calculation).toEqual(iterative);

    const spillRange = { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } };
    store.applyTransaction({
      patches: [
        { op: "clearRange", range: spillRange },
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 1 },
          value: { kind: "formula", src: "=SEQUENCE(3)" },
        },
      ],
    });
    expect(controller.commit([{ op: "clearRange", range: spillRange }], "api").status).toBe(
      "applied",
    );
    controller.undo();
    expect(store.getFormula({ sheet: "s1", row: 0, col: 1 })).toBe("=SEQUENCE(3)");
    expect(store.getCell({ sheet: "s1", row: 0, col: 1 }).resolved).toBe(1);
    expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(3);
    expect(store.getSpillAnchor({ sheet: "s1", row: 2, col: 1 })).toEqual({
      sheet: "s1",
      row: 0,
      col: 1,
    });
    controller.destroy();
    store.dispose();
  });

  it("converges a circular reference once iterative calculation is committed, and undo restores #CYCLE!", () => {
    const store = new SheetwriteStore(makeWorkbook(1));
    const a1 = { sheet: "s1", row: 0, col: 0 };
    store.applyTransaction({
      patches: [{ op: "set", addr: a1, value: { kind: "formula", src: "=A1/2+1" } }],
    });
    const controller = new DocumentController({
      store,
      loadable: store,
      readOnly: () => false,
      epoch: () => 0,
      materializeVirtualColumns: (patches) => patches,
      onMutationRejected: () => {},
      onHistoryApplied: () => {},
    });

    expect(store.getCell(a1).resolved).toBe("#CYCLE!");

    const calculation = { iterate: true, maxIterations: 100, maxChange: 0.001 };
    expect(controller.commit([{ op: "setCalculation", calculation }], "api").status).toBe(
      "applied",
    );
    const converged = store.getCell(a1).resolved;
    expect(typeof converged).toBe("number");
    expect(Math.abs((converged as number) - 2)).toBeLessThanOrEqual(0.001);

    controller.undo();
    expect(store.getCell(a1).resolved).toBe("#CYCLE!");

    controller.destroy();
    store.dispose();
  });
});
