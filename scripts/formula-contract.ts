import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "..");
const INVENTORY_PATH = "test/conformance/formula-contract.inventory.json";
const SCHEMA_PATH = "test/conformance/formula-contract.schema.json";
const ANALYSIS_PATH = "packages/wasm/src/eval/analysis";
const REQUIRED_TARGET_HASH = "3efef696839478b92b59a004537f9ede7fa803f9749042bb830b664086495e80";
const UNSUPPORTED_CATEGORY_HASH =
  "aeed224539d371f2678a516d91eb4fd400957baeaef0e2b9a50f700ab0ed9094";
const FORMULA_NAME = /^[A-Z][A-Z0-9.]*$/;
const _ID = /^[a-z][a-z0-9-]*$/;

export interface FormulaContractSummary {
  functions: number;
  requiredSupported: number;
  unsupportedCategories: number;
  parserSpellings: number;
  assistSpellings: number;
  formulasSpellings: number;
}

export interface FormulaContractValidation {
  issues: string[];
  summary: FormulaContractSummary;
}

type JsonObject = Record<string, unknown>;

function is_object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same_json(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schema_type_matches(value: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return is_object(value);
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

function resolve_json_pointer(root: JsonObject, reference: string): unknown {
  if (!reference.startsWith("#/")) throw new Error(`unsupported schema reference ${reference}`);
  let current: unknown = root;
  for (const raw_part of reference.slice(2).split("/")) {
    const part = raw_part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!is_object(current) || !(part in current)) {
      throw new Error(`unresolved schema reference ${reference}`);
    }
    current = current[part];
  }
  return current;
}

function validate_schema_node(
  value: unknown,
  node: unknown,
  root: JsonObject,
  path: string,
  issues: string[],
): void {
  if (!is_object(node)) {
    issues.push(`${path}: invalid schema node`);
    return;
  }
  if (typeof node.$ref === "string") {
    validate_schema_node(value, resolve_json_pointer(root, node.$ref), root, path, issues);
    return;
  }
  if ("const" in node && !same_json(value, node.const)) {
    issues.push(`${path}: expected constant ${JSON.stringify(node.const)}`);
  }
  if (Array.isArray(node.enum) && !node.enum.some((candidate) => same_json(candidate, value))) {
    issues.push(`${path}: value is outside the closed enum`);
  }
  const declared_types = Array.isArray(node.type)
    ? node.type.filter((entry): entry is string => typeof entry === "string")
    : typeof node.type === "string"
      ? [node.type]
      : [];
  if (
    declared_types.length > 0 &&
    !declared_types.some((type) => schema_type_matches(value, type))
  ) {
    issues.push(`${path}: expected ${declared_types.join(" or ")}`);
    return;
  }
  if (typeof value === "string") {
    if (typeof node.minLength === "number" && value.length < node.minLength) {
      issues.push(`${path}: string is shorter than ${node.minLength}`);
    }
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(value)) {
      issues.push(`${path}: string does not match ${node.pattern}`);
    }
    if (node.format === "uri") {
      try {
        new URL(value);
      } catch {
        issues.push(`${path}: expected an absolute URI`);
      }
    }
  }
  if (typeof value === "number" && typeof node.minimum === "number" && value < node.minimum) {
    issues.push(`${path}: number is below ${node.minimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) {
      issues.push(`${path}: expected at least ${node.minItems} items`);
    }
    if (node.uniqueItems === true) {
      const unique = new Set(value.map((entry) => JSON.stringify(entry)));
      if (unique.size !== value.length) issues.push(`${path}: duplicate array item`);
    }
    if (node.items !== undefined) {
      value.forEach((entry, index) => {
        validate_schema_node(entry, node.items, root, `${path}[${index}]`, issues);
      });
    }
  }
  if (!is_object(value)) return;
  const properties = is_object(node.properties) ? node.properties : {};
  if (Array.isArray(node.required)) {
    for (const key of node.required) {
      if (typeof key === "string" && !(key in value)) issues.push(`${path}.${key}: required field`);
    }
  }
  if (typeof node.minProperties === "number" && Object.keys(value).length < node.minProperties) {
    issues.push(`${path}: expected at least ${node.minProperties} properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key in properties) {
      validate_schema_node(child, properties[key], root, `${path}.${key}`, issues);
    } else if (node.additionalProperties === false) {
      issues.push(`${path}.${key}: unknown field`);
    } else if (is_object(node.additionalProperties)) {
      validate_schema_node(child, node.additionalProperties, root, `${path}.${key}`, issues);
    }
  }
}

