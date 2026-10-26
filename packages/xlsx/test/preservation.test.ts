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
import { deflateSync, strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { registerXlsxBackends } from "../src/index.js";

interface CorpusFixture {
  file: string;
  sha256: string;
}

const corpus = (await Bun.file(
  new URL("fixtures/preserve-corpus.json", import.meta.url),
).json()) as {
  fixtures: CorpusFixture[];
};
const PACKAGE_RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const MACRO_WORKBOOK = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
const EOCD_SIGNATURE = 0x06054b50;
const EOCD_BYTES = 22;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;

async function fixture(file: string): Promise<Uint8Array> {
  const entry = corpus.fixtures.find((candidate) => candidate.file === file);
  if (!entry) throw new Error(`${file} is not in preserve-corpus.json`);
  const bytes = new Uint8Array(
    await Bun.file(new URL(`fixtures/${file}`, import.meta.url)).arrayBuffer(),
  );
  expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
  return bytes;
}

/** Compressed payload of every entry, read straight from the ZIP records. */
function rawEntries(
  bytes: Uint8Array,
): Map<string, { method: number; crc32: number; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.byteLength - EOCD_BYTES;
  while (eocd >= 0 && view.getUint32(eocd, true) !== EOCD_SIGNATURE) eocd--;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, { method: number; crc32: number; data: Uint8Array }>();
  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(offset + 28, true);
    const name = strFromU8(
      bytes.subarray(offset + CENTRAL_HEADER_BYTES, offset + CENTRAL_HEADER_BYTES + nameLength),
    );
    const local = view.getUint32(offset + 42, true);
    const start =
      local +
      LOCAL_HEADER_BYTES +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      crc32: view.getUint32(offset + 16, true),
      data: bytes.subarray(start, start + view.getUint32(offset + 20, true)),
    });
    offset +=
      CENTRAL_HEADER_BYTES +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  return entries;
}

function resolveTarget(source: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const segments = source.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Structural checks Excel applies before it offers to repair a file: every
 * part has a content type, every internal relationship target exists, every
 * `r:` reference resolves, and a macro workbook keeps its macro content type.
 */
function packageProblems(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes);
  const problems: string[] = [];
  const contentTypes = strFromU8(files["[Content_Types].xml"] ?? new Uint8Array());
  const defaults = new Set(
    [...contentTypes.matchAll(/<Default Extension="([^"]+)"/g)].map((match) =>
      match[1]?.toLowerCase(),
    ),
  );
  const overrides = new Map(
    [...contentTypes.matchAll(/<Override PartName="\/([^"]+)" ContentType="([^"]+)"/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
  for (const part of overrides.keys())
    if (part && !files[part]) problems.push(`override for missing ${part}`);
  for (const part of Object.keys(files)) {
    if (part === "[Content_Types].xml" || part.endsWith("/")) continue;
    const extension = part.slice(part.lastIndexOf(".") + 1).toLowerCase();
    if (!overrides.has(part) && !defaults.has(extension))
      problems.push(`${part} has no content type`);
  }
  const relationships = new Map<string, Set<string>>();
  for (const [part, data] of Object.entries(files)) {
    const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(part);
    if (!match) continue;
    const source = `${match[1] ?? ""}${match[2] ?? ""}`;
    const ids = new Set<string>();
    for (const relationship of strFromU8(data).matchAll(/<Relationship ([^>]+)\/>/g)) {
      const attributes = relationship[1] ?? "";
      const id = /Id="([^"]+)"/.exec(attributes)?.[1] ?? "";
      if (ids.has(id)) problems.push(`duplicate ${id} in ${part}`);
      ids.add(id);
      if (attributes.includes('TargetMode="External"')) continue;
      const target = resolveTarget(source, /Target="([^"]+)"/.exec(attributes)?.[1] ?? "");
      if (!files[target]) problems.push(`${part} ${id} points at missing ${target}`);
    }
    relationships.set(source, ids);
  }
  if (!files["_rels/.rels"] || !strFromU8(files["_rels/.rels"]).includes("/officeDocument")) {
    problems.push("no office document relationship");
  }
  for (const [part, data] of Object.entries(files)) {
    if (!part.endsWith(".xml")) continue;
    for (const reference of strFromU8(data).matchAll(/\br:(?:id|embed|link|pict)="([^"]*)"/g)) {
      if (!relationships.get(part)?.has(reference[1] ?? ""))
        problems.push(`${part} references unknown ${reference[1]}`);
    }
  }
  if (
    Boolean(files["xl/vbaProject.bin"]) !==
    (overrides.get("xl/workbook.xml") === MACRO_WORKBOOK)
  ) {
    problems.push("workbook content type does not match its macro project");
  }
  return problems;
}

