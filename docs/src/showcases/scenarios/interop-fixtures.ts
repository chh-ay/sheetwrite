// The interoperability page's checked data: the committed XLSX fixtures and
// their manifest, the producer evidence, and the injection probe's text.
// No engine code, so the page's islands can import it before the grid loads.
import compressionRatioUrl from "../../../../packages/xlsx/test/fixtures/compression-ratio.xlsx?url";
import corruptDeflateUrl from "../../../../packages/xlsx/test/fixtures/corrupt-deflate.xlsx?url";
import deepXmlUrl from "../../../../packages/xlsx/test/fixtures/deep-xml.xlsx?url";
import doctypeUrl from "../../../../packages/xlsx/test/fixtures/doctype.xlsx?url";
import externalCorpus from "../../../../packages/xlsx/test/fixtures/external-corpus.json";
import libreofficeMetadataUrl from "../../../../packages/xlsx/test/fixtures/libreoffice-metadata.xlsx?url";
import libreofficeRichUrl from "../../../../packages/xlsx/test/fixtures/libreoffice-rich.xlsx?url";
import fixtureManifest from "../../../../packages/xlsx/test/fixtures/manifest.json";
import positiveUrl from "../../../../packages/xlsx/test/fixtures/sheetwrite-libreoffice-positive.xlsx?url";
import traversalUrl from "../../../../packages/xlsx/test/fixtures/traversal.xlsx?url";

/** Literal text that MUST leave the CSV path neutralized, never executable. */
export const INTEROP_INJECTION_TEXT = '=HYPERLINK("https://evil.example","Q3 total")';

export interface InteropFixture {
  id: string;
  file: string;
  url: string;
  sha256: string;
  producer: string;
  kind: "positive" | "adversarial";
  /** Supported features (positive) or the attack the codec must reject. */
  details: readonly string[];
  expectedWarnings: readonly string[];
}

const FIXTURE_URLS: Record<string, string> = {
  "sheetwrite-libreoffice-positive.xlsx": positiveUrl,
  "libreoffice-rich.xlsx": libreofficeRichUrl,
  "libreoffice-metadata.xlsx": libreofficeMetadataUrl,
  "traversal.xlsx": traversalUrl,
  "doctype.xlsx": doctypeUrl,
  "deep-xml.xlsx": deepXmlUrl,
  "compression-ratio.xlsx": compressionRatioUrl,
  "corrupt-deflate.xlsx": corruptDeflateUrl,
};

function fixtureUrl(file: string): string {
  const url = FIXTURE_URLS[file];
  if (url === undefined) {
    throw new Error(`Interoperability scenario is missing bytes for manifest fixture ${file}`);
  }
  return url;
}

/** LibreOffice-produced workbooks whose bytes are committed and run live here. */
export const POSITIVE_FIXTURES: readonly InteropFixture[] = fixtureManifest.positive.map(
  (entry) => ({
    id: entry.file.replace(/\.xlsx$/, ""),
    file: entry.file,
    url: fixtureUrl(entry.file),
    sha256: entry.sha256,
    producer: `${entry.producer.name} ${entry.producer.version}`,
    kind: "positive",
    details: entry.expectedSubset,
    expectedWarnings: entry.expectedWarnings,
  }),
);

/** Hand-authored hostile OPC/SpreadsheetML packages the codec must reject. */
export const ADVERSARIAL_FIXTURES: readonly InteropFixture[] = fixtureManifest.adversarial.map(
  (entry) => ({
    id: entry.file.replace(/\.xlsx$/, ""),
    file: entry.file,
    url: fixtureUrl(entry.file),
    sha256: entry.sha256,
    producer: fixtureManifest.adversarialProvenance.producer,
    kind: "adversarial",
    details: [entry.purpose],
    expectedWarnings: [],
  }),
);

export interface ProducerVerification {
  producer: string;
  status: "verified-live" | "unverified";
  detail: string;
  evidence: string;
}

const EXCEL_TEST_FILES = externalCorpus.fixtures.length;
const EXCEL_UNVERIFIED = externalCorpus.unverified["Microsoft Excel"];
const SHEETS_UNVERIFIED = externalCorpus.unverified["Google Sheets"];
const GOOGLE_TEST_FILES = externalCorpus.googleFixtures;

/**
 * Honest producer compatibility: only claims backed by real bytes. Every row
 * derives from the checked-in compatibility records, so a producer's status
 * changes here exactly when its evidence changes there.
 */
export const PRODUCER_MATRIX: readonly ProducerVerification[] = [
  {
    producer: `LibreOffice ${fixtureManifest.positive[0]?.producer.version ?? ""}`.trim(),
    status: "verified-live",
    detail:
      "Committed LibreOffice-produced workbooks import on this page, in your browser, after their file hashes match the checked fixture record.",
    evidence: "packages/xlsx/test/fixtures/manifest.json",
  },
  {
    producer: "Sheetwrite round-trip",
    status: "verified-live",
    detail:
      "The workbench below exports this document to .xlsx bytes and re-imports them live; formulas, formats, the merge, and frozen rows survive.",
    evidence: "toXlsxWorkbook / fromXlsxWorkbook on this page",
  },
  {
    producer: "Microsoft Excel",
    status: "unverified",
    detail: `${EXCEL_TEST_FILES} Excel-produced test files are listed from Apache POI commit ${externalCorpus.commit.slice(0, 10)}, with expected file hashes and download sources. The workbook bytes and reviewed results are not checked in, so no Excel result is available here. Still unverified from Excel files: ${EXCEL_UNVERIFIED.join(", ")}.`,
    evidence: "packages/xlsx/test/fixtures/external-corpus.json",
  },
  {
    producer: "Google Sheets",
    status: "unverified",
    detail:
      GOOGLE_TEST_FILES.length > 0
        ? `Metadata lists ${GOOGLE_TEST_FILES.length} Google Sheets-exported test file${GOOGLE_TEST_FILES.length === 1 ? "" : "s"} (${GOOGLE_TEST_FILES.map((fixture) => fixture.file).join(", ")}) with ${GOOGLE_TEST_FILES.length === 1 ? "its" : "their"} file hash recorded. The bytes and reviewed compatibility results are not checked in, so no Google Sheets result is available here. Still unverified from Google Sheets files: ${SHEETS_UNVERIFIED.join(", ")}.`
        : `No Google Sheets-produced test file or reviewed result is checked in, so no compatibility claim is made for: ${SHEETS_UNVERIFIED.join(", ")}.`,
    evidence: "packages/xlsx/test/fixtures/external-corpus.json",
  },
];