export function validateAgainstFormulaSchema(value: unknown, schema: unknown): string[] {
  if (!is_object(schema)) return ["schema: expected object"];
  const issues: string[] = [];
  validate_schema_node(value, schema, schema, "contract", issues);
  return issues;
}

export function validateClosedSchema(schema: unknown): string[] {
  if (!is_object(schema)) return ["schema: expected object"];
  const issues: string[] = [];
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    issues.push("schema.$schema: expected JSON Schema 2020-12");
  }
  if (schema.$id !== "https://sheetwrite.dev/schemas/formula-contract-v1.json") {
    issues.push("schema.$id: unexpected contract schema identity");
  }
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        visit(child, `${path}[${index}]`);
      });
      return;
    }
    if (!is_object(value)) return;
    if (value.type === "object" && !("additionalProperties" in value)) {
      issues.push(`${path}: object schema is not closed`);
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(schema, "schema");
  return issues;
}

function names_hash(names: readonly string[]): string {
  return createHash("sha256")
    .update([...names].sort().join("\n"))
    .digest("hex");
}

function names_from_function(entry: JsonObject): string[] {
  const canonical = typeof entry.canonical === "string" ? [entry.canonical] : [];
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.filter((value): value is string => typeof value === "string")
    : [];
  return [...canonical, ...aliases];
}

function string_map(value: unknown): JsonObject {
  return is_object(value) ? value : {};
}

function object_property(object: JsonObject, key: unknown): JsonObject | undefined {
  if (typeof key !== "string") return undefined;
  const value = object[key];
  return is_object(value) ? value : undefined;
}

function sorted_difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter((entry) => !right.has(entry)).sort();
}

function compare_name_sets(
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
  label: string,
  issues: string[],
): void {
  const missing = sorted_difference(expected, actual);
  const extra = sorted_difference(actual, expected);
  if (missing.length > 0) issues.push(`${label}: missing ${missing.join(", ")}`);
  if (extra.length > 0) issues.push(`${label}: unexpected ${extra.join(", ")}`);
}

export function extractParserSpellings(source: string): string[] {
  const registry = source.match(
    /define_function_registry!\s*\{\s*canonical\s*\{([\s\S]*?)\n\s*\}\s*aliases\s*\{([\s\S]*?)\n\s*\}\s*\}/,
  );
  if (!registry?.[1] || registry[2] === undefined) {
    throw new Error("formula parser registry not found");
  }

  const spellings: string[] = [];
  const parse_block = (block: string, arm: RegExp, label: string): void => {
    let arm_count = 0;
    for (const line of block.split("\n")) {
      if (line.trim().length === 0) continue;
      const match = line.match(arm);
      if (!match?.[1]) throw new Error(`unrecognized formula parser ${label}: ${line.trim()}`);
      spellings.push(match[1]);
      arm_count += 1;
    }
    if (label === "canonical arm" && arm_count === 0) {
      throw new Error("formula parser registry has no canonical arms");
    }
  };

  parse_block(
    registry[1],
    /^\s*[A-Za-z][A-Za-z0-9_]*\s*=>\s*"([A-Z][A-Z0-9.]*)";\s*$/,
    "canonical arm",
  );
  parse_block(
    registry[2],
    /^\s*"([A-Z][A-Z0-9.]*)"\s*=>\s*[A-Za-z][A-Za-z0-9_]*;\s*$/,
    "alias arm",
  );
  return spellings;
}

