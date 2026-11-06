import { describe, expect, it } from "bun:test";

import type {
  SheetSnapshot,
  SheetVisibility,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";

function sheet(
  id: string,
  name: string,
  order: number,
  visibility?: SheetVisibility,
): SheetSnapshot {
  return {
    id,
    name,
    order,
    ...(visibility ? { visibility } : {}),
    rowCount: 1,
    columns: [{ key: "a", header: "A", width: 80, type: "text" }],
    cells: [],
  };
}

function snapshot(sheets: SheetSnapshot[], active_sheet = sheets[0]!.id): WorkbookSnapshot {
  return { schemaVersion: 1, workbook: { activeSheet: active_sheet }, sheets };
}

async function workbook_xml(source: WorkbookSnapshot, warnings?: XlsxWorkbookWarning[]) {
  const bytes = await sheetwriteWorkbookBackend.toXlsxWorkbook(source, {
    ...(warnings ? { onWarning: (warning) => warnings.push(warning) } : {}),
  });
  const parts = unzipSync(bytes);
  return { bytes, xml: strFromU8(parts["xl/workbook.xml"]!) };
}

describe("XLSX worksheet lifecycle fidelity", () => {
  it("rejects NFC and case-insensitive worksheet-name collisions on import and export", async () => {
    for (const names of [
      ["Café", "Cafe\u0301"],
      ["Data", "data"],
    ] as const) {
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          rawXlsx({
            sheets: names.map((name) => ({ name, xml: worksheet("<sheetData/>") })),
          }),
        ),
      ).rejects.toThrow();

      await expect(
        sheetwriteWorkbookBackend.toXlsxWorkbook(
          snapshot(names.map((name, order) => sheet(`s${order}`, name, order))),
        ),
      ).rejects.toThrow();
    }
  });

  it("applies canonical blank, forbidden-character, apostrophe-edge, and UTF-16 length rules", async () => {
    const invalid_names = ["", "Bad/Name", "'Edge", "Edge'", `${"😀".repeat(15)}AB`];
    for (const name of invalid_names) {
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          rawXlsx({ sheets: [{ name, xml: worksheet("<sheetData/>") }] }),
        ),
      ).rejects.toThrow();
      await expect(
        sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot([sheet("s", name, 0)])),
      ).rejects.toThrow();
    }

    const boundary_name = `${"😀".repeat(15)}A`;
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({ sheets: [{ name: boundary_name, xml: worksheet("<sheetData/>") }] }),
    );
    expect(imported.sheets[0]!.name).toBe(boundary_name);
    await expect(sheetwriteWorkbookBackend.toXlsxWorkbook(imported)).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it("round-trips visible, hidden, and veryHidden states with a visible activeTab fallback", async () => {
    const warnings: XlsxWorkbookWarning[] = [];
    const source = snapshot(
      [
        sheet("hidden", "Hidden", 0, "hidden"),
        sheet("visible", "Visible", 1),
        sheet("very-hidden", "VeryHidden", 2, "veryHidden"),
      ],
      "hidden",
    );
    const { bytes, xml } = await workbook_xml(source, warnings);

    expect(xml).toContain('<workbookView activeTab="1"/>');
    expect(xml).toContain('name="Hidden" sheetId="1" state="hidden"');
    expect(xml).toContain('name="Visible" sheetId="2"');
    expect(xml).toContain('name="VeryHidden" sheetId="3" state="veryHidden"');
    expect(warnings).toEqual([
      expect.objectContaining({
        code: "unsupported-feature",
        sheet: "Hidden",
      }),
    ]);

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
    expect(imported.workbook.activeSheet).toBe("visible");
    expect(imported.sheets.map(({ id, visibility }) => [id, visibility])).toEqual([
      ["hidden", "hidden"],
      ["visible", undefined],
      ["very-hidden", "veryHidden"],
    ]);

    const hidden_active_import = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          { name: "Hidden", state: "hidden", xml: worksheet("<sheetData/>") },
          { name: "Visible", xml: worksheet("<sheetData/>") },
        ],
        workbookExtra: '<bookViews><workbookView activeTab="0"/></bookViews>',
      }),
    );
    expect(hidden_active_import.workbook.activeSheet).toBe(hidden_active_import.sheets[1]!.id);
  });

  it("gives a sheet inserted before a known sheet its own identity", async () => {
    const known: SheetSnapshot = {
      ...sheet("data", "Report", 0),
      columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
    };
    const parts = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot([known])));
    const text = (name: string) => strFromU8(parts[name] ?? new Uint8Array());
    const resaved = {
      ...parts,
      "xl/workbook.xml": strToU8(
        text("xl/workbook.xml").replace(
          "<sheets>",
          '<sheets><sheet name="Data" sheetId="9" r:id="rId9"/>',
        ),
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        text("xl/_rels/workbook.xml.rels").replace(
          "</Relationships>",
          `<Relationship Id="rId9" Type="${TRANSITIONAL_REL}/worksheet" Target="worksheets/sheet9.xml"/></Relationships>`,
        ),
      ),
      "[Content_Types].xml": strToU8(
        text("[Content_Types].xml").replace(
          "</Types>",
          '<Override PartName="/xl/worksheets/sheet9.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        ),
      ),
      "xl/worksheets/sheet9.xml": strToU8(worksheet("<sheetData/>")),
    };

    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(zipSync(resaved));
    const [inserted, report] = imported.sheets;
    expect(report).toMatchObject({ id: "data", name: "Report" });
    expect(report?.columns[0]?.key).toBe("amount");
    expect(inserted?.name).toBe("Data");
    expect(inserted?.id).not.toBe("data");
    expect(inserted?.columns[0]?.key).toBe("column1");
  });
});
