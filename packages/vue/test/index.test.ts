import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { ColumnarData, Grid, GridEvents, Workbook } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { createApp, defineComponent, h, nextTick, reactive, ref, shallowRef } from "vue";
import {
  type AdapterConformanceProps,
  type MountedAdapter,
  runSharedAdapterLifecycleContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { SheetwriteGrid, type SheetwriteGridExpose } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;

beforeEach(() => {
  document.body.replaceChildren();
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function makeWorkbook(rowCount = 5, extraSheet = false): Workbook {
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number" },
        ],
      },
    ],
  };
  if (extraSheet) {
    workbook.sheets.push({
      id: "s2",
      name: "Summary",
      rowCount: 2,
      columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
    });
  }
  return workbook;
}

function makeData(rowCount = 5): ColumnarData {
  const name: string[] = new Array(rowCount);
  const amount = new Float64Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    name[r] = `Row ${r}`;
    amount[r] = r;
  }
  return { rowCount, columns: { name, amount } };
}

interface Harness {
  host: HTMLDivElement;
  state: { data: ColumnarData };
  getGrid: () => Grid | null;
  unmount: () => void;
}

/** Mount the adapter under a reactive parent so prop changes flow like an app's. */
function mountGrid(
  workbook: Workbook,
  listeners: Record<string, (...args: never[]) => void> = {},
): Harness {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const state = reactive({
    data: makeData(workbook.sheets[0]?.rowCount ?? 5) as ColumnarData,
  });
  const cmp = ref<SheetwriteGridExpose | null>(null);

  const Parent = defineComponent({
    setup() {
      return () =>
        h(SheetwriteGrid, {
          ref: cmp,
          workbook,
          data: state.data,
          ...listeners,
        });
    },
  });

  const app = createApp(Parent);
  app.mount(host);

  return {
    host,
    state,
    getGrid: () => cmp.value?.grid ?? null,
    unmount: () => app.unmount(),
  };
}

async function mountConformanceGrid(props: AdapterConformanceProps): Promise<MountedAdapter> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const component = ref<SheetwriteGridExpose | null>(null);
  const currentProps = shallowRef(props);
  const publishedAtReady: Array<Grid | null | undefined> = [];
  const Parent = defineComponent({
    setup() {
      return () => {
        const { fallbackLabel, ...gridProps } = currentProps.value;
        return h(
          SheetwriteGrid,
          {
            ...gridProps,
            ref: component,
            onReady: (event) => {
              publishedAtReady.push(component.value?.grid);
              gridProps.onReady?.(event);
            },
          },
          {
            fallback: () => h("span", { "data-lifecycle-fallback": "" }, fallbackLabel),
          },
        );
      };
    },
  });
  const app = createApp(Parent);
  app.mount(host);
  await nextTick();
  await nextTick();

  return {
    host,
    publishedAtReady,
    getPublishedGrid: () => component.value?.grid,
    render: async (nextProps) => {
      currentProps.value = nextProps;
      await nextTick();
      await nextTick();
    },
    unmount: async () => {
      app.unmount();
      await nextTick();
    },
  };
}

runSharedAdapterLifecycleContract("Vue", mountConformanceGrid);

describe("SheetwriteGrid Vue lifecycle", () => {
  it("emits change after a scripted store transaction", () => {
    const changes: unknown[] = [];
    const harness = mountGrid(makeWorkbook(), {
      onGridChange: (event: unknown) => changes.push(event),
    });

    harness.getGrid()!.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: "x" },
        },
      ],
    });

    expect(changes).toHaveLength(1);
    harness.unmount();
  });

  it("emits selection after setSelection", () => {
    const selections: unknown[] = [];
    const harness = mountGrid(makeWorkbook(), {
      onSelectionChange: (selection: unknown) => selections.push(selection),
    });

    harness.getGrid()!.setSelection({ kind: "cell", addr: { sheet: "s1", row: 1, col: 0 } });

    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ kind: "cell", addr: { row: 1, col: 0 } });
    harness.unmount();
  });

  it("emits active-sheet with the sheet id on setActiveSheet", () => {
    const events: Array<GridEvents["active-sheet"]> = [];
    const harness = mountGrid(makeWorkbook(5, true), {
      onActiveSheetChange: (event: GridEvents["active-sheet"]) => events.push(event),
    });

    harness.getGrid()!.setActiveSheet("s2");

    expect(events).toEqual([{ sheet: "s2" }]);
    harness.unmount();
  });

  it("does NOT recreate on a mutation inside data (shallow watch contract)", async () => {
    const harness = mountGrid(makeWorkbook());
    const first = harness.getGrid();

    const names = harness.state.data.columns.name as string[];
    names[0] = "mutated";
    await nextTick();

    expect(harness.getGrid()).toBe(first);
    harness.unmount();
  });
});
