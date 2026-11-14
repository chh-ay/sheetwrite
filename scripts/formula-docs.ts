import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { inlineIcon } from "../docs/src/icons/inline-icon.js";
import {
  FORMULA_FAMILY_CARDS,
  UNSUPPORTED_FORMULA_GROUPS,
} from "../docs/src/lib/formula-overview.js";
import { SHORT_CODE_CLASS, SHORT_CODE_LENGTH } from "../docs/src/lib/inline-code.js";
import { html } from "./evidence-format.js";
import { validateFormulaContractRepository } from "./formula-contract.js";

const DEFAULT_INVENTORY_PATH = "test/conformance/formula-contract.inventory.json";
const REQUIRED_SUPPORTED_COUNT = 100;

type JsonObject = Record<string, unknown>;

interface FormulaArgument {
  readonly name: string;
  readonly required: boolean;
  readonly default: unknown;
  readonly accepts: readonly string[];
  readonly repeat: string;
}

interface SignatureProfile {
  readonly arguments: readonly FormulaArgument[];
  readonly returns: string;
}

interface FormulaRecord {
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly builds: readonly string[];
  readonly family: string;
  readonly contractStatus: "required-supported" | "supported";
  readonly signature: string;
  readonly semantics: string;
  readonly dialects: string;
  readonly implementation: string;
  readonly version: number;
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function recordMap(value: unknown, label: string): Record<string, JsonObject> {
  const source = object(value, label);
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [key, object(entry, `${label}.${key}`)]),
  );
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/(^-|-$)/gu, "");
}

function parseSignatureProfiles(value: unknown): Record<string, SignatureProfile> {
  return Object.fromEntries(
    Object.entries(recordMap(value, "signatureProfiles")).map(([id, raw]) => {
      const argumentsValue = raw.arguments;
      if (!Array.isArray(argumentsValue))
        throw new Error(`signatureProfiles.${id}.arguments must be an array`);
      const args = argumentsValue.map((entry, index): FormulaArgument => {
        const argument = object(entry, `signatureProfiles.${id}.arguments[${index}]`);
        if (typeof argument.required !== "boolean") {
          throw new Error(`signatureProfiles.${id}.arguments[${index}].required must be boolean`);
        }
        return {
          name: string(argument.name, `signatureProfiles.${id}.arguments[${index}].name`),
          required: argument.required,
          default: argument.default,
          accepts: stringArray(
            argument.accepts,
            `signatureProfiles.${id}.arguments[${index}].accepts`,
          ),
          repeat: string(argument.repeat, `signatureProfiles.${id}.arguments[${index}].repeat`),
        };
      });
      return [
        id,
        { arguments: args, returns: string(raw.returns, `signatureProfiles.${id}.returns`) },
      ];
    }),
  );
}

/** A run of an Excel syntax line: punctuation, an ellipsis, or argument text. */
const SYNTAX_TOKEN = /(\[|\]|\(|\)|,\s*|\.\.\.|…|[^[\](),.…]+)/g;

/**
 * Inline code in a static table, classed as the docs build classes inline
 * code in pages (short code stays on one line).
 */
function inlineCode(text: string): string {
  const className = text.length <= SHORT_CODE_LENGTH ? ` class="${SHORT_CODE_CLASS}"` : "";
  return `<code${className}>${html(text)}</code>`;
}