function withWarnings(): {
  warnings: XlsxWorkbookWarning[];
  onWarning: (warning: XlsxWorkbookWarning) => void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

function droppedTargets(warnings: readonly XlsxWorkbookWarning[]): string[] {
  return warnings.flatMap((warning) =>
    warning.message.startsWith("Preserved XLSX part graph") && warning.part ? [warning.part] : [],
  );
}

/** Replace the value of the first stored cell, as a host editing persisted JSON would. */
function editFirstCell(snapshot: WorkbookSnapshot, value: string): WorkbookSnapshot {
  const edited = structuredClone(snapshot);
  const cell = edited.sheets.flatMap((sheet) => sheet.cells.flatMap((block) => block.cells))[0];
  if (!cell) throw new Error("fixture has no cells");
  cell.value = { kind: "literal", value };
  return edited;
}

function storeOf(snapshot: WorkbookSnapshot): SheetwriteStore {
  return SheetwriteStore.fromSnapshot(snapshot);
}

beforeAll(async () => {
  await initSheetwrite();
  registerXlsxBackends();
});

describe("XLSX unmodelled-part preservation", () => {
  const unchanged: [string, string[]][] = [
    [
      "preserve-WithChart.xlsx",
      [
        "xl/charts/chart1.xml",
        "xl/drawings/drawing1.xml",
        "xl/drawings/_rels/drawing1.xml.rels",
        "xl/theme/theme1.xml",
      ],
    ],
    [
      "preserve-ExcelPivotTableSample.xlsx",
      [
        "xl/pivotTables/pivotTable1.xml",
        "xl/pivotCache/pivotCacheDefinition1.xml",
        "xl/pivotCache/pivotCacheRecords1.xml",
        "xl/connections.xml",
      ],
    ],
    [
      "preserve-picture.xlsx",
      ["xl/drawings/drawing1.xml", "xl/media/10000000000006450000032120C875D8.jpg"],
    ],
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
  ];
  for (const [file, parts] of unchanged) {
    it(`keeps the compressed bytes of ${file} parts and a valid package on open and save`, async () => {
      const original = await fixture(file);
      const snapshot = await fromXlsxWorkbook(original);
      const saved = await toXlsxWorkbook(snapshot);

      const before = rawEntries(original);
      const after = rawEntries(saved);
      for (const part of parts) {
        expect(after.get(part)).toEqual(before.get(part));
      }
      expect(packageProblems(saved)).toEqual([]);

      const reopened = await fromXlsxWorkbook(saved);
      expect(reopened.workbook.xlsxSource?.parts.map((part) => part.name).sort()).toEqual(
        snapshot.workbook.xlsxSource?.parts.map((part) => part.name).sort(),
      );
    });
  }

  it("writes pivot caches after calcPr with ids that resolve", async () => {
    const saved = await toXlsxWorkbook(
      await fromXlsxWorkbook(await fixture("preserve-ExcelPivotTableSample.xlsx")),
    );
    const workbook = strFromU8(unzipSync(saved)["xl/workbook.xml"] ?? new Uint8Array());

    expect(workbook).toMatch(
      /<calcPr [^>]*\/><pivotCaches><pivotCache cacheId="\d+" r:id="rId\d+"\/>/,
    );
  });

  it("drops charts and pivots after a store edit on any sheet, with a warning", async () => {
    for (const [file, target] of [
      ["preserve-WithChart.xlsx", "xl/drawings/drawing1.xml"],
      ["preserve-ExcelPivotTableSample.xlsx", "xl/pivotCache/pivotCacheDefinition1.xml"],
    ] as const) {
      const store = storeOf(await fromXlsxWorkbook(await fixture(file)));
      const sheet = store.exportSnapshot().sheets[0]?.id ?? "";
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet, row: 0, col: 0 },
            value: { kind: "literal", value: "edited" },
          },
        ],
      });
      const { warnings, onWarning } = withWarnings();

      const saved = await toXlsxWorkbook(store, { onWarning });
      const files = unzipSync(saved);

      expect(droppedTargets(warnings)).toContain(target);
      expect(Object.keys(files).some((part) => /chart|pivot/i.test(part))).toBe(false);
      expect(strFromU8(files["xl/workbook.xml"] ?? new Uint8Array())).not.toContain("pivotCaches");
      expect(packageProblems(saved)).toEqual([]);
    }
  });

  it("keeps VBA, customXml and themes across store edits", async () => {
    for (const [file, part] of [
      ["preserve-SimpleMacro.xlsm", "xl/vbaProject.bin"],
      ["preserve-54399.xlsx", "customXml/item1.xml"],
    ] as const) {
      const original = await fixture(file);
      const store = storeOf(await fromXlsxWorkbook(original));
      const sheet = store.exportSnapshot().sheets[0]?.id ?? "";
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet, row: 0, col: 0 },
            value: { kind: "literal", value: "edited" },
          },
          { op: "addRows", sheet, at: 0, count: 1 },
        ],
      });

      const saved = await toXlsxWorkbook(store);

      expect(rawEntries(saved).get(part)).toEqual(rawEntries(original).get(part));
      expect(rawEntries(saved).get("xl/theme/theme1.xml")).toEqual(
        rawEntries(original).get("xl/theme/theme1.xml"),
      );
      expect(packageProblems(saved)).toEqual([]);
    }
  });

  it("keeps images across value edits and drops them when their sheet's rows move", async () => {
    const image = "xl/media/10000000000006450000032120C875D8.jpg";
    const store = storeOf(await fromXlsxWorkbook(await fixture("preserve-picture.xlsx")));
    const sheet = store.exportSnapshot().sheets[0]?.id ?? "";
    store.applyTransaction({
      patches: [
        { op: "set", addr: { sheet, row: 0, col: 0 }, value: { kind: "literal", value: 7 } },
      ],
    });

    expect(unzipSync(await toXlsxWorkbook(store))[image]).toBeDefined();

    store.applyTransaction({ patches: [{ op: "addRows", sheet, at: 0, count: 1 }] });
    const { warnings, onWarning } = withWarnings();
    const saved = await toXlsxWorkbook(store, { onWarning });

    expect(unzipSync(saved)[image]).toBeUndefined();
    expect(droppedTargets(warnings)).toEqual(["xl/drawings/drawing1.xml"]);
    expect(packageProblems(saved)).toEqual([]);
  });

  it("drops a sheet's graphs when the sheet is removed", async () => {
    const store = storeOf(await fromXlsxWorkbook(await fixture("preserve-picture.xlsx")));
    const sheet = store.exportSnapshot().sheets[0]?.id ?? "";
    store.applyTransaction({ patches: [{ op: "removeSheet", sheet }] });

    const saved = await toXlsxWorkbook(store);

    expect(Object.keys(unzipSync(saved)).some((part) => part.startsWith("xl/drawings/"))).toBe(
      false,
    );
    expect(store.exportSnapshot().workbook.xlsxSource?.dropped).toEqual([
      "xl/drawings/drawing1.xml",
    ]);
    expect(packageProblems(saved)).toEqual([]);
  });

  it("distinguishes formula source from a literal with identical text, including hydration", async () => {
    const files = unzipSync(await fixture("preserve-WithChart.xlsx"));
    const part = "xl/worksheets/sheet1.xml";
    const worksheet = files[part];
    if (!worksheet) throw new Error("chart fixture has no first worksheet");
    files[part] = strToU8(
      strFromU8(worksheet).replace(
        /<c\b[^>]*r="A1"[^>]*>[\s\S]*?<\/c>/,
        '<c r="A1"><f>1+1</f><v>2</v></c>',
      ),
    );
    const imported = await fromXlsxWorkbook(zipSync(files));
    const formula = imported.sheets
      .flatMap((sheet) => sheet.cells.flatMap((block) => block.cells))
      .find((cell) => cell.value.kind === "formula" && cell.value.src === "=1+1");
    expect(formula).toBeDefined();
    const edited = structuredClone(imported);
    const cell = edited.sheets
      .flatMap((sheet) => sheet.cells.flatMap((block) => block.cells))
      .find((candidate) => candidate.value.kind === "formula" && candidate.value.src === "=1+1");
    if (!cell) throw new Error("formula was not imported");
    cell.value = { kind: "literal", value: "=1+1" };
    for (const input of [edited, SheetwriteStore.fromSnapshot(edited)]) {
      const saved = await toXlsxWorkbook(input);
      expect(unzipSync(saved)["xl/charts/chart1.xml"]).toBeUndefined();
    }
  });

  it("keeps images when an untracked snapshot changes only cell values", async () => {
    const imported = await fromXlsxWorkbook(await fixture("preserve-picture.xlsx"));
    const saved = await toXlsxWorkbook(editFirstCell(imported, "changed"));
    expect(unzipSync(saved)["xl/media/10000000000006450000032120C875D8.jpg"]).toBeDefined();
  });

  it("fingerprints snapshots edited outside a store", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-WithChart.xlsx"));
    const edited = editFirstCell(snapshot, "edited outside");

    for (const input of [edited, { exportSnapshot: () => edited }]) {
      const { warnings, onWarning } = withWarnings();
      const saved = await toXlsxWorkbook(input, { onWarning });

      expect(droppedTargets(warnings)).toEqual(["xl/drawings/drawing1.xml"]);
      expect(unzipSync(saved)["xl/charts/chart1.xml"]).toBeUndefined();
    }
  });

  it("reads a store-backed look-alike through the store, not its own snapshot", async () => {
    const store = storeOf(await fromXlsxWorkbook(await fixture("preserve-WithChart.xlsx")));
    const edited = editFirstCell(store.exportSnapshot(), "edited outside");

    const lookAlike = {
      store,
      getActiveSheet: () => edited.workbook.activeSheet,
      exportSnapshot: () => edited,
    };
    const saved = await toXlsxWorkbook(lookAlike);
    const files = unzipSync(saved);

    expect(files["xl/charts/chart1.xml"]).toBeDefined();
    expect(Object.values(files).some((data) => strFromU8(data).includes("edited outside"))).toBe(
      false,
    );
  });

  it("drops opaque graphs beyond maxPreservedBytes on import", async () => {
    const { warnings, onWarning } = withWarnings();
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-picture.xlsx"), {
      onWarning,
      resourceLimits: { maxPreservedBytes: 4096 },
    });

    expect(snapshot.workbook.xlsxSource?.graphs.map((graph) => graph.target)).toEqual([
      "docProps/core.xml",
    ]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        part: "xl/drawings/drawing1.xml",
        message: expect.stringContaining("maxPreservedBytes"),
      }),
    );
  });

  it("drops persisted graphs whose bytes or relationships were tampered with", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-picture.xlsx"));
    const source = snapshot.workbook.xlsxSource;
    if (!source) throw new Error("picture.xlsx kept no graphs");
    const relationships = strToU8(
      `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Id="rId1" Type="${PACKAGE_RELATIONSHIPS}/image" Target="../worksheets/sheet1.xml"/></Relationships>`,
    );
    const outside = deflateSync(relationships);
    const tampered: [
      string,
      (part: XlsxSourceSnapshot["parts"][number]) => XlsxSourceSnapshot["parts"][number],
    ][] = [
      [
        "xl/media/10000000000006450000032120C875D8.jpg",
        (part) => ({ ...part, crc32: (part.crc32 + 1) >>> 0 }),
      ],
      [
        "xl/drawings/_rels/drawing1.xml.rels",
        (part) => ({
          ...part,
          method: 8,
          crc32: Bun.hash.crc32(relationships),
          uncompressedSize: relationships.byteLength,
          data: Buffer.from(outside).toString("base64"),
        }),
      ],
    ];
    for (const [name, tamper] of tampered) {
      const persisted: WorkbookSnapshot = JSON.parse(JSON.stringify(snapshot));
      persisted.workbook.xlsxSource = {
        ...source,
        parts: source.parts.map((part) => (part.name === name ? tamper(part) : part)),
      };
      const { warnings, onWarning } = withWarnings();

      const saved = await toXlsxWorkbook(persisted, { onWarning });

      expect(droppedTargets(warnings)).toEqual(["xl/drawings/drawing1.xml"]);
      expect(Object.keys(unzipSync(saved)).some((part) => part.startsWith("xl/media/"))).toBe(
        false,
      );
      expect(packageProblems(saved)).toEqual([]);
    }
  });

  it("rejects retained part names that could escape or overwrite the package", async () => {
    const snapshot = await fromXlsxWorkbook(await fixture("preserve-SimpleMacro.xlsm"));
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

      const checked = validateWorkbookSnapshot(persisted);

      expect(checked.ok).toBe(false);
    }
  });
});