/**
 * Canonical names of the functions that `calls_volatile` in the engine treats
 * as volatile. Reading the engine source keeps the published metadata in step
 * with what the engine recalculates, instead of a second hand-written list.
 */
export function extractVolatileFunctions(typesSource: string, calcSource: string): string[] {
  const arm = typesSource.match(
    /fn calls_volatile\(ast: &Ast\) -> bool \{\s*matches!\(\s*ast,\s*Ast::Func\(\s*([^)]*?),\s*\.\.,?\s*\)/,
  );
  const variants = arm?.[1]?.split("|").map((entry) => entry.trim().replace(/^Func::/, ""));
  if (!variants || variants.some((variant) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(variant))) {
    throw new Error("volatile function list not found in calls_volatile");
  }

  const canonical = new Map<string, string>();
  for (const match of calcSource.matchAll(
    /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=>\s*"([A-Z][A-Z0-9.]*)";\s*$/gm,
  )) {
    if (match[1] && match[2]) canonical.set(match[1], match[2]);
  }

  return variants.map((variant) => {
    const name = canonical.get(variant);
    if (name === undefined) throw new Error(`volatile function ${variant} has no canonical name`);
    return name;
  });
}

function validate_references_and_names(inventory: JsonObject, issues: string[]): void {
  const sources = string_map(inventory.sources);
  const families = string_map(inventory.families);
  const signatures = string_map(inventory.signatureProfiles);
  const semantics = string_map(inventory.semanticsProfiles);
  const dialects = string_map(inventory.dialectProfiles);
  const implementations = string_map(inventory.implementationProfiles);

  for (const [family_id, raw_family] of Object.entries(families)) {
    if (!is_object(raw_family)) continue;
    if (typeof raw_family.source !== "string" || !(raw_family.source in sources)) {
      issues.push(
        `contract.families.${family_id}.source: unknown source ${String(raw_family.source)}`,
      );
    }
  }

  const functions = Array.isArray(inventory.functions) ? inventory.functions.filter(is_object) : [];
  const canonical_names = new Set<string>();
  const parser_names = new Set<string>();
  const required_names: string[] = [];
  for (const [index, entry] of functions.entries()) {
    const path = `contract.functions[${index}]`;
    const canonical = entry.canonical;
    if (typeof canonical === "string") {
      if (canonical_names.has(canonical)) issues.push(`${path}.canonical: duplicate ${canonical}`);
      canonical_names.add(canonical);
      if (entry.contractStatus === "required-supported") required_names.push(canonical);
    }
    for (const spelling of names_from_function(entry)) {
      if (!FORMULA_NAME.test(spelling)) continue;
      if (parser_names.has(spelling)) issues.push(`${path}: duplicate parser spelling ${spelling}`);
      parser_names.add(spelling);
    }
    if (Array.isArray(entry.aliases) && entry.aliases.includes(canonical)) {
      issues.push(`${path}.aliases: canonical spelling cannot repeat as an alias`);
    }
    if (
      Array.isArray(entry.builds) &&
      entry.builds.includes("@sheetwrite/wasm") &&
      !entry.builds.includes("@sheetwrite/formulas")
    ) {
      issues.push(`${path}.builds: the full build must include every default function`);
    }
    const references: Array<[string, JsonObject]> = [
      ["family", families],
      ["signature", signatures],
      ["semantics", semantics],
      ["dialects", dialects],
      ["implementation", implementations],
    ];
    for (const [field, registry] of references) {
      const reference = entry[field];
      if (typeof reference !== "string" || !(reference in registry)) {
        issues.push(`${path}.${field}: unknown profile ${String(reference)}`);
      }
    }
    const implementation = object_property(implementations, entry.implementation);
    const parser = implementation ? object_property(implementation, "parser") : undefined;
    if (parser?.status !== "implemented") {
      issues.push(`${path}.implementation: parser spelling is not marked implemented`);
    }
  }

  if (names_hash(required_names) !== REQUIRED_TARGET_HASH) {
    issues.push(
      "contract.functions: required-supported target set differs from the expansion specification",
    );
  }
  const let_entry = functions.find((entry) => entry.canonical === "LET");
  if (let_entry?.contractStatus !== "required-supported") {
    issues.push("contract.functions: LET must remain required-supported");
  }

  const unsupported = Array.isArray(inventory.unsupportedCategories)
    ? inventory.unsupportedCategories.filter(is_object)
    : [];
  const unsupported_ids = unsupported
    .map((entry) => entry.id)
    .filter((value): value is string => typeof value === "string");
  if (new Set(unsupported_ids).size !== unsupported_ids.length) {
    issues.push("contract.unsupportedCategories: duplicate category id");
  }
  if (names_hash(unsupported_ids) !== UNSUPPORTED_CATEGORY_HASH) {
    issues.push("contract.unsupportedCategories: required unsupported category set differs");
  }
  for (const [index, category] of unsupported.entries()) {
    if (typeof category.source !== "string" || !(category.source in sources)) {
      issues.push(
        `contract.unsupportedCategories[${index}].source: unknown source ${String(category.source)}`,
      );
    }
    // An unsupported example must not also be a function that some build evaluates.
    for (const example of Array.isArray(category.examples) ? category.examples : []) {
      if (typeof example === "string" && parser_names.has(example)) {
        issues.push(
          `contract.unsupportedCategories[${index}].examples: ${example} is a supported function`,
        );
      }
    }
  }
}

/**
 * The names whose implementation profile marks formula help as implemented.
 * Formula help completes every built-in name of the active engine from the
 * generated function table, so this set must equal the names of every build.
 */
function assist_names(inventory: JsonObject, issues: string[]): Set<string> {
  const names = new Set<string>();
  const implementations = string_map(inventory.implementationProfiles);
  const functions = Array.isArray(inventory.functions) ? inventory.functions.filter(is_object) : [];
  for (const [index, entry] of functions.entries()) {
    const profile = object_property(implementations, entry.implementation);
    const assist = profile ? object_property(profile, "assist") : undefined;
    if (assist?.status === "implemented") {
      for (const spelling of names_from_function(entry)) names.add(spelling);
    } else if (assist?.status !== "missing" && assist?.status !== "declared") {
      issues.push(`contract.functions[${index}].implementation: invalid assist status`);
    }
  }
  return names;
}

function inventory_parser_names(inventory: JsonObject, build = "@sheetwrite/wasm"): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(inventory.functions)) return names;
  for (const entry of inventory.functions) {
    if (!is_object(entry)) continue;
    if (!Array.isArray(entry.builds) || !entry.builds.includes(build)) continue;
    for (const spelling of names_from_function(entry)) names.add(spelling);
  }
  return names;
}

