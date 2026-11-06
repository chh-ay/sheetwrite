import { cellA1, type ExternalLink, type ExternalLinkValue } from "@sheetwrite/core";

import { parseCellReference } from "./cell-reference.js";
import { MAIN_NS, RELATIONSHIPS_NS } from "./format.js";
import { externalSheetText, formulaCallsExternalData, rewriteExternalSheets } from "./formula.js";
import { type OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import {
  decodeXstring,
  encodeXstring,
  escapeXml,
  type XmlElement,
  xmlAttribute,
  xmlChild,
  xmlChildren,
} from "./xml.js";

/*
 * External workbook links (ECMA-376 Part 1, §18.14). The workbook part lists
 * its links in `<externalReferences>`; file formulas name a link by its
 * position there (`[1]Annual!C10`), and Sheetwrite formulas by its file name
 * (`[Budget.xlsx]Annual!C10`). Each `externalLink` part holds the saved values
 * in `<sheetDataSet>`, and its relationship holds the linked file.
 */

export const EXTERNAL_LINK_REL = `${RELATIONSHIPS_NS}/externalLink`;
const EXTERNAL_LINK_PATH_REL = `${RELATIONSHIPS_NS}/externalLinkPath`;
export const EXTERNAL_LINK_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml";
/** The errors that link values can hold; others are left out with a warning. */
const ERROR_VALUES: Readonly<Record<string, true>> = {
  "#DIV/0!": true,
  "#NULL!": true,
  "#SPILL!": true,
  "#CALC!": true,
  "#VALUE!": true,
  "#REF!": true,
  "#NAME?": true,
  "#NUM!": true,
  "#N/A": true,
};
/** Most saved link cells one import keeps, which bounds engine memory. */
const MAX_LINK_CELLS = 1_000_000;

/** The links of an imported workbook. */
export interface ImportedExternalLinks {
  /** Links Sheetwrite reads, in `<externalReferences>` order. */
  readonly links: ExternalLink[];
  /** The book name of each `[n]` index of file formulas; undefined for a link it cannot read. */
  readonly books: readonly (string | undefined)[];
  /** The part of each read link, by book name. */
  readonly parts: ReadonlyMap<string, string>;
}

/** The file name in a link target such as `file:///C:\Reports\Budget.xlsx`. */
function bookName(target: string): string {
  const name = target.slice(Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\")) + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function linkValue(cell: XmlElement): ExternalLinkValue | undefined {
  const text = xmlChild(cell, "v")?.text;
  if (text === undefined) return undefined;

  switch (xmlAttribute(cell, "t") ?? "n") {
    case "b":
      return text === "1";
    case "e":
      return Object.hasOwn(ERROR_VALUES, text) ? { error: text } : undefined;
    case "str":
    case "s":
    case "inlineStr":
      return decodeXstring(text);
    default: {
      const number = Number(text);
      return Number.isFinite(number) ? number : undefined;
    }
  }
}

/** The link in one `externalLink` part, or undefined when it is not a workbook link. */
function readLink(
  packageFile: OpcPackage,
  part: string,
  budget: { cells: number },
  context: XlsxCodecContext,
): ExternalLink | undefined {
  const book = xmlChild(packageFile.readXml(part), "externalBook");
  const relationshipId = book && xmlAttribute(book, "id");
  const target = packageFile
    .relationships(part)
    .find((relationship) => relationship.id === relationshipId)?.target;
  if (!book || !target) return undefined;

  const sheets = xmlChildren(xmlChild(book, "sheetNames") ?? book, "sheetName").map((sheet) => ({
    name: decodeXstring(xmlAttribute(sheet, "val") ?? ""),
    cells: [] as ExternalLink["sheets"][number]["cells"],
  }));
  for (const data of xmlChildren(xmlChild(book, "sheetDataSet") ?? book, "sheetData")) {
    const sheet = sheets[Number(xmlAttribute(data, "sheetId"))];
    for (const row of sheet ? xmlChildren(data, "row") : []) {
      for (const cell of xmlChildren(row, "cell")) {
        const address = parseCellReference(xmlAttribute(cell, "r") ?? "");
        const value = linkValue(cell);
        if (!address || value === undefined) continue;
        if (budget.cells >= MAX_LINK_CELLS) {
          emitWarning(context, {
            code: "unsupported-feature",
            message: `Saved values of external links past ${MAX_LINK_CELLS} cells were dropped`,
            part,
          });
          return undefined;
        }
        budget.cells += 1;
        sheet?.cells.push({ ...address, value });
      }
    }
  }

  return { book: bookName(target), target, sheets: sheets.filter((sheet) => sheet.name) };
}

/** Read the workbook links that file formulas name by `[n]`. */
export async function readExternalLinks(
  packageFile: OpcPackage,
  workbookRoot: XmlElement,
  workbookRelationships: readonly OpcRelationship[],
  context: XlsxCodecContext,
): Promise<ImportedExternalLinks> {
  const links: ExternalLink[] = [];
  const books: (string | undefined)[] = [];
  const parts = new Map<string, string>();
  const budget = { cells: 0 };
  const references = xmlChild(workbookRoot, "externalReferences");
  for (const reference of references ? xmlChildren(references, "externalReference") : []) {
    const relationship = workbookRelationships.find(
      (candidate) => candidate.id === xmlAttribute(reference, "id"),
    );
    let link: ExternalLink | undefined;
    if (relationship && !relationship.external) {
      await packageFile.load([relationship.target]);
      link = readLink(packageFile, relationship.target, budget, context);
      packageFile.release([relationship.target]);
    }

    // A link that is not a workbook (DDE or OLE), or a second link to the
    // same file name, is not read; the reader warns for its relationship.
    const known =
      link && links.some((other) => other.book.toLowerCase() === link.book.toLowerCase());
    if (!link || !relationship || known) {
      books.push(undefined);
      continue;
    }
    links.push(link);
    books.push(link.book);
    parts.set(link.book, relationship.target);
  }
  return { links, books, parts };
}

/**
 * An imported formula with each `[n]` link index replaced by the book name,
 * or undefined when it calls a live external-data function, names a link that
 * was not read, or names a defined name of another workbook.
 */
export function linkedFormula(
  formula: string,
  books: readonly (string | undefined)[] = [],
): string | undefined {
  if (formulaCallsExternalData(formula)) return undefined;
  return rewriteExternalSheets(formula, ({ book, sheet }) => {
    const name = /^\d+$/.test(book) ? books[Number(book) - 1] : undefined;
    return name && sheet ? externalSheetText(name, sheet) : undefined;
  });
}

/** The links an export writes from the model, with the `[n]` indexes formulas use. */
export class ExternalLinkExport {
  /** Links written from the model; copies, so the snapshot is never changed. */
  readonly written: ExternalLink[] = [];
  /** The `[n]` index of each book, by lowercase book name. */
  readonly #indexes = new Map<string, number>();

  /** `kept` are the books whose original parts the export writes back, in their order. */
  constructor(links: readonly ExternalLink[], kept: readonly string[]) {
    for (const book of kept) this.#indexes.set(book.toLowerCase(), this.#indexes.size + 1);
    for (const link of links) {
      if (this.#indexes.has(link.book.toLowerCase())) continue;
      this.#indexes.set(link.book.toLowerCase(), this.#indexes.size + 1);
      this.written.push({ ...link, sheets: [...link.sheets] });
    }
  }

  /**
   * The formula with each book name replaced by its `[n]` index. A book with
   * no link gets one without saved values, so Excel can still find the file.
   */
  fileFormula(formula: string): string {
    const rewritten = rewriteExternalSheets(formula, ({ book, sheet }) => {
      const key = book.toLowerCase();
      let index = this.#indexes.get(key);
      if (index === undefined) {
        index = this.#indexes.size + 1;
        this.#indexes.set(key, index);
        this.written.push({ book, target: book, sheets: [] });
      }

      const link = this.written.find((candidate) => candidate.book.toLowerCase() === key);
      if (link && sheet && !link.sheets.some((known) => known.name === sheet)) {
        link.sheets.push({ name: sheet, cells: [] });
      }
      return externalSheetText(String(index), sheet);
    });
    return rewritten ?? formula;
  }
}

/** The `externalLink` part of one link, and its relationships part. */
export function externalLinkPartXml(link: ExternalLink): { part: string; relationships: string } {
  let sheetData = "";
  link.sheets.forEach((sheet, sheetId) => {
    const rows = new Map<number, typeof sheet.cells>();
    for (const cell of sheet.cells) rows.set(cell.row, [...(rows.get(cell.row) ?? []), cell]);
    if (rows.size === 0) return;

    sheetData += `<sheetData sheetId="${sheetId}">`;
    for (const row of [...rows.keys()].sort((left, right) => left - right)) {
      sheetData += `<row r="${row + 1}">`;
      const cells = rows.get(row) ?? [];
      for (const { col, value } of cells.sort((left, right) => left.col - right.col)) {
        const reference = cellA1(row, col);
        if (typeof value === "number") sheetData += `<cell r="${reference}"><v>${value}</v></cell>`;
        else if (typeof value === "boolean") {
          sheetData += `<cell r="${reference}" t="b"><v>${value ? 1 : 0}</v></cell>`;
        } else if (typeof value === "string") {
          sheetData += `<cell r="${reference}" t="str"><v>${escapeXml(encodeXstring(value))}</v></cell>`;
        } else {
          sheetData += `<cell r="${reference}" t="e"><v>${escapeXml(value.error)}</v></cell>`;
        }
      }
      sheetData += "</row>";
    }
    sheetData += "</sheetData>";
  });

  const sheetNames = link.sheets
    .map((sheet) => `<sheetName val="${escapeXml(encodeXstring(sheet.name))}"/>`)
    .join("");
  return {
    part:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<externalLink xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}"><externalBook r:id="rId1">` +
      `<sheetNames>${sheetNames}</sheetNames>` +
      (sheetData ? `<sheetDataSet>${sheetData}</sheetDataSet>` : "") +
      `</externalBook></externalLink>`,
    relationships:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${EXTERNAL_LINK_PATH_REL}" Target="${escapeXml(link.target)}" TargetMode="External"/>` +
      `</Relationships>`,
  };
}

/** Whether a workbook relationship is an external link. */
export function isExternalLinkRelationship(relationship: OpcRelationship): boolean {
  return relationshipTypeMatches(relationship.type, "externalLink");
}
