import { beforeAll, describe, expect, it } from "bun:test";

import { fromXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { xlsxAddon } from "../src/index.js";

interface ExternalFixture {
  file: string;
  path: string;
  sha256: string;
  producer: string;
  appVersion: string;
}
interface GoogleExternalFixture {
  file: string;
  sourcePage: string;
  downloadUrl: string;
  contentSha256: string;
  producer: "Google Sheets";
  redistributed: false;
}

const manifest = (await Bun.file(
  new URL("fixtures/external-corpus.json", import.meta.url),
).json()) as {
  commit: string;
  fixtures: ExternalFixture[];
  googleFixtures: GoogleExternalFixture[];
};
const externalDirectory = process.env.SHEETWRITE_EXTERNAL_XLSX_DIR;
const scheduledIt =
  process.env.SHEETWRITE_EXTERNAL_XLSX === "1" || externalDirectory ? it : it.skip;

async function fixtureBytes(fixture: ExternalFixture | GoogleExternalFixture): Promise<Uint8Array> {
  if (externalDirectory) {
    return new Uint8Array(await Bun.file(`${externalDirectory}/${fixture.file}`).arrayBuffer());
  }
  const url =
    "downloadUrl" in fixture
      ? fixture.downloadUrl
      : `https://raw.githubusercontent.com/apache/poi/${manifest.commit}/${fixture.path}`;
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return new Uint8Array(await response.arrayBuffer());
}

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

describe("scheduled independent Microsoft Excel corpus", () => {
  for (const fixture of manifest.fixtures) {
    scheduledIt(`imports checksum-locked ${fixture.file}`, async () => {
      const bytes = await fixtureBytes(fixture);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
      const appXml = strFromU8(unzipSync(bytes)["docProps/app.xml"] ?? new Uint8Array());
      expect(appXml).toContain(`<Application>${fixture.producer}</Application>`);
      expect(appXml).toContain(`<AppVersion>${fixture.appVersion}</AppVersion>`);
      const snapshot = await fromXlsxWorkbook(bytes);
      expect(snapshot.sheets.some((sheet) => sheet.cells.length > 0)).toBe(true);
    });
  }
});

describe("scheduled independent Google Sheets corpus", () => {
  for (const fixture of manifest.googleFixtures) {
    scheduledIt(`imports ${fixture.file}`, async () => {
      expect(fixture.downloadUrl).toContain("docs.google.com/spreadsheets/");
      expect([fixture.producer, fixture.redistributed]).toEqual(["Google Sheets", false]);
      // The published sheet changes over time, so only its import is checked.
      const snapshot = await fromXlsxWorkbook(await fixtureBytes(fixture));
      expect(snapshot.sheets.some((sheet) => sheet.cells.length > 0)).toBe(true);
    });
  }
});
