import { beforeAll, describe, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  validateWorkbookSnapshot,
  type WorkbookSnapshot,
  type XlsxSourceSnapshot,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { deflateSync, strToU8 } from "fflate";

import { xlsxAddon } from "../src/index.js";
import { packageProblems } from "./raw-opc.js";
import {
  collectWarnings,
  editParts,
  fixture,
  partNames,
  partText,
  patchEntries,
} from "./workbook-fixtures.js";

const corpus = (await Bun.file(
  new URL("fixtures/preserve-corpus.json", import.meta.url),
).json()) as {
  fixtures: { file: string; sha256: string }[];
};
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE = "xl/media/10000000000006450000032120C875D8.jpg";
const DRAWING = "xl/drawings/drawing1.xml";
type RetainedPart = XlsxSourceSnapshot["parts"][number];

async function checkedFixture(file: string): Promise<Uint8Array> {
  const entry = corpus.fixtures.find((candidate) => candidate.file === file);
  if (!entry) throw new Error(`${file} is not in preserve-corpus.json`);
  const bytes = await fixture(file);
  expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
  return bytes;
}

/** Compression method, CRC and compressed payload of every entry, read straight from the ZIP records. */
function rawEntries(bytes: Uint8Array) {
  const entries = new Map<string, { method: number; crc32: number; data: Uint8Array }>();
  patchEntries(bytes, ({ view, central, local, name }) => {
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.set(name, {
      method: view.getUint16(central + 10, true),
      crc32: view.getUint32(central + 16, true),
      data: bytes.subarray(start, start + view.getUint32(central + 20, true)),
    });
  });
  expect(entries.size).toBeGreaterThan(0);
  return entries;
}

const droppedTargets = (warnings: readonly XlsxWorkbookWarning[]) =>
  warnings.flatMap((warning) =>
    warning.message.startsWith("Preserved XLSX part graph") && warning.part ? [warning.part] : [],
  );

/** Replace the value of the first stored cell, as a host editing persisted JSON would. */
function editFirstCell(snapshot: WorkbookSnapshot, value: string): WorkbookSnapshot {
  const edited = structuredClone(snapshot);
  const cell = edited.sheets.flatMap((entry) => entry.cells.flatMap((block) => block.cells))[0];
  if (!cell) throw new Error("fixture has no cells");
  cell.value = { kind: "literal", value };
  return edited;
}

/** A store over `bytes` with `patches` applied to its first sheet. */
async function editedStore(bytes: Uint8Array, ...patches: ("value" | "addRows" | "removeSheet")[]) {
  const store = SheetwriteStore.fromSnapshot(await fromXlsxWorkbook(bytes));
  const sheet = store.exportSnapshot().sheets[0]?.id ?? "";
  store.applyTransaction({
    patches: patches.map((patch) =>
      patch === "value"
        ? {
            op: "set" as const,
            addr: { sheet, row: 0, col: 0 },
            value: { kind: "literal" as const, value: "edited" },
          }
        : patch === "addRows"
          ? { op: "addRows" as const, sheet, at: 0, count: 1 }
          : { op: "removeSheet" as const, sheet },
    ),
  });
  return store;
}

/** The pivot sample with values shown as "% of total", which no pivot definition can hold. */
const OPAQUE_PIVOT_SAMPLE = "preserve-ExcelPivotTableSample.xlsx (% of total)";
/** The chart sample drawn in 3-D, which no chart definition can hold. */
const OPAQUE_CHART_SAMPLE = "preserve-WithChart.xlsx (3-D line)";

/** A corpus fixture, or a sample rewritten so its charts or pivots stay opaque parts. */
async function load(file: string): Promise<Uint8Array> {
  if (file === OPAQUE_CHART_SAMPLE) {
    return editParts(await checkedFixture("preserve-WithChart.xlsx"), {
      "xl/charts/chart1.xml": (xml) => xml.replaceAll("c:lineChart>", "c:line3DChart>"),
    });
  }
  if (file !== OPAQUE_PIVOT_SAMPLE) return checkedFixture(file);
  const share = (xml: string) =>
    xml.replace('baseItem="0"/>', 'baseItem="0" showDataAs="percentOfTotal"/>');
  return editParts(await checkedFixture("preserve-ExcelPivotTableSample.xlsx"), {
    "xl/pivotTables/pivotTable1.xml": share,
    "xl/pivotTables/pivotTable2.xml": share,
  });
}

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

describe("XLSX unmodelled-part preservation", () => {
  it.each([
    [
      OPAQUE_CHART_SAMPLE,
      [
        "xl/charts/chart1.xml",
        DRAWING,
        "xl/drawings/_rels/drawing1.xml.rels",
        "xl/theme/theme1.xml",
      ],
    ],
    [
      OPAQUE_PIVOT_SAMPLE,
      [
        "xl/pivotTables/pivotTable1.xml",
        "xl/pivotCache/pivotCacheDefinition1.xml",
        "xl/pivotCache/pivotCacheRecords1.xml",
        "xl/connections.xml",
      ],
    ],
    ["preserve-picture.xlsx", [DRAWING, IMAGE]],
    ["preserve-SimpleMacro.xlsm", ["xl/vbaProject.bin"]],
    [
      "preserve-54399.xlsx",
      [
        "customXml/item1.xml",
        "customXml/itemProps1.xml",
        "customXml/_rels/item1.xml.rels",
        "docProps/custom.xml",
      ],
    ],
    ["preserve-CustomXMLMappings.xlsx", ["xl/xmlMaps.xml", "xl/tables/tableSingleCells1.xml"]],
  ])(
    "keeps the compressed bytes of %s parts and a valid package on open and save",
    async (file, parts) => {
      const original = await load(file);
      const snapshot = await fromXlsxWorkbook(original);
      const saved = await toXlsxWorkbook(snapshot);
      const before = rawEntries(original);
      const after = rawEntries(saved);
      for (const part of parts) expect(after.get(part)).toEqual(before.get(part));
      expect(packageProblems(saved)).toEqual([]);
      const names = (entry: WorkbookSnapshot) =>
        entry.workbook.xlsxSource?.parts.map((part) => part.name).sort();
      expect(names(await fromXlsxWorkbook(saved))).toEqual(names(snapshot));
    },
  );

  it("writes pivot caches after calcPr with ids that resolve", async () => {
    const saved = await toXlsxWorkbook(await fromXlsxWorkbook(await load(OPAQUE_PIVOT_SAMPLE)));
    expect(partText(saved, "xl/workbook.xml")).toMatch(
      /<calcPr [^>]*\/><pivotCaches><pivotCache cacheId="\d+" r:id="rId\d+"\/>/,
    );
  });

  it("drops charts and pivots after a store edit on any sheet, with a warning", async () => {
    for (const [file, target] of [
      [OPAQUE_CHART_SAMPLE, DRAWING],
      [OPAQUE_PIVOT_SAMPLE, "xl/pivotCache/pivotCacheDefinition1.xml"],
    ] as const) {
      const store = await editedStore(await load(file), "value");
      const { warnings, onWarning } = collectWarnings();
      const saved = await toXlsxWorkbook(store, { onWarning });

      expect(droppedTargets(warnings)).toContain(target);
      expect(partNames(saved).some((part) => /chart|pivot/i.test(part))).toBe(false);
      expect(partText(saved, "xl/workbook.xml")).not.toContain("pivotCaches");
      expect(packageProblems(saved)).toEqual([]);
      store.dispose();
    }
  });

  it("keeps VBA, customXml and themes across store edits", async () => {
    for (const [file, part] of [
      ["preserve-SimpleMacro.xlsm", "xl/vbaProject.bin"],
      ["preserve-54399.xlsx", "customXml/item1.xml"],
    ] as const) {
      const original = await checkedFixture(file);
      const store = await editedStore(original, "value", "addRows");
      const saved = await toXlsxWorkbook(store);
      for (const kept of [part, "xl/theme/theme1.xml"]) {
        expect(rawEntries(saved).get(kept)).toEqual(rawEntries(original).get(kept));
      }
      expect(packageProblems(saved)).toEqual([]);
      store.dispose();
    }
  });

  it("keeps images across value edits and drops them when their sheet's rows move or the sheet goes", async () => {
    const picture = await checkedFixture("preserve-picture.xlsx");
    const store = await editedStore(picture, "value");
    expect(partNames(await toXlsxWorkbook(store))).toContain(IMAGE);
    store.dispose();

    const moved = await editedStore(picture, "addRows");
    const { warnings, onWarning } = collectWarnings();
    const saved = await toXlsxWorkbook(moved, { onWarning });
    expect(partNames(saved)).not.toContain(IMAGE);
    expect(droppedTargets(warnings)).toEqual([DRAWING]);
    expect(packageProblems(saved)).toEqual([]);
    moved.dispose();

    const removed = await editedStore(picture, "removeSheet");
    const withoutSheet = await toXlsxWorkbook(removed);
    expect(partNames(withoutSheet).some((part) => part.startsWith("xl/drawings/"))).toBe(false);
    expect(removed.exportSnapshot().workbook.xlsxSource?.dropped).toEqual([DRAWING]);
    expect(packageProblems(withoutSheet)).toEqual([]);
    removed.dispose();
  });

  it("distinguishes formula source from a literal with identical text, including hydration", async () => {
    const withFormula = editParts(await load(OPAQUE_CHART_SAMPLE), {
      "xl/worksheets/sheet1.xml": (xml) =>
        xml.replace(/<c\b[^>]*r="A1"[^>]*>[\s\S]*?<\/c>/, '<c r="A1"><f>1+1</f><v>2</v></c>'),
    });
    const edited = structuredClone(await fromXlsxWorkbook(withFormula));
    const cell = edited.sheets
      .flatMap((entry) => entry.cells.flatMap((block) => block.cells))
      .find((candidate) => candidate.value.kind === "formula" && candidate.value.src === "=1+1");
    if (!cell) throw new Error("formula was not imported");
    cell.value = { kind: "literal", value: "=1+1" };
    for (const input of [edited, SheetwriteStore.fromSnapshot(edited)]) {
      expect(partNames(await toXlsxWorkbook(input))).not.toContain("xl/charts/chart1.xml");
    }
  });

  it("keeps images when an untracked snapshot changes only cell values", async () => {
    const imported = await fromXlsxWorkbook(await checkedFixture("preserve-picture.xlsx"));
    expect(partNames(await toXlsxWorkbook(editFirstCell(imported, "changed")))).toContain(IMAGE);
  });

  it("fingerprints snapshots edited outside a store", async () => {
    const edited = editFirstCell(
      await fromXlsxWorkbook(await load(OPAQUE_CHART_SAMPLE)),
      "edited outside",
    );
    for (const input of [edited, { exportSnapshot: () => edited }]) {
      const { warnings, onWarning } = collectWarnings();
      const saved = await toXlsxWorkbook(input, { onWarning });
      expect(droppedTargets(warnings)).toEqual([DRAWING]);
      expect(partNames(saved)).not.toContain("xl/charts/chart1.xml");
    }
  });

  it("reads a store-backed look-alike through the store, not its own snapshot", async () => {
    const store = SheetwriteStore.fromSnapshot(
      await fromXlsxWorkbook(await load(OPAQUE_CHART_SAMPLE)),
    );
    const edited = editFirstCell(store.exportSnapshot(), "edited outside");
    const lookAlike = {
      store,
      getActiveSheet: () => edited.workbook.activeSheet,
      exportSnapshot: () => edited,
    };
    const saved = await toXlsxWorkbook(lookAlike);
    expect(partNames(saved)).toContain("xl/charts/chart1.xml");
    expect(partNames(saved).some((part) => partText(saved, part).includes("edited outside"))).toBe(
      false,
    );
    store.dispose();
  });

  it("drops graphs over maxPreservedBytes on import and on direct export instead of failing", async () => {
    const picture = await checkedFixture("preserve-picture.xlsx");
    const overLimit = expect.objectContaining({
      part: DRAWING,
      message: expect.stringContaining("maxPreservedBytes"),
    });
    const imported = collectWarnings();
    const limited = await fromXlsxWorkbook(picture, {
      onWarning: imported.onWarning,
      resourceLimits: { maxPreservedBytes: 4096 },
    });
    expect(limited.workbook.xlsxSource?.graphs.map((graph) => graph.target)).toEqual([
      "docProps/core.xml",
    ]);
    expect(imported.warnings).toContainEqual(overLimit);

    const raised = await fromXlsxWorkbook(picture, {
      resourceLimits: { maxPreservedBytes: 1024 * 1024 * 1024 },
    });
    const reloaded = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(raised)));
    expect(partNames(await toXlsxWorkbook(reloaded))).toContain(IMAGE);
    reloaded.dispose();
    const exported = collectWarnings();
    const saved = await toXlsxWorkbook(raised, {
      onWarning: exported.onWarning,
      resourceLimits: { maxPreservedBytes: 4096 },
    });
    expect(partNames(saved)).not.toContain(IMAGE);
    expect(exported.warnings).toContainEqual(overLimit);
    expect(packageProblems(saved)).toEqual([]);
  });

  it("drops persisted graphs whose bytes or relationships were tampered with", async () => {
    const snapshot = await fromXlsxWorkbook(await checkedFixture("preserve-picture.xlsx"));
    const source = snapshot.workbook.xlsxSource;
    if (!source) throw new Error("picture.xlsx kept no graphs");
    const relationshipsTo =
      (target: string) =>
      (part: RetainedPart): RetainedPart => {
        const relationships = strToU8(
          `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Id="rId1" Type="${PACKAGE_RELATIONSHIPS}/image" Target="${target}"/></Relationships>`,
        );
        return {
          ...part,
          method: 8,
          crc32: Bun.hash.crc32(relationships),
          uncompressedSize: relationships.byteLength,
          data: Buffer.from(deflateSync(relationships)).toString("base64"),
        };
      };
    const tampered: [string, (part: RetainedPart) => RetainedPart][] = [
      [IMAGE, (part) => ({ ...part, crc32: (part.crc32 + 1) >>> 0 })],
      ["xl/drawings/_rels/drawing1.xml.rels", relationshipsTo("../worksheets/sheet1.xml")],
      ["xl/drawings/_rels/drawing1.xml.rels", relationshipsTo("../../../../escaped.xml")],
    ];
    for (const [name, tamper] of tampered) {
      const persisted: WorkbookSnapshot = JSON.parse(JSON.stringify(snapshot));
      persisted.workbook.xlsxSource = {
        ...source,
        parts: source.parts.map((part) => (part.name === name ? tamper(part) : part)),
      };
      const { warnings, onWarning } = collectWarnings();
      const saved = await toXlsxWorkbook(persisted, { onWarning });
      expect(droppedTargets(warnings)).toEqual([DRAWING]);
      expect(partNames(saved).some((part) => part.startsWith("xl/media/"))).toBe(false);
      expect(packageProblems(saved)).toEqual([]);
    }
  });

  it("escapes a retained part's content type in the package content types", async () => {
    const snapshot = await fromXlsxWorkbook(await checkedFixture("preserve-picture.xlsx"));
    const source = snapshot.workbook.xlsxSource;
    if (!source) throw new Error("picture.xlsx kept no graphs");
    const persisted: WorkbookSnapshot = JSON.parse(JSON.stringify(snapshot));
    persisted.workbook.xlsxSource = {
      ...source,
      parts: source.parts.map((part) =>
        part.name === DRAWING ? { ...part, contentType: "application/x-a&b" } : part,
      ),
    };

    const saved = await toXlsxWorkbook(persisted);
    expect(partText(saved, "[Content_Types].xml")).toContain(
      `<Override PartName="/${DRAWING}" ContentType="application/x-a&amp;b"/>`,
    );
    const reopened = await fromXlsxWorkbook(saved);
    expect(reopened.workbook.xlsxSource?.parts.find((part) => part.name === DRAWING)).toMatchObject(
      {
        contentType: "application/x-a&b",
      },
    );
  });

  it("keeps charts and images through a JSON persistence reload of a store", async () => {
    for (const [file, part] of [
      [OPAQUE_CHART_SAMPLE, "xl/charts/chart1.xml"],
      ["preserve-picture.xlsx", IMAGE],
    ] as const) {
      const store = SheetwriteStore.fromSnapshot(await fromXlsxWorkbook(await load(file)));
      const persisted = JSON.parse(JSON.stringify(store.exportSnapshot())) as WorkbookSnapshot;
      store.dispose();
      const { warnings, onWarning } = collectWarnings();
      const saved = await toXlsxWorkbook(SheetwriteStore.fromSnapshot(persisted), { onWarning });
      expect(partNames(saved)).toContain(part);
      expect(droppedTargets(warnings)).toEqual([]);
    }
  });

  it("rejects retained part names that could escape or overwrite the package", async () => {
    const snapshot = await fromXlsxWorkbook(await checkedFixture("preserve-SimpleMacro.xlsm"));
    const source = snapshot.workbook.xlsxSource;
    if (!source) throw new Error("SimpleMacro.xlsm kept no graphs");
    for (const name of ["../evil.bin", "/xl/vbaProject.bin", "xl/a?b.bin", "xl/a&quot;.bin"]) {
      const persisted: WorkbookSnapshot = JSON.parse(JSON.stringify(snapshot));
      persisted.workbook.xlsxSource = {
        ...source,
        parts: source.parts.map((part) =>
          part.name === "xl/vbaProject.bin" ? { ...part, name } : part,
        ),
      };
      expect(validateWorkbookSnapshot(persisted).ok).toBe(false);
    }
  });
});
