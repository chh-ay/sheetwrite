import { expect, test } from "bun:test";

import { codeWords } from "../src/lib/inline-code.ts";

test("a name in code breaks between its words, never inside one", () => {
  expect(codeWords("IndexedDbPendingCommitStorageError")).toEqual([
    "Indexed",
    "Db",
    "Pending",
    "Commit",
    "Storage",
    "Error",
  ]);
  expect(codeWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
  expect(codeWords("grid.setViewSort(keys)")).toEqual(["grid.", "set", "View", "Sort(", "keys)"]);
  expect(codeWords("@sheetwrite/xlsx/register")).toEqual(["@sheetwrite/", "xlsx/", "register"]);
});

test("numbers, single words and capitals stay whole", () => {
  expect(codeWords("1.25")).toEqual(["1.25"]);
  expect(codeWords("-1500")).toEqual(["-1500"]);
  expect(codeWords("XLSX")).toEqual(["XLSX"]);
  expect(codeWords("refresh")).toEqual(["refresh"]);
});