async function validate_evidence_paths(
  root: string,
  inventory: JsonObject,
  issues: string[],
): Promise<void> {
  const paths = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!is_object(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "paths" && Array.isArray(child)) {
        for (const path of child) if (typeof path === "string") paths.add(path);
      } else if (key === "sourcePath" && typeof child === "string") {
        paths.add(child);
      } else {
        collect(child);
      }
    }
  };
  collect(inventory);
  await Promise.all(
    [...paths].map(async (path) => {
      if (path.startsWith("/") || path.split("/").includes("..")) {
        issues.push(`contract evidence path escapes repository: ${path}`);
        return;
      }
      try {
        await access(resolve(root, path));
      } catch {
        issues.push(`contract evidence path does not exist: ${path}`);
      }
    }),
  );
}

function validate_portable_formula_semantics(inventory: JsonObject, issues: string[]): void {
  const signatures = string_map(inventory.signatureProfiles);
  const number_value = is_object(signatures["number-value"])
    ? signatures["number-value"]
    : undefined;
  const number_arguments =
    number_value && Array.isArray(number_value.arguments)
      ? number_value.arguments.filter(is_object)
      : [];
  const decimal = number_arguments.find((argument) => argument.name === "decimalSeparator");
  const grouping = number_arguments.find((argument) => argument.name === "groupSeparator");
  if (decimal?.default !== ".") {
    issues.push(
      "contract.signatureProfiles.number-value.decimalSeparator: expected invariant default",
    );
  }
  if (grouping?.default !== ",") {
    issues.push(
      "contract.signatureProfiles.number-value.groupSeparator: expected invariant default",
    );
  }
  const semantics = string_map(inventory.semanticsProfiles);
  const date_time = is_object(semantics["date-time"]) ? semantics["date-time"] : undefined;
  const environment =
    date_time && is_object(date_time.environment) ? date_time.environment : undefined;
  if (environment?.locale !== "invariant") {
    issues.push("contract.semanticsProfiles.date-time.environment.locale: expected invariant");
  }
}

