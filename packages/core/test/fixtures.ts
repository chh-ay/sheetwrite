import type { ColumnarData, Range, Sheet, Workbook } from "../src/types.js";

export function makeWorkbook(rowCount = 50): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number" },
          { key: "city", header: "City", width: 140, type: "text" },
        ],
      },
    ],
  };
}

export function makeColumnarData(rowCount = 50): ColumnarData {
  const name: string[] = new Array(rowCount);
  const amount = new Float64Array(rowCount);
  const city: string[] = new Array(rowCount);
  const cities = ["Phnom Penh", "Tokyo", "Berlin"];
  for (let r = 0; r < rowCount; r++) {
    name[r] = `Customer ${r}`;
    amount[r] = r * 10 + 0.5;
    city[r] = cities[r % cities.length]!;
  }
  return { rowCount, columns: { name, amount, city } };
}

export function sheet(id: string, rowCount = 10): Sheet {
  const columns = ["a", "b", "c", "d"].map((key) => ({
    key,
    header: key,
    width: 80,
    type: "number" as const,
  }));

  return { id, name: id, rowCount, columns };
}

export function range(sheetId: string, r0: number, c0: number, r1: number, c1: number): Range {
  return { sheet: sheetId, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}
