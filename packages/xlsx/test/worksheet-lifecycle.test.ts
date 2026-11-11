import { describe, expect, it } from "bun:test";

import type { SheetVisibility } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";
import { book, collectWarnings, editParts, partText, sheet, sheetAt } from "./workbook-fixtures.js";

const named = (id: string, name: string, visibility?: SheetVisibility) =>
  sheet(id, name, [], visibility ? { visibility } : {});
const rawNamed = (...names: string[]) =>
  rawXlsx({ sheets: names.map((name) => ({ name, xml: worksheet("<sheetData/>") })) });

describe("XLSX worksheet lifecycle fidelity", () => {
  it("rejects colliding, blank, forbidden-character, apostrophe-edge and over-long worksheet names", async () => {
    const invalid = [
      ["Café", "Cafe\u0301"],
      ["Data", "data"],
      [""],
      ["Bad/Name"],
      ["'Edge"],
      ["Edge'"],
      [`${"😀".repeat(15)}AB`],
    ];
    for (const names of invalid) {
      await expect(backend.fromXlsxWorkbook(rawNamed(...names)), names.join()).rejects.toThrow();
      await expect(
        backend.toXlsxWorkbook(book(names.map((name, index) => named(`s${index}`, name)))),
        names.join(),
      ).rejects.toThrow();
    }
    // The 31-character limit counts UTF-16 code units.
    const boundaryName = `${"😀".repeat(15)}A`;
    const imported = await backend.fromXlsxWorkbook(rawNamed(boundaryName));
    expect(imported.sheets[0]?.name).toBe(boundaryName);
    await expect(backend.toXlsxWorkbook(imported)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("round-trips visible, hidden, and veryHidden states with a visible activeTab fallback", async () => {
    const { warnings, onWarning } = collectWarnings();
    const bytes = await backend.toXlsxWorkbook(
      book(
        [
          named("hidden", "Hidden", "hidden"),
          named("visible", "Visible"),
          named("very-hidden", "VeryHidden", "veryHidden"),
        ],
        {
          activeSheet: "hidden",
        },
      ),
      { onWarning },
    );
    const xml = partText(bytes, "xl/workbook.xml");
    expect(xml).toContain('<workbookView activeTab="1"/>');
    expect(xml).toContain('name="Hidden" sheetId="1" state="hidden"');
    expect(xml).toContain('name="Visible" sheetId="2"');
    expect(xml).toContain('name="VeryHidden" sheetId="3" state="veryHidden"');
    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", sheet: "Hidden" }),
    ]);

    const imported = await backend.fromXlsxWorkbook(bytes);
    expect(imported.workbook.activeSheet).toBe("visible");
    expect(imported.sheets.map(({ id, visibility }) => [id, visibility])).toEqual([
      ["hidden", "hidden"],
      ["visible", undefined],
      ["very-hidden", "veryHidden"],
    ]);

    const hiddenActive = await backend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          { name: "Hidden", state: "hidden", xml: worksheet("<sheetData/>") },
          { name: "Visible", xml: worksheet("<sheetData/>") },
        ],
        workbookExtra: '<bookViews><workbookView activeTab="0"/></bookViews>',
      }),
    );
    expect(hiddenActive.workbook.activeSheet).toBe(sheetAt(hiddenActive, 1).id);
  });

  it("gives a sheet inserted before a known sheet its own identity", async () => {
    const known = sheet("data", "Report", [], {
      columns: [{ key: "amount", header: "Amount", width: 80, type: "number" }],
    });
    const resaved = editParts(await backend.toXlsxWorkbook(book([known])), {
      "xl/workbook.xml": (xml) =>
        xml.replace("<sheets>", '<sheets><sheet name="Data" sheetId="9" r:id="rId9"/>'),
      "xl/_rels/workbook.xml.rels": (xml) =>
        xml.replace(
          "</Relationships>",
          `<Relationship Id="rId9" Type="${TRANSITIONAL_REL}/worksheet" Target="worksheets/sheet9.xml"/></Relationships>`,
        ),
      "[Content_Types].xml": (xml) =>
        xml.replace(
          "</Types>",
          '<Override PartName="/xl/worksheets/sheet9.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        ),
      "xl/worksheets/sheet9.xml": worksheet("<sheetData/>"),
    });

    const [inserted, report] = (await backend.fromXlsxWorkbook(resaved)).sheets;
    expect(report).toMatchObject({ id: "data", name: "Report" });
    expect(report?.columns[0]?.key).toBe("amount");
    expect(inserted?.name).toBe("Data");
    expect(inserted?.id).not.toBe("data");
    expect(inserted?.columns[0]?.key).toBe("column1");
  });
});