interface AnalysisSources {
  readonly registry: string;
  readonly families: ReadonlyMap<string, string>;
}

async function read_analysis_sources(root: string): Promise<AnalysisSources> {
  const directory = resolve(root, ANALYSIS_PATH);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".rs")).sort();
  const sources = await Promise.all(
    files.map(async (file) => [file, await readFile(resolve(directory, file), "utf8")] as const),
  );
  const families = new Map<string, string>();
  let registry = "";
  for (const [file, source] of sources) {
    if (file === "mod.rs") registry = source;
    else families.set(file.slice(0, -".rs".length), source);
  }
  return { registry, families };
}

/** Each `analysis/<family>.rs` must declare its functions once and be registered in `mod.rs`. */
function extract_analysis_spellings(sources: AnalysisSources, issues: string[]): string[] {
  const spellings: string[] = [];
  if (sources.families.size === 0) issues.push("analysis family registry not found");
  for (const [family, source] of sources.families) {
    const declared = new RegExp(`^(?:pub(?:\\([^)]*\\))?\\s+)?mod ${family};$`, "m").test(
      sources.registry,
    );
    if (!declared || !sources.registry.includes(`names: ${family}::NAMES,`)) {
      issues.push(`analysis family ${family} is not registered in ${ANALYSIS_PATH}/mod.rs`);
    }
    // `family_functions! { BESSELJ, CHISQ_DIST = "CHISQ.DIST", ... }`: a
    // variant spells its own name unless a dotted name follows `=`.
    const block = source.match(/^family_functions!\s*\{([\s\S]*?)^\}/m);
    const names = [
      ...(block?.[1] ?? "").matchAll(/^\s*([A-Z][A-Z0-9_]*)(?:\s*=\s*"([A-Z][A-Z0-9.]*)")?,/gm),
    ].flatMap(([, variant, dotted]) => dotted ?? variant ?? []);
    if (names.length === 0) issues.push(`analysis family ${family} has no family_functions table`);
    spellings.push(...names);
  }
  if (new Set(spellings).size !== spellings.length) {
    issues.push("analysis family registries contain duplicate spellings");
  }
  return spellings;
}

export function validateFormulaContractData(inventory: unknown, schema: unknown): string[] {
  const issues = [
    ...validateClosedSchema(schema),
    ...validateAgainstFormulaSchema(inventory, schema),
  ];
  if (is_object(inventory)) validate_references_and_names(inventory, issues);
  if (is_object(inventory)) validate_portable_formula_semantics(inventory, issues);
  return issues;
}