/** The top-level arguments of a syntax line: `[value2, ...]` and `lambda(row, col)` stay one argument. */
function syntaxArguments(argumentsText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < argumentsText.length; index++) {
    const char = argumentsText[index];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      parts.push(argumentsText.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(argumentsText.slice(start).trim());
  return parts.filter((part) => part !== "");
}

/**
 * A function's call syntax as Microsoft documents it (`AVERAGEIF(range,
 * criteria, [average_range])`), coloured with the site's code roles:
 * argument names as properties, brackets, commas and ellipses as punctuation.
 * Each argument is one unit, so a long line wraps between arguments, never
 * inside one; optional arguments and the trailing ellipsis are marked so they
 * read quieter.
 */
function excelSyntaxHtml(name: string, syntax: string): string {
  const open = syntax.indexOf("(");
  const close = syntax.lastIndexOf(")");
  const argumentsText = open < 0 || close < open ? "" : syntax.slice(open + 1, close);
  const parts = syntaxArguments(argumentsText).map((argument) => {
    // Argument names are `<var>` elements; punctuation stays bare text in the
    // code element's punctuation colour.
    const tokens = [...argument.matchAll(SYNTAX_TOKEN)].map(([token]) =>
      /^[\w '-]+$/.test(token.trim()) && token.trim() !== ""
        ? `<var>${html(token)}</var>`
        : html(token),
    );
    const optional = argument.startsWith("[") || /^(?:…|\.\.\.)$/u.test(argument);
    return `<span class="sw-formula-arg"${optional ? " data-optional" : ""}>${tokens.join("")}</span>`;
  });
  return `<code class="sw-formula-syntax"><span class="sw-code-function">${html(name)}</span>(${parts.join(", ")})</code>`;
}

function parseFunctions(value: unknown): FormulaRecord[] {
  if (!Array.isArray(value)) throw new Error("functions must be an array");
  return value.map((entry, index): FormulaRecord => {
    const formula = object(entry, `functions[${index}]`);
    const contractStatus = string(formula.contractStatus, `functions[${index}].contractStatus`);
    if (contractStatus !== "required-supported" && contractStatus !== "supported") {
      throw new Error(`functions[${index}].contractStatus is unsupported: ${contractStatus}`);
    }
    if (typeof formula.version !== "number")
      throw new Error(`functions[${index}].version must be numeric`);
    return {
      canonical: string(formula.canonical, `functions[${index}].canonical`),
      aliases: stringArray(formula.aliases, `functions[${index}].aliases`),
      family: string(formula.family, `functions[${index}].family`),
      builds: stringArray(formula.builds, `functions[${index}].builds`),
      contractStatus,
      signature: string(formula.signature, `functions[${index}].signature`),
      semantics: string(formula.semantics, `functions[${index}].semantics`),
      dialects: string(formula.dialects, `functions[${index}].dialects`),
      implementation: string(formula.implementation, `functions[${index}].implementation`),
      version: formula.version,
    };
  });
}

/** Flag bits of one generated built-in function row; core reads the same bits. */
const FUNCTION_FLAG_VOLATILE = 1;
const FUNCTION_FLAG_DEFAULT_ENGINE = 2;
const FUNCTION_FLAG_FULL_ENGINE = 4;
const BUILD_FLAGS: Readonly<Record<string, number>> = {
  "@sheetwrite/wasm": FUNCTION_FLAG_DEFAULT_ENGINE,
  "@sheetwrite/formulas": FUNCTION_FLAG_FULL_ENGINE,
};

/**
 * The built-in function table that core loads on demand. Each signature
 * profile and family title is written once and rows refer to them by index,
 * which keeps the module small. `volatileNames` comes from the engine source.
 */
export function renderFunctionMetadata(
  inventoryValue: unknown,
  volatileNames: ReadonlySet<string>,
): string {
  const inventory = object(inventoryValue, "formula inventory");
  const signatures = parseSignatureProfiles(inventory.signatureProfiles);
  const families = recordMap(inventory.families, "families");
  const familyIds = Object.keys(families);
  const signatureIds = Object.keys(signatures);

  const rows = parseFunctions(inventory.functions).flatMap((formula) => {
    const familyIndex = familyIds.indexOf(formula.family);
    const profileIndex = signatureIds.indexOf(formula.signature);
    if (familyIndex < 0 || profileIndex < 0) {
      throw new Error(`Missing metadata for ${formula.canonical}`);
    }

    let flags = volatileNames.has(formula.canonical) ? FUNCTION_FLAG_VOLATILE : 0;
    for (const build of formula.builds) {
      const flag = BUILD_FLAGS[build];
      if (flag === undefined) throw new Error(`${formula.canonical} has unknown build ${build}`);
      flags |= flag;
    }

    return [formula.canonical, ...formula.aliases].map((name) =>
      JSON.stringify([name, familyIndex, profileIndex, flags]),
    );
  });

  const familyTitles = familyIds.map((id) =>
    JSON.stringify(string(families[id]?.title, `families.${id}.title`)),
  );
  const profiles = signatureIds.map((id) => {
    const signature = signatures[id];
    if (!signature) throw new Error(`Missing signature ${id}`);

    return JSON.stringify({
      arguments: signature.arguments.map((argument) => ({
        name: argument.name,
        types: argument.accepts,
        optional: !argument.required,
        repeating: argument.repeat !== "once",
      })),
      returnKind: signature.returns,
    });
  });

  return [
    "// Generated by scripts/function-metadata.ts from the formula contract inventory",
    "// and the engine's volatile functions. Core loads it on first use only:",
    "// from listFunctions(), formula help and Explain Formula.",
    'import type { BuiltInFunctionTable } from "../functions/types.js";',
    "",
    "export const BUILT_IN_FUNCTIONS: BuiltInFunctionTable = {",
    `  families: [\n    ${familyTitles.join(",\n    ")},\n  ],`,
    `  profiles: [\n    ${profiles.join(",\n    ")},\n  ],`,
    `  functions: [\n    ${rows.join(",\n    ")},\n  ],`,
    "};",
    "",
  ].join("\n");
}

const REFERENCE_PATH = "scripts/formula-reference.json";

/** One function's reference text on its family page. */
export interface FormulaReferenceEntry {
  /** What the function does, in one line, written for these docs. */
  readonly summary: string;
  /** The call syntax with Excel's argument names, as Microsoft's function page gives it. */
  readonly syntax: string;
}

/**
 * The summary and Excel call syntax of every formula function, keyed by
 * canonical name. Each syntax line names its own function.
 */
export async function loadFormulaReferenceEntries(
  root: string,
): Promise<Readonly<Record<string, FormulaReferenceEntry>>> {
  const value: unknown = JSON.parse(await readFile(resolve(root, REFERENCE_PATH), "utf8"));
  const entries = object(value, REFERENCE_PATH);
  for (const [name, entryValue] of Object.entries(entries)) {
    const entry = object(entryValue, `${REFERENCE_PATH}.${name}`);
    string(entry.summary, `${REFERENCE_PATH}.${name}.summary`);
    const syntax = string(entry.syntax, `${REFERENCE_PATH}.${name}.syntax`);
    if (!syntax.startsWith(`${name}(`) || !syntax.endsWith(")")) {
      throw new Error(`${REFERENCE_PATH}.${name}.syntax must be a call of ${name}: ${syntax}`);
    }
    const literals = syntaxLiterals(syntax.slice(name.length + 1, -1));
    if (literals.length > 0) {
      throw new Error(
        `${REFERENCE_PATH}.${name}.syntax must name its arguments, not give values: ${literals.join(", ")}`,
      );
    }
  }
  return entries as Record<string, FormulaReferenceEntry>;
}

/**
 * An argument name as Excel's syntax lines write them: lower-case words joined
 * by underscores (`sum_range`, `known_y's`, `number-chosen`), or a single
 * capital for the optional bounds of the beta distributions (`[A]`, `[B]`).
 */
const ARGUMENT_NAME = /^(?:[a-z][a-z0-9_'.-]*|[A-Z])$/;
/** A function argument written as its own call shape, as in `lambda(row, col)`. */
const LAMBDA_ARGUMENT = /lambda\(([^()]*)\)/g;

/**
 * The arguments of a syntax line that are not argument names: example values
 * such as numbers, quoted text or cell references, and prompt text.
 */
export function syntaxLiterals(argumentsText: string): string[] {
  const names = argumentsText
    .replace(LAMBDA_ARGUMENT, (_, inner: string) => `lambda, ${inner}`)
    .split(/[,[\]]/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "…");
  return names.filter((part) => !ARGUMENT_NAME.test(part));
}

export async function loadFormulaContractInventory(
  root: string,
  path = DEFAULT_INVENTORY_PATH,
): Promise<unknown> {
  const inventory: unknown = JSON.parse(await readFile(resolve(root, path), "utf8"));
  const validation = await validateFormulaContractRepository(root, inventory);
  if (validation.issues.length > 0) {
    throw new Error(`Formula registry drift:\n${validation.issues.join("\n")}`);
  }

  return inventory;
}

/**
 * A family's function table as static HTML, published apart from its page so
 * the page's script carries no table rows: the server render inlines it, and
 * a client-side navigation fetches it.
 */
export interface FormulaTable {
  /** The family's route slug, which also names the table file. */
  readonly family: string;
  readonly html: string;
}

/** One generated formula reference page, relative to the docs content root. */
export interface FormulaReferencePage {
  readonly route: string;
  readonly content: string;
  /** The family's function table, on family pages. */
  readonly table?: FormulaTable;
}

const FORMULA_FUNCTIONS_ROUTE = "/docs/reference/formula-functions/";

/**
 * The formula function reference: an overview with the engine, limits and
 * unsupported categories, and one page per function family. A family page
 * carries only the contract profiles its own functions use.
 */
export function renderFormulaFunctionPages(
  inventoryValue: unknown,
  entries: Readonly<Record<string, FormulaReferenceEntry>>,
): FormulaReferencePage[] {
  const inventory = object(inventoryValue, "formula inventory");
  const contract = string(inventory.contract, "contract");
  if (contract !== "sheetwrite.formula-capabilities") {
    throw new Error(`unexpected formula contract: ${contract}`);
  }
  if (typeof inventory.version !== "number")
    throw new Error("formula inventory version must be numeric");

  const families = recordMap(inventory.families, "families");
  const signatures = parseSignatureProfiles(inventory.signatureProfiles);
  const semantics = recordMap(inventory.semanticsProfiles, "semanticsProfiles");
  const dialects = recordMap(inventory.dialectProfiles, "dialectProfiles");
  const implementations = recordMap(inventory.implementationProfiles, "implementationProfiles");
  const functions = parseFunctions(inventory.functions);
  if (!Array.isArray(inventory.unsupportedCategories)) {
    throw new Error("unsupportedCategories must be an array");
  }
  const unsupported = inventory.unsupportedCategories.map((entry, index) =>
    object(entry, `unsupportedCategories[${index}]`),
  );

  const duplicateNames = functions
    .map((formula) => formula.canonical)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0)
    throw new Error(`duplicate formula names: ${duplicateNames.join(", ")}`);

  const required = functions.filter((formula) => formula.contractStatus === "required-supported");
  const extension = functions.filter((formula) => !formula.builds.includes("@sheetwrite/wasm"));
  if (required.length !== REQUIRED_SUPPORTED_COUNT) {
    throw new Error(
      `formula documentation requires ${REQUIRED_SUPPORTED_COUNT} required-supported functions; found ${required.length}`,
    );
  }

  const undescribed = functions.filter((formula) => entries[formula.canonical] === undefined);
  if (undescribed.length > 0) {
    throw new Error(
      `${REFERENCE_PATH} has no entry for ${undescribed.map((formula) => formula.canonical).join(", ")}`,
    );
  }
  const canonicalNames = new Set(functions.map((formula) => formula.canonical));
  const unknown = Object.keys(entries).filter((name) => !canonicalNames.has(name));
  if (unknown.length > 0) {
    throw new Error(`${REFERENCE_PATH} describes unknown functions: ${unknown.join(", ")}`);
  }

  for (const formula of functions) {
    if (!families[formula.family])
      throw new Error(`${formula.canonical} has unknown family ${formula.family}`);
    if (!signatures[formula.signature]) {
      throw new Error(`${formula.canonical} has unknown signature ${formula.signature}`);
    }
    if (!semantics[formula.semantics]) {
      throw new Error(`${formula.canonical} has unknown semantics ${formula.semantics}`);
    }
    if (!dialects[formula.dialects]) {
      throw new Error(`${formula.canonical} has unknown dialect ${formula.dialects}`);
    }
    if (!implementations[formula.implementation]) {
      throw new Error(`${formula.canonical} has unknown implementation ${formula.implementation}`);
    }
  }

  // A family with no functions has nothing to publish.
  const publishedFamilies = Object.entries(families).flatMap(([familyId, family]) => {
    const familyFunctions = functions.filter((formula) => formula.family === familyId);
    if (familyFunctions.length === 0) return [];
    return [
      {
        id: familyId,
        title: string(family.title, `families.${familyId}.title`),
        functions: familyFunctions,
      },
    ];
  });
  const familyRoute = (id: string): string => `${FORMULA_FUNCTIONS_ROUTE}${anchor(id)}/`;
  const entryHref = (formula: FormulaRecord): string =>
    `${familyRoute(formula.family)}#${functionAnchor(formula.canonical)}`;
  const inDefaultEngine = (formula: FormulaRecord): boolean =>
    formula.builds.includes("@sheetwrite/wasm");
  const summaryOf = (formula: FormulaRecord): string => entries[formula.canonical]?.summary ?? "";

  const overview = [
    "---",
    'title: "Formula functions"',
    'description: "Every formula function Sheetwrite runs, by category and from A to Z, which engine has it, and the functions it does not run."',
    "---",
    "",
    `Sheetwrite runs **${functions.length} functions**. The default engine has ${functions.length - extension.length} of them; the full engine adds ${extension.length} analysis functions. [Excel function coverage](/docs/reference/excel-function-coverage/) compares this list with every function in Excel.`,
    "",
    "## Functions by category",
    "",
    familyCards(publishedFamilies, { familyRoute, entryHref, inDefaultEngine }),
    "",
    "## Function index",
    "",
    "Every function from A to Z. Type a name to narrow the list. **Full build** marks a function that only the full engine has.",
    "",
    // The open tag alone on its line starts an HTML block, so the filter is
    // not wrapped in a paragraph.
    `<FormulaReference family="${FUNCTION_INDEX}">`,
    "</FormulaReference>",
    "",
    "## Engine builds",
    "",
    "- `@sheetwrite/wasm` is the default engine. Functions marked **Full build** are only in `@sheetwrite/formulas`.",
    '- `@sheetwrite/formulas` is the full engine. It adds the analysis families marked on the family pages: distributions and statistics, regression, finance, dates, text and regex, database, math and matrices, reshaping, LAMBDA helpers, and grouping. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite({ engine: formulas });`.',
    "- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.",
    "- Numeric functions use binary64 arithmetic with function-specific domains and bounded numerical algorithms. Results do not promise unlimited tail accuracy or complete Excel, Google Sheets or OpenFormula parity.",
    "",
    "## Bounded evaluation contract",
    "",
    "- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.",
    "- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see [Dynamic arrays and spills](/docs/features/formulas/dynamic-arrays-and-spills/) for admission rules.",
    "- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.",
    "- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.",
    "- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.",
    "",
    "These limits are ceilings, not speeds. [Formula engine performance](/docs/performance/formula-engine/) has the measured times.",
    "",
    "## Unsupported functions",
    "",
    "Some Excel functions need a network, a service or another file. Sheetwrite does not run them. It keeps the formula as written, so the workbook saves and opens again unchanged.",
    "",
    unsupportedList(unsupported),
    "",
    "`OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY` and `NOW` are volatile and recalculate after each edit. `OFFSET` and `INDIRECT` return references that can feed reference-taking functions or spill their values. `INDIRECT` reference text is not rewritten by fill, copy, or structural edits.",
    "",
  ];

  const indexHtml = functionIndexHtml(
    [...functions].sort((left, right) => left.canonical.localeCompare(right.canonical)),
    { entryHref, inDefaultEngine, summaryOf },
  );

  const familyPages = publishedFamilies.map((family): FormulaReferencePage => {
    const slug = anchor(family.id);
    // Each dialect profile that differs from Excel, with this family's functions that use it.
    const differences = [...new Set(family.functions.map((formula) => formula.dialects))].flatMap(
      (id) => {
        const dialect = dialects[id];
        if (dialect === undefined) return [];
        const members = family.functions.filter((formula) => formula.dialects === id);
        const [first] = members;
        if (first === undefined) return [];
        const { partial, notes } = excelDifference(first, dialect);
        return partial ? [{ id, names: members.map((formula) => formula.canonical), notes }] : [];
      },
    );
    const differing = new Set(differences.map((difference) => difference.id));
    const tableHtml = [
      '<section class="sw-formula-family"><table class="sw-formula-table"><thead><tr><th>Function and syntax</th><th>What it does</th></tr></thead><tbody>',
      ...family.functions.map((formula) => {
        const names = [formula.canonical, ...formula.aliases];
        const aliases = formula.aliases.map((name) => inlineCode(name)).join(", ");
        const isDefault = inDefaultEngine(formula);
        const syntax = excelSyntaxHtml(
          formula.canonical,
          entries[formula.canonical]?.syntax ?? `${formula.canonical}()`,
        );
        const badges = [
          isDefault ? "" : FULL_BUILD_BADGE,
          differing.has(formula.dialects)
            ? `<a class="sw-formula-differs" href="#${differenceAnchor(formula.dialects)}">Differs from Excel</a>`
            : "",
        ].join("");
        return `<tr id="${functionAnchor(formula.canonical)}" data-formula-name="${html(names.join(" "))}" data-engine="${isDefault ? "default" : "full"}"><td>${syntax}${aliases ? `<small>Also ${aliases}</small>` : ""}${badges === "" ? "" : `<span class="sw-formula-badges">${badges}</span>`}</td><td class="sw-formula-summary">${html(summaryOf(formula))}</td></tr>`;
      }),
      "</tbody></table></section>",
    ].join("");
    const lines = [
      "---",
      `title: ${JSON.stringify(`${family.title} functions`)}`,
      `description: ${JSON.stringify(`Every ${family.title.toLowerCase()} formula function: its syntax, what it does, and which engine has it.`)}`,
      "---",
      "",
      `This page lists the ${family.functions.length} ${family.title.toLowerCase()} functions. **Full build** marks a function that only the full engine has; see [engine builds](${FORMULA_FUNCTIONS_ROUTE}#engine-builds). The [formula functions overview](${FORMULA_FUNCTIONS_ROUTE}) has every category and an A to Z index.`,
      "",
      "## Functions",
      "",
      // The open tag alone on its line starts an HTML block, so the filter is
      // not wrapped in a paragraph.
      `<FormulaReference family="${slug}">`,
      "</FormulaReference>",
      "",
    ];
    if (differences.length > 0) {
      lines.push(
        "## Known differences",
        "",
        "Where these functions give a different result from Excel:",
        "",
        `<ul class="sw-formula-differences">${differences
          .map(
            (difference) =>
              `<li id="${differenceAnchor(difference.id)}"><b>${html(difference.names.join(", "))}</b> ${html(difference.notes.join(" "))}</li>`,
          )
          .join("")}</ul>`,
        "",
      );
    }
    return {
      route: `reference/formula-functions/${slug}.md`,
      content: `${lines.join("\n").trimEnd()}\n`,
      table: { family: slug, html: `${tableHtml}\n` },
    };
  });

  return [
    {
      route: "reference/formula-functions.md",
      content: `${overview.join("\n").trimEnd()}\n`,
      table: { family: FUNCTION_INDEX, html: `${indexHtml}\n` },
    },
    ...familyPages,
  ];
}

/** The table name of the overview's A to Z index (`<FormulaReference family>`). */
const FUNCTION_INDEX = "index";

const FULL_BUILD_BADGE = '<span class="sw-formula-build" data-build="full">Full build</span>';

/** The id of a function's row on its family page: `fn-sum`. */
function functionAnchor(name: string): string {
  return `fn-${anchor(name)}`;
}

/** The id of one Excel difference on a family page. */
function differenceAnchor(dialect: string): string {
  return `excel-difference-${anchor(dialect)}`;
}

interface FamilyLinks {
  readonly familyRoute: (id: string) => string;
  readonly entryHref: (formula: FormulaRecord) => string;
  readonly inDefaultEngine: (formula: FormulaRecord) => boolean;
}

/** One card per family: what it is for, how many functions it has, and its most used ones. */
function familyCards(
  families: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly functions: readonly FormulaRecord[];
  }>,
  links: FamilyLinks,
): string {
  const uncarded = families.filter((family) => FORMULA_FAMILY_CARDS[family.id] === undefined);
  if (uncarded.length > 0) {
    throw new Error(
      `docs/src/lib/formula-overview.ts has no card for ${uncarded.map((family) => family.id).join(", ")}`,
    );
  }
  const cards = Object.entries(FORMULA_FAMILY_CARDS).flatMap(([id, card]) => {
    const family = families.find((entry) => entry.id === id);
    if (family === undefined) {
      throw new Error(`docs/src/lib/formula-overview.ts has a card for unknown family ${id}`);
    }
    const total = family.functions.length;
    const inDefault = family.functions.filter(links.inDefaultEngine).length;
    const builds =
      inDefault === 0
        ? "full build only"
        : inDefault === total
          ? "all in the default build"
          : `${inDefault} in the default build`;
    const common = card.common.map((name) => {
      const formula = family.functions.find((entry) => entry.canonical === name);
      if (formula === undefined)
        throw new Error(`The ${id} card names ${name}, not in that family`);
      return `<a href="${links.entryHref(formula)}">${html(name)}</a>`;
    });
    const href = links.familyRoute(id);
    return [
      `<li class="sw-function-family"><a class="sw-function-family__title" href="${href}">${inlineIcon(card.icon, "md")}<span>${html(family.title)}</span></a><p class="sw-function-family__purpose">${html(card.purpose)}</p><p class="sw-function-family__count">${total} functions · ${builds}</p><p class="sw-function-family__common">${common.join("")}</p><a class="sw-function-family__more" href="${href}">See all ${total}<span aria-hidden="true"> →</span></a></li>`,
    ];
  });
  return `<ul class="sw-function-families">${cards.join("")}</ul>`;
}

/** Every function from A to Z, one group per first letter, for the overview's filter. */
function functionIndexHtml(
  sorted: readonly FormulaRecord[],
  links: Omit<FamilyLinks, "familyRoute"> & {
    readonly summaryOf: (formula: FormulaRecord) => string;
  },
): string {
  // The docs app type-checks this file against ES2022, which has no Map.groupBy.
  const letters = new Map<string, FormulaRecord[]>();
  for (const formula of sorted) {
    const letter = formula.canonical.charAt(0);
    letters.set(letter, [...(letters.get(letter) ?? []), formula]);
  }
  return [...letters]
    .map(
      ([letter, group]) =>
        `<section class="sw-formula-family sw-function-index"><h3>${html(letter)}</h3><ul>${group
          .map((formula) => {
            const isDefault = links.inDefaultEngine(formula);
            // The first sentence is enough to tell functions apart.
            const [summary = ""] = links.summaryOf(formula).split(/(?<=\.)\s/u);
            return `<li data-formula-name="${html([formula.canonical, ...formula.aliases].join(" "))}" data-engine="${isDefault ? "default" : "full"}"><a href="${links.entryHref(formula)}">${html(formula.canonical)}</a><span>${html(summary)}</span>${isDefault ? "" : FULL_BUILD_BADGE}</li>`;
          })
          .join("")}</ul></section>`,
    )
    .join("");
}

/** The unsupported categories in plain words: why, examples, what the cell shows, and where to read more. */
function unsupportedList(categories: readonly JsonObject[]): string {
  const items = categories.map((category, index) => {
    const id = string(category.id, `unsupportedCategories[${index}].id`);
    const group = UNSUPPORTED_FORMULA_GROUPS[id];
    if (group === undefined) {
      throw new Error(`docs/src/lib/formula-overview.ts does not describe unsupported group ${id}`);
    }
    const examples = stringArray(category.examples, `unsupportedCategories[${index}].examples`);
    return `<li><p class="sw-unsupported__name">${html(group.name)}</p><p>${html(group.why)}</p><p class="sw-unsupported__facts"><span>Examples: ${html(examples.join(", "))}</span><span>The cell shows <code>${html(group.shows)}</code>${group.when === undefined ? "" : ` ${html(group.when)}`}</span></p><a class="sw-unsupported__more" href="${group.see.href}">${html(group.see.label)}</a></li>`;
  });
  return `<ul class="sw-unsupported">${items.join("")}</ul>`;
}

/** Navigation entries for the family pages, in inventory order. */
export function formulaFamilyNavigation(
  pages: readonly FormulaReferencePage[],
): Array<{ label: string; href: string }> {
  return pages.flatMap((page) => {
    const match = /^reference\/formula-functions\/([a-z0-9-]+)\.md$/.exec(page.route);
    const title = /^title: "(.*) functions"$/m.exec(page.content)?.[1];
    if (match === null || title === undefined) return [];
    return [{ label: title, href: `${FORMULA_FUNCTIONS_ROUTE}${match[1]}/` }];
  });
}

interface ExcelCoverageContext {
  readonly byName: ReadonlyMap<string, FormulaRecord>;
  readonly dialects: Record<string, JsonObject>;
  /** Contract scope text for names that are unsupported by design. */
  readonly exclusions: ReadonlyMap<string, string>;
  readonly seen: Set<string>;
  readonly summary: { supported: number; partial: number; missing: number };
}

function excelDifference(
  formula: FormulaRecord,
  dialect: JsonObject,
): {
  readonly partial: boolean;
  readonly notes: readonly string[];
} {
  const partial = dialect.excel === "divergent";
  const notes = stringArray(dialect.divergences, `${formula.dialects}.divergences`)
    .filter((note) => !note.startsWith("Google Sheets and OpenFormula"))
    .map((note) => note.replace(/^Available only[^.]*\.\s*/u, ""))
    .filter((note) => note.length > 0);
  if (partial && notes.length === 0) {
    throw new Error(`${formula.canonical} needs an Excel difference`);
  }

  return { partial, notes };
}

/** The issue that tracks an open gap, as a sentence that links it. */
function trackingIssue(value: unknown, name: string): string {
  if (value === undefined) return "";
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Excel function ${name} has an invalid tracking issue`);
  }
  return ` Tracked in [#${value}](https://github.com/chh-ay/sheetwrite/issues/${value}).`;
}

function renderExcelCoverageRow(value: unknown, context: ExcelCoverageContext): string {
  const entry = object(value, "Excel function");
  const name = string(entry.name, "Excel function name");
  const url = string(entry.url, `${name} URL`);
  if (!/^[A-Z][A-Z0-9.]*$/u.test(name) || context.seen.has(name)) {
    throw new Error(`Invalid or duplicate Excel function: ${name}`);
  }
  if (!url.startsWith("https://support.microsoft.com/")) {
    throw new Error(`Excel function ${name} must link to Microsoft Support`);
  }
  context.seen.add(name);

  const formula = context.byName.get(name);
  if (formula === undefined) {
    context.summary.missing++;
    const exclusion = context.exclusions.get(name);
    const note =
      exclusion === undefined
        ? `Not registered in either engine.${trackingIssue(entry.issue, name)}`
        : `Unsupported by design: ${exclusion}`;
    return `| [\`${name}\`](${url}) | Not supported | Not supported | ${cell(note)} |`;
  }

  const dialect = context.dialects[formula.dialects];
  if (dialect === undefined) throw new Error(`${name} has unknown dialect ${formula.dialects}`);
  const { partial, notes } = excelDifference(formula, dialect);
  const status = partial ? "Partly supported" : "Supported";
  const isFull = formula.builds.includes("@sheetwrite/formulas");
  const isLite = formula.builds.includes("@sheetwrite/wasm");
  if (!isFull) throw new Error(`${name} is registered without full-engine support`);
  context.summary[partial ? "partial" : "supported"]++;

  const referenceLink = `${FORMULA_FUNCTIONS_ROUTE}${anchor(formula.family)}/`;
  const alias = name === formula.canonical ? "" : `Alias of \`${formula.canonical}\`. `;
  const availability = isLite ? "" : "Lite engine: not registered. ";
  const detail = notes.length > 0 ? `${notes.join(" ")} ` : "";
  return `| [\`${name}\`](${url}) | ${status} | ${isLite ? status : "Not supported"} | ${cell(`${alias}${availability}${detail}[Reference](${referenceLink})`)} |`;
}

function renderExcelCoverageFamilies(
  families: readonly unknown[],
  context: ExcelCoverageContext,
): string[] {
  return families.flatMap((value, index) => {
    const family = object(value, `Excel catalog families[${index}]`);
    const title = string(family.title, `Excel catalog families[${index}].title`);
    if (!Array.isArray(family.functions)) throw new Error(`${title} functions must be an array`);

    return [
      `## ${title}`,
      "",
      "| Excel function | Full engine | Lite engine | Notes and differences |",
      "| --- | --- | --- | --- |",
      ...family.functions.map((entry) => renderExcelCoverageRow(entry, context)),
      "",
    ];
  });
}

function unsupportedExamples(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) throw new Error("unsupportedCategories must be an array");

  return new Map(
    value.flatMap((entry, index) => {
      const category = object(entry, `unsupportedCategories[${index}]`);
      const scope = string(category.scope, `unsupportedCategories[${index}].scope`);
      return stringArray(category.examples, `unsupportedCategories[${index}].examples`).map(
        (name) => [name, scope] as const,
      );
    }),
  );
}

/**
 * Compare Microsoft's pinned names with the registry-checked contract.
 * The catalog has no availability flags that could drift from the engine.
 */
export function renderExcelCoveragePage(
  inventoryValue: unknown,
  catalogValue: unknown,
): FormulaReferencePage {
  const inventory = object(inventoryValue, "formula inventory");
  const functions = parseFunctions(inventory.functions);
  const catalog = object(catalogValue, "Excel catalog");
  if (!Array.isArray(catalog.families)) throw new Error("Excel catalog families must be an array");

  const context: ExcelCoverageContext = {
    byName: new Map(
      functions.flatMap((formula) =>
        [formula.canonical, ...formula.aliases].map((name) => [name, formula] as const),
      ),
    ),
    dialects: recordMap(inventory.dialectProfiles, "dialectProfiles"),
    exclusions: unsupportedExamples(inventory.unsupportedCategories),
    seen: new Set<string>(),
    summary: { supported: 0, partial: 0, missing: 0 },
  };
  const familyLines = renderExcelCoverageFamilies(catalog.families, context);
  const { seen, summary } = context;

  return {
    route: "reference/excel-function-coverage.md",
    content: [
      "---",
      'title: "Excel function coverage"',
      'description: "Every function in the pinned Microsoft Excel catalog, with full and lite engine availability and known differences."',
      "---",
      "",
      `This table covers **${seen.size} distinct Excel function names** from [Microsoft's category catalog](${string(catalog.source, "Excel catalog source")}), updated ${string(catalog.sourceUpdated, "Excel catalog sourceUpdated")} and retrieved ${string(catalog.retrievedOn, "Excel catalog retrievedOn")}. It includes compatibility names and add-in functions. It is a pinned catalog, not a claim to cover functions Microsoft adds after that date.`,
      "",
      `The full engine has **${summary.supported} supported**, **${summary.partial} partly supported**, and **${summary.missing} not supported** names in this catalog. Aliases count as separate Excel names. Functions outside the catalog remain in the [function contract](${FORMULA_FUNCTIONS_ROUTE}).`,
      "",
      "## How to read the table",
      "",
      "- **Full engine** is `@sheetwrite/formulas`. **Lite engine** is the default `@sheetwrite/wasm` package. Importing the full package alone does not select it; see [engine builds](/docs/reference/formula-functions/#engine-builds).",
      "- **Supported** means registered and implemented as its reference page describes. It does not mean complete Excel parity, array broadcasting for every scalar function, unlimited numerical precision, or reviewed external results.",
      "- **Partly supported** means implemented with a known Excel difference, marked as divergent in the formula contract. The row states the difference. Shared resource limits are documented in the [bounded evaluation contract](/docs/reference/formula-functions/#bounded-evaluation-contract).",
      "- **Not supported** means not registered in that engine; the call evaluates to `#NAME?`. A function that is only in the full engine is not a broken lite implementation. **Unsupported by design** marks a name that Sheetwrite leaves out on purpose; see [unsupported functions](/docs/reference/formula-functions/#unsupported-functions). Other missing names are open gaps.",
      "- Availability and aliases come from the formula contract, checked against the Rust parser registry and the full engine's analysis registries every time this page is generated or checked. The Microsoft catalog stores names, categories and source links only.",
      "- To refresh the baseline, update `scripts/excel-functions.json` from the linked Microsoft catalog. Keep one row per name, split compound names, omit the featured-function duplicates, and prefer a function's current category over its compatibility duplicate. Run `bun run docs:generate`, then `bun run docs:check`.",
      "- Reviewed external workbook results are separate from registry coverage; see [compatibility results](/docs/reference/compatibility-results/).",
      "",
      ...familyLines,
    ].join("\n"),
  };
}
