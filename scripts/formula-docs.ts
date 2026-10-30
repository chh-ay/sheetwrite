import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function anchor(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/(^-|-$)/gu, "");
}

function sourceLink(path: string): string {
  return `[\`${path}\`](https://github.com/chh-ay/sheetwrite/blob/main/${path})`;
}

function valueText(value: unknown): string {
  if (value === null) return "none";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function keyValues(value: unknown, label: string): string {
  return Object.entries(object(value, label))
    .map(([key, entry]) => {
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        return `${key}: ${keyValues(entry, `${label}.${key}`)}`;
      }
      return `${key}: ${valueText(entry)}`;
    })
    .join("<br />");
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

/** Built-in metadata shares the formula contract's signatures and engine coverage. */
export function renderFunctionMetadata(inventoryValue: unknown): string {
  const inventory = object(inventoryValue, "formula inventory");
  const signatures = parseSignatureProfiles(inventory.signatureProfiles);
  const families = recordMap(inventory.families, "families");
  // The inventory has no volatility field, so this list mirrors the engine's
  // volatile functions in `ast_is_volatile` (packages/wasm/src/types.rs).
  const volatileNames: Readonly<Record<string, boolean>> = {
    TODAY: true,
    NOW: true,
    RAND: true,
    RANDBETWEEN: true,
    OFFSET: true,
    INDIRECT: true,
  };
  const metadata = parseFunctions(inventory.functions).flatMap((formula) => {
    const signature = signatures[formula.signature];
    const family = families[formula.family];
    if (!signature || !family) throw new Error(`Missing metadata for ${formula.canonical}`);

    return [formula.canonical, ...formula.aliases].map((name) => ({
      name,
      description: `${formula.canonical}: ${string(family.title, "family title")} function.`,
      arguments: signature.arguments.map((argument) => ({
        name: argument.name,
        types: argument.accepts,
        optional: !argument.required,
        repeating: argument.repeat !== "once",
      })),
      returnKind: signature.returns,
      volatile: volatileNames[formula.canonical] === true,
      builds: formula.builds,
    }));
  });

  return [
    "// Generated by `bun run docs:generate` from the formula contract inventory.",
    'import type { BuiltInFormulaFunctionMetadata } from "../types/formula.js";',
    "",
    `export const BUILT_IN_FUNCTION_METADATA: readonly BuiltInFormulaFunctionMetadata[] = ${JSON.stringify(metadata, null, 2)};`,
    "",
  ].join("\n");
}

function statusPaths(value: unknown, label: string): string {
  const profile = object(value, label);
  const status = string(profile.status, `${label}.status`);
  const paths = stringArray(profile.paths, `${label}.paths`);
  return paths.length === 0
    ? status
    : `${status}<br />${paths.map((path) => sourceLink(path)).join("<br />")}`;
}

export async function loadFormulaContractInventory(
  root: string,
  path = DEFAULT_INVENTORY_PATH,
): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

/** One generated formula reference page, relative to the docs content root. */
export interface FormulaReferencePage {
  readonly route: string;
  readonly content: string;
}

const FORMULA_FUNCTIONS_ROUTE = "/docs/reference/formula-functions/";

/**
 * The formula function reference: an overview with the engine, limits and
 * unsupported categories, and one page per function family. A family page
 * carries only the contract profiles its own functions use.
 */
export function renderFormulaFunctionPages(inventoryValue: unknown): FormulaReferencePage[] {
  const inventory = object(inventoryValue, "formula inventory");
  const contract = string(inventory.contract, "contract");
  if (contract !== "sheetwrite.formula-capabilities") {
    throw new Error(`unexpected formula contract: ${contract}`);
  }
  if (typeof inventory.version !== "number")
    throw new Error("formula inventory version must be numeric");

  const sources = recordMap(inventory.sources, "sources");
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
  const incumbent = functions.filter(
    (formula) =>
      formula.contractStatus === "supported" && formula.builds.includes("@sheetwrite/wasm"),
  );
  const extension = functions.filter((formula) => !formula.builds.includes("@sheetwrite/wasm"));
  if (required.length !== REQUIRED_SUPPORTED_COUNT) {
    throw new Error(
      `formula documentation requires ${REQUIRED_SUPPORTED_COUNT} required-supported functions; found ${required.length}`,
    );
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
    const sourceId = string(family.source, `families.${familyId}.source`);
    const source = sources[sourceId];
    if (!source) throw new Error(`families.${familyId} has unknown source ${sourceId}`);
    return [
      {
        id: familyId,
        title: string(family.title, `families.${familyId}.title`),
        section: string(family.section, `families.${familyId}.section`),
        sourceUrl: string(source.link, `sources.${sourceId}.link`),
        functions: familyFunctions,
      },
    ];
  });
  const familyRoute = (id: string): string => `${FORMULA_FUNCTIONS_ROUTE}${anchor(id)}/`;

  const overview = [
    "---",
    'title: "Formula function contract"',
    'description: "Generated, source-linked formula names, signatures, semantics, dialect status, and unsupported boundaries."',
    "---",
    "",
    `This page is generated from the checked version ${inventory.version} \`${contract}\` inventory. It publishes **${required.length} required-supported target functions**, **${incumbent.length} incumbent functions**, and **${extension.length} optional analysis functions** (${functions.length} canonical functions total) without maintaining a second name list. Aliases share their canonical function's build availability.`,
    "",
    "A function's presence means only the signature and semantic profiles linked in its row. Microsoft Excel documentation supplies the naming/family taxonomy; it is not a blanket Excel claim. Google Sheets and OpenFormula behavior is unverified unless a dialect profile says otherwise.",
    "",
    "## Functions by family",
    "",
    "Each family has its own page with the engine build and the contract profiles of every function.",
    "",
    "| Family | Functions | Full engine only | Names |",
    "| --- | ---: | ---: | --- |",
    ...publishedFamilies.map((family) => {
      const fullOnly = family.functions.filter(
        (formula) => !formula.builds.includes("@sheetwrite/wasm"),
      ).length;
      const names = family.functions.map((formula) => `\`${formula.canonical}\``).join(", ");
      return `| [${cell(family.title)}](${familyRoute(family.id)}) | ${family.functions.length} | ${fullOnly} | ${names} |`;
    }),
    "",
    "## Engine builds",
    "",
    "- `@sheetwrite/wasm` is the default engine. The Engine column shows `Default + full` for a function in both engines and `Full only` for a function in `@sheetwrite/formulas` only.",
    '- `@sheetwrite/formulas` is the full engine. It adds the analysis families marked on the family pages: distributions and statistics, regression, finance, dates, text and regex, database, math and matrices, reshaping, LAMBDA helpers, and grouping. Select it before creating any stores: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`.',
    "- The active engine's registered names drive formula assist. Optional names are not suggested by the default engine and evaluate to `#NAME?` there; merely importing the optional package does not enable them.",
    "- Numeric functions use binary64 arithmetic with function-specific domains and bounded numerical algorithms. The inventory does not claim unlimited tail accuracy or complete Excel/Google Sheets/OpenFormula parity.",
    "",
    "## Bounded evaluation contract",
    "",
    "- Parsing and dependency evaluation are each capped at 256 recursive levels. Range and matrix work is capped at 1,000,000 cells, 1,048,576 rows, 16,384 columns, and 64 MiB of value/intermediate storage; excess work returns an explicit formula error rather than truncating.",
    "- One dynamic-array recompute pass is capped at 2,000,000 cell operations. Spill installation is atomic and collision-checked; see [Dynamic arrays and spills](/docs/features/formulas/dynamic-arrays-and-spills/) for admission rules.",
    "- `LET` permits at most 126 bindings and 16,384 expanded AST nodes. Bindings are lexical, shadow outer bindings, and are expanded lazily, so unused reads, errors, and volatility do not become dependencies.",
    "- Generated text is capped at 16 MiB and bounded searches at 4,000,000 steps. Text case conversion and parsing are Unicode-aware and host-locale independent; `NUMBERVALUE` defaults to `.` decimal and `,` grouping separators unless supplied explicitly.",
    "- `IRR` and `RATE` use deterministic root solving: 14 bracket steps, at most 100 solve steps, fixed `1e-12` convergence tolerances, and a finite search domain. Non-convergence or an invalid domain returns `#NUM!`.",
    "",
    "No formula throughput or latency number is published here. The [formula engine performance](/docs/performance/formula-engine/) page has the measured results, and the [benchmark protocol](/docs/performance/benchmark-protocol/) shows how to capture and validate them; limits above are implementation ceilings, not benchmark results.",
    "",
    "## Unsupported categories",
    "",
    "Unknown functions retain their source and evaluate to `#NAME?`; Sheetwrite does not silently execute a network, custom-code, or compatibility fallback.",
    "",
    "| Category | Scope | Examples | Source | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...unsupported.map((category, index) => {
      const sourceId = string(category.source, `unsupportedCategories[${index}].source`);
      const source = sources[sourceId];
      if (!source)
        throw new Error(`unsupportedCategories[${index}] has unknown source ${sourceId}`);
      const evidence = object(category.evidence, `unsupportedCategories[${index}].evidence`);
      return `| **${cell(string(category.title, `unsupportedCategories[${index}].title`))}** (\`${string(category.id, `unsupportedCategories[${index}].id`)}\`) | ${cell(string(category.scope, `unsupportedCategories[${index}].scope`))} | ${stringArray(
        category.examples,
        `unsupportedCategories[${index}].examples`,
      )
        .map((name) => `\`${name}\``)
        .join(
          ", ",
        )} | [${cell(string(category.section, `unsupportedCategories[${index}].section`))}](${string(source.link, `sources.${sourceId}.link`)}) | ${stringArray(
        evidence.paths,
        `unsupportedCategories[${index}].evidence.paths`,
      )
        .map((path) => sourceLink(path))
        .join("<br />")} |`;
    }),
    "",
    "`RANDARRAY`, network/external-data functions, arbitrary external workbook links, and cube/OLAP functions are unsupported. `OFFSET`, `INDIRECT`, `RAND`, `RANDBETWEEN`, `TODAY` and `NOW` are volatile and recalculate after each edit. `OFFSET` and `INDIRECT` return references that can feed reference-taking functions or spill their values. `INDIRECT` reference text is not rewritten by fill, copy, or structural edits. Database functions and `LAMBDA` helpers require the full engine; `LET` is available in both engines.",
    "",
  ];

  const familyPages = publishedFamilies.map((family): FormulaReferencePage => {
    const used = (key: "signature" | "semantics" | "dialects" | "implementation"): string[] => [
      ...new Set(family.functions.map((formula) => formula[key])),
    ];
    const lines = [
      "---",
      `title: ${JSON.stringify(`${family.title} functions`)}`,
      `description: ${JSON.stringify(`Every ${family.title.toLowerCase()} formula function, its engine build, and its signature, semantic, dialect, and implementation profiles.`)}`,
      "---",
      "",
      `This page lists the ${family.functions.length} functions of the ${family.title.toLowerCase()} family. Taxonomy/source: [${family.section}](${family.sourceUrl}). The [formula function contract](${FORMULA_FUNCTIONS_ROUTE}) has every family, the engine builds, and the evaluation limits.`,
      "",
      "## Functions",
      "",
      "<FormulaReference>",
      "",
      '<section class="sw-formula-family">',
      "",
      '<table class="sw-formula-table"><thead><tr><th>Function (aliases)</th><th>Engine</th><th>Contract</th></tr></thead><tbody>',
      ...family.functions.map((formula) => {
        const names = [formula.canonical, ...formula.aliases];
        const aliases = formula.aliases.map((name) => `<code>${html(name)}</code>`).join(", ");
        const inDefaultEngine = formula.builds.includes("@sheetwrite/wasm");
        const contractLabel =
          formula.contractStatus === "required-supported"
            ? "required target"
            : inDefaultEngine
              ? "incumbent"
              : "optional analysis";
        // The default engine's names are a subset of the full engine's names.
        const engineLabel = inDefaultEngine ? "Default + full" : "Full only";
        const profiles = (
          [
            ["Signature", "signature", formula.signature],
            ["Semantics", "semantics", formula.semantics],
            ["Dialect", "dialect", formula.dialects],
            ["Implementation", "implementation", formula.implementation],
          ] as const
        )
          .map(
            ([label, prefix, id]) =>
              `<a href="#${prefix}-${anchor(id)}">${label}: <code>${html(id)}</code></a>`,
          )
          .join("<br />");
        return `<tr data-formula-name="${html(names.join(" "))}" data-engine="${inDefaultEngine ? "default" : "full"}"><td><code>${html(formula.canonical)}</code>${aliases ? `<small>${aliases}</small>` : ""}</td><td><span class="sw-formula-build" data-build="${inDefaultEngine ? "default" : "full"}">${engineLabel}</span></td><td><details><summary>${contractLabel}</summary>${profiles}</details></td></tr>`;
      }),
      "</tbody></table>",
      "",
      "</section>",
      "",
      "</FormulaReference>",
      "",
      "## Signature profiles",
      "",
      "Argument order, required/default state, accepted shapes, repetition, and return shape come directly from the inventory.",
      "",
    ];
    for (const id of used("signature")) {
      const signature = signatures[id];
      if (signature === undefined) continue;
      lines.push(
        `<details id="signature-${anchor(id)}"><summary>Signature: ${id}</summary>`,
        "",
        `Return shape: \`${signature.returns}\`.`,
        "",
        "| Argument | Required | Default | Accepts | Repetition |",
        "| --- | --- | --- | --- | --- |",
        ...(signature.arguments.length === 0
          ? ["| _none_ | — | — | — | — |"]
          : signature.arguments.map(
              (argument) =>
                `| \`${argument.name}\` | ${argument.required ? "yes" : "no"} | ${cell(valueText(argument.default))} | ${argument.accepts.map((value) => `\`${value}\``).join(", ")} | \`${argument.repeat}\` |`,
            )),
        "",
        "</details>",
        "",
      );
    }

    lines.push(
      "## Semantic profiles",
      "",
      "These values are normative for the listed Sheetwrite subset. `function-defined` and `contextual` are explicit limitations: consult the formula guides' function-specific sections rather than assuming another spreadsheet's edge behavior.",
      "",
    );
    for (const id of used("semantics")) {
      const profile = semantics[id];
      if (profile === undefined) continue;
      lines.push(
        `<details id="semantics-${anchor(id)}"><summary>Semantics: ${id}</summary>`,
        "",
        "| Dimension | Contract |",
        "| --- | --- |",
        ...Object.entries(profile).map(
          ([dimension, value]) =>
            `| ${dimension} | ${cell(keyValues(value, `semanticsProfiles.${id}.${dimension}`))} |`,
        ),
        "",
        "</details>",
        "",
      );
    }

    lines.push("## Dialect profiles", "");
    for (const id of used("dialects")) {
      const profile = dialects[id];
      if (profile === undefined) continue;
      lines.push(
        `<details id="dialect-${anchor(id)}"><summary>Dialect: ${id}</summary>`,
        "",
        "| Dialect | Status |",
        "| --- | --- |",
        `| Microsoft Excel | ${cell(valueText(profile.excel))} |`,
        `| Google Sheets | ${cell(valueText(profile.googleSheets))} |`,
        `| OpenFormula | ${cell(valueText(profile.openFormula))} |`,
        "",
        `Limitations: ${stringArray(profile.divergences, `dialectProfiles.${id}.divergences`).join(" ")}`,
        "",
        "</details>",
        "",
      );
    }

    lines.push("## Implementation profiles", "");
    for (const id of used("implementation")) {
      const profile = implementations[id];
      if (profile === undefined) continue;
      lines.push(
        `<details id="implementation-${anchor(id)}"><summary>Implementation: ${id}</summary>`,
        "",
        "| Layer | Status and source/evidence |",
        "| --- | --- |",
        `| Parser | ${statusPaths(profile.parser, `implementationProfiles.${id}.parser`)} |`,
        `| Evaluator | ${statusPaths(profile.evaluator, `implementationProfiles.${id}.evaluator`)} |`,
        `| Formula assist | ${statusPaths(profile.assist, `implementationProfiles.${id}.assist`)} |`,
        `| Evidence | ${statusPaths(profile.evidence, `implementationProfiles.${id}.evidence`)} |`,
        "",
        "</details>",
        "",
      );
    }
    return {
      route: `reference/formula-functions/${anchor(family.id)}.md`,
      content: `${lines.join("\n").trimEnd()}\n`,
    };
  });

  return [
    { route: "reference/formula-functions.md", content: `${overview.join("\n").trimEnd()}\n` },
    ...familyPages,
  ];
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