export async function validateFormulaContractRepository(
  root = REPOSITORY_ROOT,
  inventoryOverride?: unknown,
): Promise<FormulaContractValidation> {
  const [schema_source, inventory_source, parser_source, analysis_sources] = await Promise.all([
    readFile(resolve(root, SCHEMA_PATH), "utf8"),
    inventoryOverride === undefined ? readFile(resolve(root, INVENTORY_PATH), "utf8") : undefined,
    readFile(resolve(root, "packages/wasm/src/calc/functions.rs"), "utf8"),
    read_analysis_sources(root),
  ]);
  let schema: unknown;
  let inventory: unknown = inventoryOverride;
  const issues: string[] = [];
  try {
    schema = JSON.parse(schema_source);
  } catch (error) {
    return {
      issues: [`${SCHEMA_PATH}: invalid JSON: ${String(error)}`],
      summary: {
        functions: 0,
        requiredSupported: 0,
        unsupportedCategories: 0,
        parserSpellings: 0,
        assistSpellings: 0,
        formulasSpellings: 0,
      },
    };
  }
  if (inventoryOverride === undefined) {
    try {
      inventory = JSON.parse(inventory_source ?? "");
    } catch (error) {
      return {
        issues: [`${INVENTORY_PATH}: invalid JSON: ${String(error)}`],
        summary: {
          functions: 0,
          requiredSupported: 0,
          unsupportedCategories: 0,
          parserSpellings: 0,
          assistSpellings: 0,
          formulasSpellings: 0,
        },
      };
    }
  }
  issues.push(...validateFormulaContractData(inventory, schema));

  let parser_spellings: string[] = [];
  let assist_spellings = new Set<string>();
  try {
    parser_spellings = extractParserSpellings(parser_source);
  } catch (error) {
    issues.push(`parser drift extraction failed: ${String(error)}`);
  }
  if (new Set(parser_spellings).size !== parser_spellings.length) {
    issues.push("parser drift extraction found duplicate spellings");
  }
  const extension_spellings = extract_analysis_spellings(analysis_sources, issues);
  if (is_object(inventory)) {
    compare_name_sets(
      new Set(parser_spellings),
      inventory_parser_names(inventory),
      "parser/inventory drift",
      issues,
    );
    assist_spellings = assist_names(inventory, issues);
    compare_name_sets(
      assist_spellings,
      new Set([
        ...inventory_parser_names(inventory),
        ...inventory_parser_names(inventory, "@sheetwrite/formulas"),
      ]),
      "assist/inventory drift",
      issues,
    );
    compare_name_sets(
      new Set([...parser_spellings, ...extension_spellings]),
      inventory_parser_names(inventory, "@sheetwrite/formulas"),
      "formulas/inventory drift",
      issues,
    );
    await validate_evidence_paths(root, inventory, issues);
  }

  const functions =
    is_object(inventory) && Array.isArray(inventory.functions)
      ? inventory.functions.filter(is_object)
      : [];
  const unsupported =
    is_object(inventory) && Array.isArray(inventory.unsupportedCategories)
      ? inventory.unsupportedCategories.filter(is_object)
      : [];
  return {
    issues: [...new Set(issues)].sort(),
    summary: {
      functions: functions.length,
      requiredSupported: functions.filter((entry) => entry.contractStatus === "required-supported")
        .length,
      unsupportedCategories: unsupported.length,
      parserSpellings: new Set(parser_spellings).size,
      assistSpellings: assist_spellings.size,
      formulasSpellings: new Set([...parser_spellings, ...extension_spellings]).size,
    },
  };
}

if (import.meta.main) {
  const result = await validateFormulaContractRepository();
  if (result.issues.length > 0) {
    process.stderr.write(`${result.issues.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    const summary = result.summary;
    process.stdout.write(
      `formula contract valid: ${summary.functions} functions (${summary.requiredSupported} required-supported), ` +
        `${summary.unsupportedCategories} unsupported categories, ${summary.parserSpellings} parser spellings, ` +
        `${summary.assistSpellings} assist spellings\n`,
    );
  }
}
