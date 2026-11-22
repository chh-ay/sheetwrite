import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  type AnnotationRenderOptions,
  definePlugin,
  ExpressiveCodeAnnotation,
  type ExpressiveCodeBlock,
  type ResolvedExpressiveCodeEngineConfig,
} from "@expressive-code/core";
import { type Element, type ElementContent, h, selectAll } from "@expressive-code/core/hast";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { ExpressiveCode } from "expressive-code";
import { format } from "prettier";

import {
  apiMemberReferences,
  apiReferenceRoutes,
  type ApiManifestShape,
  apiSymbolPreviews,
  type MemberReference,
  type SymbolPreview,
} from "./api-reference-routes.js";
import { CODE_ROLES, type CodeRole } from "./code-roles.js";
import { themeTokens, tokenColour } from "./design-tokens.js";
import { hashIdentifier } from "./hash-identifier.js";
import {
  injectHoverPrelude,
  type PreludeInjection,
  resolveHoverPrelude,
} from "./hover-preludes.js";
import { SheetwriteTypeEngine, type SheetwriteTypeHover } from "./sheetwrite-type-engine.js";
import { lineStartOffsets } from "./source-offsets.js";

const SUPPORTED_LANGUAGES = new Set(["ts", "tsx", "vue", "svelte"]);
/** Generated API fences: whole declarations (`ts`) and single members (`ts-member`). */
const GENERATED_LANGUAGES = new Set(["ts", "ts-member"]);
const LOW_QUALITY_HOVER = /\bany\b|\/\*unresolved\*\//;
const LEADING_KIND = /^\(([\w-]+)\)\s+/gm;
const IMPORT_SUFFIX = /\nimport .*$/s;
const TYPE_MEMBER = /^[A-Z]\w*(<[^>]*>)?:/;
const FUNCTION_MEMBER = /^\w+\(/;
const MEMBER_PATH = /^([A-Z][\w$]*(?:<[^>]*>)?)\.([\w$]+)(\??): ([\s\S]+)$/;

export interface SheetwriteCodeHoverOptions {
  cwd: string;
  fsMap?: Map<string, string>;
  shouldTransform?: (codeBlock: ExpressiveCodeBlock) => boolean;
}

/** `grid-change` template events document as the adapter's `onGridChange` member. */
function member_lookup_names(target: string): string[] {
  const names = [target];
  if (/^[a-z][\w-]*$/.test(target)) {
    const camel = target
      .split("-")
      .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    names.push(`on${camel.charAt(0).toUpperCase()}${camel.slice(1)}`);
  }
  return names;
}

function member_docs_for(
  target: string,
  signature: string,
  members: ReadonlyMap<string, MemberReference>,
): MemberReference | undefined {
  // The displayed binding (`let onReady: …`) names the semantic member; the
  // raw hover target (`ready`, `grid-change`) is only a fallback spelling.
  const declared = /^(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)/.exec(signature)?.[1];
  const candidates = declared
    ? [declared, ...member_lookup_names(target)]
    : member_lookup_names(target);
  for (const name of candidates) {
    const member = members.get(name);
    if (member) return member;
  }
  return undefined;
}

interface RenderedHover {
  accessibleSignature: string;
  wideSignature: ElementContent[];
  narrowSignature: ElementContent[];
  docs?: string;
  tags: readonly [name: string, text: string | undefined][];
  seeRoutes?: ReadonlyMap<string, string>;
  referenceRoute?: string;
  /**
   * The page or member row that holds the hovered symbol's own examples;
   * unset when the reference link is only the page of the symbol's type.
   */
  exampleRoute?: string;
  /** When set, the trigger itself is an anchor: hover previews, click navigates. */
  navigable?: boolean;
  /** The token is an exported Sheetwrite API name, not a local or a member. */
  isApiName?: boolean;
  /**
   * The Sheetwrite symbol the token names (`createGrid`, `setPivot`); the
   * showcase code aside highlights the lines that use it.
   */
  symbol?: string;
}

function nested_renderer_config(config: ResolvedExpressiveCodeEngineConfig) {
  return {
    cascadeLayer: config.cascadeLayer,
    customizeTheme: config.customizeTheme,
    defaultLocale: config.defaultLocale,
    defaultProps: config.defaultProps,
    logger: config.logger,
    minSyntaxHighlightingColorContrast: config.minSyntaxHighlightingColorContrast,
    styleOverrides: config.styleOverrides,
    themeCssRoot: config.themeCssRoot,
    themeCssSelector: config.themeCssSelector,
    themes: config.themes,
    useDarkModeMediaQuery: config.useDarkModeMediaQuery,
    useStyleReset: config.useStyleReset,
    useThemedScrollbars: config.useThemedScrollbars,
    useThemedSelectionColors: config.useThemedSelectionColors,
    frames: {
      showCopyToClipboardButton: false,
      extractFileNameFromCode: false,
    },
  };
}

function normalize_quick_info(raw: string): string {
  let signature = raw.replace(LEADING_KIND, "").replace(IMPORT_SUFFIX, "").trim();
  if (TYPE_MEMBER.test(signature)) signature = `type ${signature}`;
  if (FUNCTION_MEMBER.test(signature)) signature = `function ${signature}`;
  return signature;
}

/** Rewrites checker member paths into parseable TS so signatures render with syntax colors. */
function renderable_signature(signature: string): string {
  const member = signature.match(MEMBER_PATH);
  if (member) return `interface ${member[1]} { ${member[2]}${member[3]}: ${member[4]} }`;
  if (/^[a-z_$][\w$]*: /.test(signature)) return `let ${signature}`;
  return signature;
}

async function format_signature(raw_signature: string, print_width: number): Promise<string> {
  if (!raw_signature) return raw_signature;
  const signature = renderable_signature(raw_signature);

  const needs_declaration = /^(const|let|var|function)\b/.test(signature);
  const source = needs_declaration ? `declare ${signature.replace(/;?$/, ";")}` : signature;
  try {
    const formatted = await format(source, {
      parser: "typescript",
      printWidth: print_width,
      tabWidth: 2,
      semi: true,
      singleQuote: false,
      trailingComma: "all",
    });
    const without_declaration = needs_declaration
      ? formatted.replace(/^declare\s+/, "").replace(/;\s*$/, "")
      : formatted.trimEnd();
    return without_declaration.trim();
  } catch {
    return signature;
  }
}

/**
 * Formats a bare type expression (e.g. one union variant) by round-tripping
 * it through a synthetic alias, so prettier can lay out long object types.
 */
export async function formatTypeExpression(type: string, printWidth = 78): Promise<string> {
  const formatted = await format_signature(
    `type __Variant = ${type.replace(/;?\s*$/, "")};`,
    printWidth,
  );
  return formatted.replace(/^type __Variant =\s*/, "").replace(/;$/, "");
}

/** Pretty-prints a full declaration for the generated reference pages. */
export async function formatDeclaration(code: string, printWidth = 78): Promise<string> {
  return format_signature(code, printWidth);
}

/** Truncates a formatted declaration for preview use, closing the brace. */
function cap_preview_lines(formatted: string, max_lines: number): string {
  const lines = formatted.split("\n");
  if (lines.length <= max_lines) return formatted;
  const kept = lines.slice(0, max_lines - 1);
  const remaining = lines.length - kept.length;
  return [...kept, `  // … ${remaining} more lines — see the API reference`, "}"].join("\n");
}

/** Light-theme token colour -> syntax role; each role's colour is unique. */
let role_by_colour: ReadonlyMap<string, CodeRole> | undefined;

function code_role_of(colour: string): CodeRole | undefined {
  if (role_by_colour === undefined) {
    const tokens = themeTokens("light");
    role_by_colour = new Map(
      CODE_ROLES.map((role) => [tokenColour(tokens, `--sw-code-${role}`), role]),
    );
  }
  return role_by_colour.get(colour.toLowerCase());
}

const LIGHT_COLOUR = /--0:\s*(#[0-9a-fA-F]{3,8})/;

/**
 * Highlighted tokens as role classes (`sw-code-keyword`) instead of the
 * per-span `--0`/`--1` colour properties Expressive Code writes. A panel can
 * hold a few hundred token spans; custom properties on every one made the
 * browser build a separate style for each when the panel first opened.
 * Plain-text tokens lose their span altogether.
 */
function with_role_classes(nodes: readonly ElementContent[]): ElementContent[] {
  const output: ElementContent[] = [];
  const push_text = (value: string): void => {
    const last = output.at(-1);
    if (last?.type === "text") last.value += value;
    else output.push({ type: "text", value });
  };
  for (const node of nodes) {
    if (node.type === "text") {
      push_text(node.value);
      continue;
    }
    if (node.type !== "element") continue;
    const colour = LIGHT_COLOUR.exec(String(node.properties.style ?? ""))?.[1];
    const children = with_role_classes(node.children);
    if (colour === undefined) {
      output.push({ ...node, children });
      continue;
    }
    const role = code_role_of(colour);
    if (role === undefined) {
      for (const child of children) {
        if (child.type === "text") push_text(child.value);
        else output.push(child);
      }
      continue;
    }
    output.push(h(`span.sw-code-${role}`, children));
  }
  return output;
}

function code_line_contents(ast: Element): ElementContent[] {
  const lines = selectAll(".ec-line > .code", ast);
  const output: ElementContent[] = [];
  for (const [index, line] of lines.entries()) {
    // Block lines use a newline placeholder; flattened code has separators below.
    const placeholder =
      line.children.length === 1 &&
      line.children[0]?.type === "text" &&
      line.children[0].value === "\n";
    output.push(
      h("span.sw-code-popover__line", placeholder ? [] : with_role_classes(line.children)),
    );
    if (index < lines.length - 1) output.push({ type: "text", value: "\n" });
  }
  return output;
}

function clean_documentation(value: string): string {
  return (
    value
      // Unwrap fenced examples before inline-code cleanup so no stray fences survive.
      .replace(/```[\w-]*\s*([\s\S]*?)```/g, "$1")
      .replace(/\{@link\s+([^}|\s]+)(?:\s*\|\s*([^}]+))?\}/g, (_, target: string, label?: string) =>
        (label ?? target).trim(),
      )
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function resolved_quick_info(hover: SheetwriteTypeHover, language: string): string {
  const signature = normalize_quick_info(hover.text);
  if (
    language === "vue" &&
    hover.target === "Sheetwrite" &&
    signature.includes("DefineComponent<")
  ) {
    return "const Sheetwrite: DefineComponent";
  }
  return signature;
}
export function isHighQualityHover(hover: SheetwriteTypeHover, language = "ts"): boolean {
  return hover.origin === "lib" || !LOW_QUALITY_HOVER.test(resolved_quick_info(hover, language));
}

/**
 * Docs for `names` from the sample's script blocks analyzed on their own: hovers in the
 * svelte2tsx output lose the JSDoc of some script declarations. Only `names` are asked.
 */
async function svelte_script_documentation(
  source: string,
  analyzer: SheetwriteTypeEngine,
  names: ReadonlySet<string>,
): Promise<ReadonlyMap<string, string>> {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (scripts.length === 0 || names.size === 0) return new Map();

  const documentation = new Map<string, string>();
  const hovers = await analyzer.analyze(scripts.join("\n"), "ts", {
    key: `svelte-docs\0${[...names].sort().join("\0")}`,
    keep: (identifier) => names.has(identifier.text),
  });
  for (const node of hovers) {
    if (node.type !== "hover" || !node.docs?.trim() || documentation.has(node.target)) continue;
    documentation.set(node.target, node.docs);
  }
  return documentation;
}

interface SvelteCode {
  code: string;
  map: string;
}

/** Sources waiting for the next codegen process; see `svelte_code`. */
let svelte_queue: {
  source: string;
  resolve(code: SvelteCode): void;
  reject(error: Error): void;
}[] = [];

/**
 * TypeScript for a Svelte sample, from svelte2tsx in a short-lived child process
 * (`docs/svelte-codegen/svelte-codegen.mjs`). Samples requested in the same turn of the event loop share one
 * process, so a cold `docs:check` starts it once.
 */
function svelte_code(source: string): Promise<SvelteCode> {
  return new Promise((resolve, reject) => {
    svelte_queue.push({ source, resolve, reject });
    if (svelte_queue.length > 1) return;
    setTimeout(() => {
      const batch = svelte_queue;
      svelte_queue = [];
      const script = fileURLToPath(
        new URL("../../svelte-codegen/svelte-codegen.mjs", import.meta.url),
      );
      const child = spawn(process.execPath, [script], { stdio: ["pipe", "pipe", "inherit"] });
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
      child.on("error", (error) => {
        for (const item of batch) item.reject(error);
      });
      child.on("close", (code) => {
        if (code !== 0) {
          const failure = new Error(`Svelte codegen exited with code ${code}`);
          for (const item of batch) item.reject(failure);
          return;
        }
        const results = JSON.parse(output) as ({ error: string } | SvelteCode)[];
        for (const [index, item] of batch.entries()) {
          const result = results[index];
          if (!result) item.reject(new Error("Svelte codegen returned no result"));
          else if ("error" in result) item.reject(new Error(result.error));
          else item.resolve(result);
        }
      });
      child.stdin.end(JSON.stringify(batch.map((item) => item.source)));
    }, 0);
  });
}

async function svelte_source_hovers(
  source: string,
  analyzer: SheetwriteTypeEngine,
): Promise<SheetwriteTypeHover[]> {
  const transformed = await svelte_code(source);
  const source_map = new TraceMap(JSON.parse(transformed.map.toString()));
  const source_lines = source.split("\n");
  const line_offsets = lineStartOffsets(source);
  const maps_back = (node: { line: number; character: number; target: string }) => {
    const original = originalPositionFor(source_map, {
      line: node.line + 1,
      column: node.character,
    });
    if (original.line === null || original.column === null) return undefined;
    const source_line = source_lines[original.line - 1];
    const text = source_line?.slice(original.column, original.column + node.target.length);
    return text === node.target ? { line: original.line - 1, column: original.column } : undefined;
  };

  // Only generated identifiers that map back into the Svelte source can become hovers.
  const result = await analyzer.analyze(transformed.code, "tsx", {
    key: `svelte\0${source}`,
    keep: (identifier) => maps_back({ ...identifier, target: identifier.text }) !== undefined,
  });
  const undocumented = new Set(
    result
      .filter((node) => !node.docs?.trim() && maps_back(node) !== undefined)
      .map((node) => node.target),
  );
  const script_documentation = await svelte_script_documentation(source, analyzer, undocumented);
  const hovers: SheetwriteTypeHover[] = [];
  for (const node of result) {
    const original = maps_back(node);
    if (!original) continue;
    const line_index = original.line;
    hovers.push({
      ...node,
      docs: node.docs?.trim() ? node.docs : script_documentation.get(node.target),
      line: line_index,
      character: original.column,
      start: (line_offsets[line_index] ?? 0) + original.column,
      length: node.target.length,
    });
  }
  return hovers;
}

async function map_svelte_hovers(
  source: string,
  analyzer: SheetwriteTypeEngine,
): Promise<SheetwriteTypeHover[]> {
  return analyzer.resolveFrameworkTypes(await svelte_source_hovers(source, analyzer), source);
}

/** Where an analyzed identifier sits in the page's code, or null inside the prelude. */
function original_position(
  identifier: { line: number; character: number; target: string },
  injection: PreludeInjection,
  lines: readonly string[],
): { line: number; character: number; start: number } | null {
  const position = injection.toOriginal({
    line: identifier.line,
    character: identifier.character,
  });
  if (position === null) return null;
  const line = lines[position.line];
  const end = position.character + identifier.target.length;
  return line?.slice(position.character, end) === identifier.target ? position : null;
}

function remap_through_injection(
  hovers: readonly SheetwriteTypeHover[],
  injection: PreludeInjection,
  original_source: string,
): SheetwriteTypeHover[] {
  const lines = original_source.split("\n");
  const remapped: SheetwriteTypeHover[] = [];
  for (const hover of hovers) {
    const position = original_position(hover, injection, lines);
    if (position === null) continue;
    remapped.push({
      ...hover,
      line: position.line,
      character: position.character,
      start: position.start,
    });
  }
  return remapped;
}

/** Samples requested together are analyzed together: await many calls at once. */
export async function collectFenceHovers(
  code: string,
  language: "ts" | "tsx" | "vue" | "svelte",
  analyzer: SheetwriteTypeEngine,
  preludeName?: string,
): Promise<SheetwriteTypeHover[]> {
  if (language === "svelte") {
    if (preludeName === undefined) return map_svelte_hovers(code, analyzer);
    const injection = injectHoverPrelude(code, language, resolveHoverPrelude(preludeName));
    const mapped = remap_through_injection(
      await svelte_source_hovers(injection.analysisSource, analyzer),
      injection,
      code,
    );
    return analyzer.resolveFrameworkTypes(mapped, code);
  }
  if (preludeName === undefined) return analyzer.analyze(code, language);
  const injection = injectHoverPrelude(code, language, resolveHoverPrelude(preludeName));
  // Prelude identifiers never reach the page, so the engine does not ask about them.
  const lines = code.split("\n");
  const hovers = await analyzer.analyze(injection.analysisSource, language, {
    key: `prelude\0${preludeName}\0${code}`,
    keep: (identifier) =>
      original_position({ ...identifier, target: identifier.text }, injection, lines) !== null,
  });
  return remap_through_injection(hovers, injection, code);
}

export function hoverPopoverId(
  codeBlock: Pick<ExpressiveCodeBlock, "code" | "language" | "meta" | "parentDocument">,
  hover: Pick<SheetwriteTypeHover, "character" | "length" | "line" | "target">,
  hoverIndex: number,
): string {
  const group_index = codeBlock.parentDocument?.positionInDocument?.groupIndex;
  const block_identity =
    group_index === undefined
      ? hashIdentifier(`${codeBlock.language}\0${codeBlock.meta}\0${codeBlock.code}`)
      : String(group_index);
  return `sheetwrite-code-popover-${block_identity}-${hoverIndex}-${hover.line}-${hover.character}-${hover.length}-${hashIdentifier(hover.target)}`;
}

/** Make external URLs and site paths clickable in tag text. */
function tag_value_contents(value: string): ElementContent[] {
  const cleaned = clean_documentation(value);
  const contents: ElementContent[] = [];
  const url_pattern = /https?:\/\/[^\s"'<>)]+|\/(?:docs|showcases)\/[^\s"'<>)`]*/g;
  let cursor = 0;
  for (const match of cleaned.matchAll(url_pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) contents.push({ type: "text", value: cleaned.slice(cursor, start) });
    contents.push(
      h(
        "a.sw-code-popover__tag-link",
        {
          href: match[0],
          ...(match[0].startsWith("http") ? { rel: "noreferrer", target: "_blank" } : {}),
        },
        match[0].startsWith("http")
          ? match[0].replace(/^https?:\/\//, "").replace(/\/$/, "")
          : match[0],
      ),
    );
    cursor = start + match[0].length;
  }
  if (cursor < cleaned.length) contents.push({ type: "text", value: cleaned.slice(cursor) });
  return contents;
}

/** Reader-facing names of JSDoc tags; others show as `@name`. */
const TAG_LABELS: Readonly<Record<string, string>> = {
  defaultValue: "Default",
  deprecated: "Deprecated",
  param: "Parameter",
  remarks: "Remarks",
  returns: "Returns",
  throws: "Throws",
};

function tag_label(name: string): Element {
  return h("span.sw-code-popover__tag-name", TAG_LABELS[name] ?? `@${name}`);
}

/**
 * A panel links to a symbol's examples instead of rendering them: a full
 * example is hundreds of highlighted spans, which made the first open of a
 * large panel one long style task. Symbol pages hold them under "Examples";
 * a member route already points at the member row that holds its own.
 */
function example_href(example_route: string): string {
  return example_route.includes("#") ? example_route : `${example_route}#examples`;
}

/** `@see` targets separated by commas, each linked when it names a page. */
function see_also_targets(values: readonly string[], rendered: RenderedHover): ElementContent[] {
  return values.flatMap((value, index): ElementContent[] => [
    ...(index > 0 ? [{ type: "text" as const, value: ", " }] : []),
    ...(rendered.seeRoutes?.has(value)
      ? [
          h(
            "a.sw-code-popover__tag-link",
            { href: rendered.seeRoutes.get(value) },
            clean_documentation(value),
          ),
        ]
      : tag_value_contents(value)),
  ]);
}

/** The panel's one link line: "See also Grid, GridOptions · Example". */
function links_line(see_also: readonly string[], rendered: RenderedHover, has_example: boolean) {
  const example =
    has_example && rendered.exampleRoute !== undefined
      ? h("a.sw-code-popover__tag-link", { href: example_href(rendered.exampleRoute) }, "Example")
      : undefined;
  if (see_also.length === 0 && example === undefined) return undefined;
  const parts: ElementContent[] = [];
  if (see_also.length > 0) {
    parts.push(
      h("span.sw-code-popover__tag-name", "See also"),
      ...see_also_targets(see_also, rendered),
    );
  }
  if (example !== undefined) {
    if (parts.length > 0)
      parts.push(h("span.sw-code-popover__separator", { ariaHidden: "true" }, "·"));
    parts.push(example);
  }
  return h("span.sw-code-popover__tag.sw-code-popover__links", parts);
}

/** Other tags in source order, then the link line. */
function panel_tags(rendered: RenderedHover): Element[] {
  const see_also: string[] = [];
  const tags: Element[] = [];
  let has_example = false;
  for (const [name, value] of rendered.tags) {
    if (name === "see" && value) see_also.push(value);
    else if (name === "example") has_example = true;
    else
      tags.push(
        h("span.sw-code-popover__tag", [tag_label(name), ...tag_value_contents(value ?? "")]),
      );
  }
  const links = links_line(see_also, rendered, has_example);
  if (links !== undefined) tags.push(links);
  return tags;
}

/**
 * The hover panel: a visually hidden plain signature for screen readers,
 * the highlighted signature at two widths, the docs, the tags and the link to
 * the API reference. `dedupe-code-popovers.ts` moves it into the page's store.
 */
function popover_panel(rendered: RenderedHover, popover_id: string): Element {
  const tags = panel_tags(rendered);
  return h(
    "span.sw-code-popover__panel",
    {
      id: popover_id,
      role: "tooltip",
      dataSwCodePopoverPanel: "",
      // Popover text is preview chrome; indexing it lets giant embedded
      // declarations (e.g. Grid) hijack search rankings on every page.
      dataPagefindIgnore: "",
    },
    [
      h("span.sw-code-popover__accessible-signature", rendered.accessibleSignature),
      h(
        "span.sw-code-popover__signature.sw-code-popover__signature--wide",
        { ariaHidden: "true" },
        h("span.sw-code-popover__signature-text", rendered.wideSignature),
      ),
      h(
        "span.sw-code-popover__signature.sw-code-popover__signature--narrow",
        { ariaHidden: "true" },
        h("span.sw-code-popover__signature-text", rendered.narrowSignature),
      ),
      rendered.docs ? h("span.sw-code-popover__docs", clean_documentation(rendered.docs)) : [],
      tags.length > 0 ? h("span.sw-code-popover__tags", tags) : [],
      rendered.referenceRoute
        ? h("a.sw-code-popover__link", { href: rendered.referenceRoute }, "API reference")
        : [],
    ],
  );
}

class SheetwriteHoverAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "sheetwrite-code-hover";

  constructor(
    hover: SheetwriteTypeHover,
    private readonly rendered: RenderedHover,
    private readonly popoverId: string,
  ) {
    super({
      inlineRange: {
        columnStart: hover.character,
        columnEnd: hover.character + hover.length,
      },
    });
  }

  override render({ nodesToTransform }: AnnotationRenderOptions): Element[] {
    const { docs, navigable, referenceRoute: reference_route } = this.rendered;
    const kind = docs ? "documented" : reference_route ? "reference" : "type";
    const is_link = navigable === true && reference_route !== undefined;
    return nodesToTransform.map((node) =>
      h("span.sw-code-popover", [
        h(
          is_link ? "a.sw-code-popover__trigger" : "span.sw-code-popover__trigger",
          {
            ...(is_link ? { href: reference_route } : {}),
            // One Tab stop per code block: `rovingCodeFocus` gives the block's
            // first trigger tabindex 0; arrow keys move between the others.
            tabIndex: -1,
            ariaDescribedBy: this.popoverId,
            dataSwCodePopoverTrigger: this.popoverId,
            dataHoverKind: kind,
            // An exported Sheetwrite API name: the only kind marked at rest.
            ...(this.rendered.isApiName === true ? { dataSwApi: "" } : {}),
            ...(this.rendered.symbol === undefined ? {} : { dataSwSymbol: this.rendered.symbol }),
          },
          [node],
        ),
        popover_panel(this.rendered, this.popoverId),
      ]),
    );
  }
}

export interface ReferenceLink {
  line: number;
  columnStart: number;
  columnEnd: number;
  route: string;
}

const DECLARED_NAME =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|enum|function|const|let|var|type)\s+([A-Za-z_$][\w$]*)/;

/**
 * Deterministic identifier -> API-route links for generated declaration
 * fences. Generated signatures carry no imports, so the type engine cannot
 * resolve their identifiers; the manifest name map can. The declared symbol
 * itself is skipped (a page linking to itself is noise), as are member
 * accesses and string-opening positions.
 */
export function collectReferenceLinks(
  code: string,
  routes: ReadonlyMap<string, string>,
): ReferenceLink[] {
  if (routes.size === 0) return [];
  const declared = code.match(DECLARED_NAME)?.[1];
  const links: ReferenceLink[] = [];
  for (const [line_index, text] of code.split("\n").entries()) {
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = match[0];
      if (name === declared) continue;
      const route = routes.get(name);
      if (route === undefined) continue;
      const start = match.index;
      const before = start > 0 ? text[start - 1] : "";
      if (before === "." || before === '"' || before === "'") continue;
      links.push({
        line: line_index,
        columnStart: start,
        columnEnd: start + name.length,
        route,
      });
    }
  }
  return links;
}

export function referenceRouteForHover(
  target: string,
  signature: string,
  routes: ReadonlyMap<string, string>,
): string | undefined {
  return routes.get(target) ?? type_route_of(signature, routes, target);
}

/**
 * The page of the one Sheetwrite symbol a signature names besides the hovered
 * name itself (`let error: SheetwriteError` links SheetwriteError); none when
 * it names several or none.
 */
function type_route_of(
  signature: string,
  routes: ReadonlyMap<string, string>,
  hovered_name: string,
): string | undefined {
  const referenced_routes = new Set<string>();
  for (const match of signature.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (match[0] === hovered_name) continue;
    const route = routes.get(match[0]);
    if (route !== undefined) referenced_routes.add(route);
  }
  return referenced_routes.size === 1 ? referenced_routes.values().next().value : undefined;
}

class SheetwriteReferenceLinkAnnotation extends ExpressiveCodeAnnotation {
  override readonly name = "sheetwrite-code-ref";

  constructor(
    private readonly route: string,
    columnStart: number,
    columnEnd: number,
  ) {
    super({ inlineRange: { columnStart, columnEnd } });
  }

  override render({ nodesToTransform }: AnnotationRenderOptions): Element[] {
    return nodesToTransform.map((node) => h("a.sw-code-ref", { href: this.route }, [node]));
  }
}

export function sheetwriteCodeHovers(options: SheetwriteCodeHoverOptions) {
  const analyzer = new SheetwriteTypeEngine({
    cwd: options.cwd,
    fsMap: options.fsMap,
  });
  let signature_renderer: ExpressiveCode | undefined;
  let reference_routes: ReadonlyMap<string, string> | undefined;
  let member_references: ReadonlyMap<string, MemberReference> | undefined;
  let symbol_previews: ReadonlyMap<string, SymbolPreview> | undefined;
  const preview_parts = new Map<
    string,
    { accessible: string; wide: ElementContent[]; narrow: ElementContent[] }
  >();

  // The build compiles every generated API page at once, and each asks for
  // the manifest before the first read ends. One shared read keeps one copy
  // of the file in memory instead of one per page.
  let manifest_read: Promise<void> | undefined;
  const resolve_manifest = (): Promise<void> =>
    (manifest_read ??= (async () => {
      try {
        const { readFile: read_file } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const manifest_path = join(options.cwd, "src/generated/public-api.json");
        const manifest = JSON.parse(await read_file(manifest_path, "utf8")) as ApiManifestShape;
        reference_routes = apiReferenceRoutes(manifest);
        member_references = apiMemberReferences(manifest);
        symbol_previews = apiSymbolPreviews(manifest);
      } catch {
        // Docs generation has not run yet; hovers simply render without links.
        reference_routes = new Map();
        member_references = new Map();
        symbol_previews = new Map();
      }
    })());

  return definePlugin({
    name: "sheetwrite-code-hovers",
    hooks: {
      async preprocessCode({ codeBlock: code_block, config }) {
        // Generated declaration fences carry no imports, so the type engine
        // cannot resolve their identifiers. The manifest can: each public
        // symbol gets a preview popover, and the token itself navigates.
        if (/\bgenerated\b/.test(code_block.meta)) {
          if (!GENERATED_LANGUAGES.has(code_block.language)) return;
          await resolve_manifest();
          signature_renderer ??= new ExpressiveCode(nested_renderer_config(config));
          const previews = symbol_previews ?? new Map<string, SymbolPreview>();
          for (const [link_index, link] of collectReferenceLinks(
            code_block.code,
            reference_routes ?? new Map<string, string>(),
          ).entries()) {
            const line = code_block.getLine(link.line);
            if (!line) continue;
            const name = line.text.slice(link.columnStart, link.columnEnd);
            const preview = previews.get(name);
            if (preview === undefined) {
              line.addAnnotation(
                new SheetwriteReferenceLinkAnnotation(link.route, link.columnStart, link.columnEnd),
              );
              continue;
            }
            // Symbols repeat across hundreds of generated pages; render each
            // preview once and clone the hast per use (trees must not share nodes).
            let parts = preview_parts.get(name);
            if (parts === undefined) {
              const [wide_signature, narrow_signature] = await Promise.all([
                format_signature(preview.signature, 68),
                format_signature(preview.signature, 34),
              ]);
              // Whole-interface previews (Grid: ~50 members) would embed pages
              // of HTML at every mention; the popover is a preview, the page
              // behind the link is the reference.
              const [rendered_wide_signature, rendered_narrow_signature] = await Promise.all([
                signature_renderer.render({
                  code: cap_preview_lines(wide_signature, 16),
                  language: "ts",
                  meta: "",
                }),
                signature_renderer.render({
                  code: cap_preview_lines(narrow_signature, 20),
                  language: "ts",
                  meta: "",
                }),
              ]);
              parts = {
                accessible: cap_preview_lines(wide_signature, 16),
                wide: code_line_contents(rendered_wide_signature.renderedGroupAst),
                narrow: code_line_contents(rendered_narrow_signature.renderedGroupAst),
              };
              preview_parts.set(name, parts);
            }
            const hover: SheetwriteTypeHover = {
              type: "hover",
              target: name,
              text: preview.signature,
              start: link.columnStart,
              line: link.line,
              character: link.columnStart,
              length: link.columnEnd - link.columnStart,
              origin: "workspace",
            };
            line.addAnnotation(
              new SheetwriteHoverAnnotation(
                hover,
                {
                  accessibleSignature: parts.accessible,
                  wideSignature: structuredClone(parts.wide),
                  narrowSignature: structuredClone(parts.narrow),
                  docs: preview.docs,
                  tags: preview.tags,
                  referenceRoute: link.route,
                  exampleRoute: link.route,
                  navigable: true,
                  isApiName: true,
                },
                hoverPopoverId(code_block, hover, link_index),
              ),
            );
          }
          return;
        }
        if (!SUPPORTED_LANGUAGES.has(code_block.language)) return;
        if (options.shouldTransform && !options.shouldTransform(code_block)) return;

        signature_renderer ??= new ExpressiveCode(nested_renderer_config(config));
        const hovers = (
          await collectFenceHovers(
            code_block.code,
            code_block.language as "ts" | "tsx" | "vue" | "svelte",
            analyzer,
            code_block.metaOptions.getString("prelude"),
          )
        ).filter((hover) => isHighQualityHover(hover, code_block.language));

        await resolve_manifest();
        const routes = reference_routes ?? new Map<string, string>();
        const members = member_references ?? new Map<string, MemberReference>();
        for (const [hover_index, hover] of hovers.entries()) {
          const line = code_block.getLine(hover.line);
          if (!line) continue;
          const accessible_signature = resolved_quick_info(hover, code_block.language);
          if (!accessible_signature) continue;
          // Import aliases and self-restating declarations waste the reader's hover.
          if (/^import\s/.test(accessible_signature)) continue;
          // DOM and standard-library names (`document`, `style.height`) are
          // never Sheetwrite APIs, even when a Sheetwrite member shares the name.
          const is_library_symbol = hover.origin === "lib";
          // A name the sample declares (`const list = …`) is the sample's own:
          // no Sheetwrite symbol is looked up by its name, though its type
          // still links to the type's page.
          const is_sample_symbol = hover.origin === "snippet";
          const member_reference =
            is_library_symbol || is_sample_symbol
              ? undefined
              : member_docs_for(hover.target, accessible_signature, members);
          // Without its own docs the hover shows the manifest member's summary and tags.
          const docs_from_member = hover.docs === undefined ? member_reference : undefined;
          const tags = docs_from_member?.tags ?? hover.tags ?? [];
          const has_details = Boolean(hover.docs ?? docs_from_member?.docs) || tags.length > 0;
          if (!has_details) {
            const restated = accessible_signature.replace(/[;,]\s*$/, "").replace(/\s+/g, " ");
            if (line.text.replace(/\s+/g, " ").includes(restated)) continue;
          }
          // The symbol's own page or member row, which holds its examples;
          // else the page of the one Sheetwrite type its signature names.
          const own_route =
            is_library_symbol || is_sample_symbol
              ? undefined
              : (routes.get(hover.target) ?? member_reference?.route);
          const reference_route = is_library_symbol
            ? undefined
            : (own_route ?? type_route_of(accessible_signature, routes, hover.target));
          const [wide_signature, narrow_signature] = await Promise.all([
            format_signature(accessible_signature, 68),
            format_signature(accessible_signature, 34),
          ]);
          const [rendered_wide_signature, rendered_narrow_signature] = await Promise.all([
            signature_renderer.render({
              code: wide_signature,
              language: "ts",
              meta: "",
            }),
            signature_renderer.render({
              code: narrow_signature,
              language: "ts",
              meta: "",
            }),
          ]);
          const see_routes = new Map<string, string>();
          for (const [name, value] of tags) {
            if (name !== "see" || !value) continue;
            const label = clean_documentation(value);
            const route = referenceRouteForHover(label, label, routes);
            if (route) see_routes.set(value, route);
          }
          const popover_id = hoverPopoverId(code_block, hover, hover_index);
          line.addAnnotation(
            new SheetwriteHoverAnnotation(
              hover,
              {
                accessibleSignature: accessible_signature,
                wideSignature: code_line_contents(rendered_wide_signature.renderedGroupAst),
                narrowSignature: code_line_contents(rendered_narrow_signature.renderedGroupAst),
                docs: hover.docs ?? docs_from_member?.docs,
                tags,
                seeRoutes: see_routes,
                referenceRoute: reference_route,
                exampleRoute: own_route,
                navigable: reference_route !== undefined,
                isApiName: !is_library_symbol && routes.has(hover.target),
                symbol: is_library_symbol ? undefined : hover.target,
              },
              popover_id,
            ),
          );
        }
      },
    },
  });
}
