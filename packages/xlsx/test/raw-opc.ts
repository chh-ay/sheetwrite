import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const FIXED_ZIP_TIME = new Date(1980, 0, 1);
export const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
export const TRANSITIONAL_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const STRICT_MAIN = "http://purl.oclc.org/ooxml/spreadsheetml/main";
export const TRANSITIONAL_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const STRICT_REL = "http://purl.oclc.org/ooxml/officeDocument/relationships";
const MACRO_WORKBOOK = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";

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
export function packageProblems(bytes: Uint8Array): string[] {
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

interface RawSheet {
  name?: string;
  xml: string;
  state?: "visible" | "hidden" | "veryHidden";
  relationships?: string;
}

export interface RawXlsxOptions {
  strict?: boolean;
  sheets: readonly RawSheet[];
  workbookPr?: string;
  workbookExtra?: string;
  workbookRelationships?: string;
  rootRelationships?: string;
  styles?: string;
  sharedStrings?: string;
  theme?: string;
  extraFiles?: Readonly<Record<string, string | Uint8Array>>;
  extraOverrides?: readonly string[];
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export function rawZip(
  files: Readonly<Record<string, string | Uint8Array>>,
  level: RawXlsxOptions["compressionLevel"] = 6,
): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        typeof value === "string" ? strToU8(value) : value,
      ]),
    ),
    { level, mtime: FIXED_ZIP_TIME },
  );
}

export function worksheet(body: string, strict = false): string {
  return `<?xml version="1.0"?><worksheet xmlns="${strict ? STRICT_MAIN : TRANSITIONAL_MAIN}" xmlns:r="${strict ? STRICT_REL : TRANSITIONAL_REL}">${body}</worksheet>`;
}

export function rawXlsx(options: RawXlsxOptions): Uint8Array {
  const strict = options.strict ?? false;
  const main = strict ? STRICT_MAIN : TRANSITIONAL_MAIN;
  const rel = strict ? STRICT_REL : TRANSITIONAL_REL;
  const sheets = options.sheets.length > 0 ? options.sheets : [{ xml: worksheet("<sheetData/>") }];
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheets.map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    ...(options.styles
      ? [
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        ]
      : []),
    ...(options.sharedStrings
      ? [
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
        ]
      : []),
    ...(options.theme
      ? [
          '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
        ]
      : []),
    ...(options.extraOverrides ?? []),
  ];
  let nextRelationship = sheets.length + 1;
  const workbookRelationships = [
    ...sheets.map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ),
    ...(options.styles
      ? [`<Relationship Id="rId${nextRelationship++}" Type="${rel}/styles" Target="styles.xml"/>`]
      : []),
    ...(options.sharedStrings
      ? [
          `<Relationship Id="rId${nextRelationship++}" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/>`,
        ]
      : []),
    ...(options.theme
      ? [
          `<Relationship Id="rId${nextRelationship++}" Type="${rel}/theme" Target="theme/theme1.xml"/>`,
        ]
      : []),
    options.workbookRelationships ?? "",
  ].join("");
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>${options.rootRelationships ?? ""}</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="${rel}">${options.workbookPr ?? ""}<sheets>${sheets
      .map(
        (sheet, index) =>
          `<sheet name="${sheet.name ?? `Raw${index + 1}`}" sheetId="${index + 1}"${sheet.state && sheet.state !== "visible" ? ` state="${sheet.state}"` : ""} r:id="rId${index + 1}"/>`,
      )
      .join("")}</sheets>${options.workbookExtra ?? ""}</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}">${workbookRelationships}</Relationships>`,
    ...Object.fromEntries(
      sheets.flatMap((sheet, index) => {
        const number = index + 1;
        return [
          [`xl/worksheets/sheet${number}.xml`, sheet.xml],
          ...(sheet.relationships
            ? [
                [
                  `xl/worksheets/_rels/sheet${number}.xml.rels`,
                  `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}">${sheet.relationships}</Relationships>`,
                ],
              ]
            : []),
        ] as [string, string][];
      }),
    ),
    ...(options.styles ? { "xl/styles.xml": options.styles } : {}),
    ...(options.sharedStrings ? { "xl/sharedStrings.xml": options.sharedStrings } : {}),
    ...(options.theme ? { "xl/theme/theme1.xml": options.theme } : {}),
    ...(options.extraFiles ?? {}),
  };
  return rawZip(files, options.compressionLevel);
}

export function stylesXml(body: string, strict = false): string {
  return `<?xml version="1.0"?><styleSheet xmlns="${strict ? STRICT_MAIN : TRANSITIONAL_MAIN}">${body}</styleSheet>`;
}

export const BASE_STYLES_BODY =
  '<fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>';
