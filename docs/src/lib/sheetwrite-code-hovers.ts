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

interface ApiManifestShape {
  packages: readonly {
    name: string;
    entryPoints: readonly {
      subpath: string;
      classification: string;
      exports?: readonly {
        name: string;
        signature?: string;
        documentation?: string;
        memberDocs?: readonly { name: string; documentation: string }[];
      }[];
    }[];
  }[];
}

type ManifestPackage = ApiManifestShape["packages"][number];

function coreFirst(packages: ApiManifestShape["packages"]): ManifestPackage[] {
  return [...packages].sort((left, right) =>
    left.name === "@sheetwrite/core" ? -1 : right.name === "@sheetwrite/core" ? 1 : 0,
  );
}

function rootFirst(entryPoints: ManifestPackage["entryPoints"]) {
  return [...entryPoints].sort((left, right) =>
    left.subpath === "." ? -1 : right.subpath === "." ? 1 : 0,
  );
}

function entrySlug(packageName: string, subpath: string): string {
  const packageSlug = packageName.replace("@sheetwrite/", "");
  return subpath === "."
    ? packageSlug
    : `${packageSlug}-${subpath.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

interface MemberReference {
  docs: string;
  route: string;
}

function referenceAnchor(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Symbol name -> generated reference route, so every hover on a public API
 * symbol can link straight to its documentation page. Root entry points win
 * name collisions; `@sheetwrite/core` wins across packages.
 */
export function apiReferenceRoutes(manifest: ApiManifestShape): ReadonlyMap<string, string> {
  const routes = new Map<string, string>();
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of rootFirst(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      const slug = entrySlug(pkg.name, entry.subpath);
      for (const item of entry.exports ?? []) {
        if (!routes.has(item.name)) {
          routes.set(item.name, `/docs/api/${slug}/${referenceAnchor(item.name)}/`);
        }
      }
    }
  }
  return routes;
}

export interface SymbolPreview {
  signature: string;
  docs?: string;
}

/**
 * Symbol name -> declaration + docs for hover previews inside generated
 * fences, where the type engine has no imports to resolve against. Collision
 * policy mirrors `apiReferenceRoutes` so preview and link always agree.
 */
export function apiSymbolPreviews(manifest: ApiManifestShape): ReadonlyMap<string, SymbolPreview> {
  const previews = new Map<string, SymbolPreview>();
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of rootFirst(pkg.entryPoints)) {
      if (entry.classification !== "supported") continue;
      for (const item of entry.exports ?? []) {
        if (!item.signature || previews.has(item.name)) continue;
        previews.set(item.name, {
          signature: item.signature.replace(/^export\s+/, ""),
          docs: item.documentation || undefined,
        });
      }
    }
  }
  return previews;
}

/**
 * Member name -> owning documentation. Framework template hovers (`@ready`,
 * `onGridChange={…}`) resolve to synthetic bindings without JSDoc; the member
 * docs from the API manifest restore the depth and a deep link.
 */
export function apiMemberReferences(
  manifest: ApiManifestShape,
): ReadonlyMap<string, MemberReference> {
  const members = new Map<string, MemberReference>();
  for (const pkg of coreFirst(manifest.packages)) {
    for (const entry of pkg.entryPoints) {
      if (entry.classification !== "supported") continue;
      const slug = entrySlug(pkg.name, entry.subpath);
      for (const item of entry.exports ?? []) {
        for (const member of item.memberDocs ?? []) {
          if (!member.documentation || members.has(member.name)) continue;
          members.set(member.name, {
            docs: member.documentation,
            route: `/docs/api/${slug}/${referenceAnchor(item.name)}/#${referenceAnchor(item.name)}-${referenceAnchor(member.name)}`,
          });
        }
      }
    }
  }
  return members;
}

/** `grid-change` template events document as the adapter's `onGridChange` member. */
function memberLookupNames(target: string): string[] {
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

function memberDocsFor(
  target: string,
  signature: string,
  members: ReadonlyMap<string, MemberReference>,
): MemberReference | undefined {
  // The displayed binding (`let onReady: …`) names the semantic member; the
  // raw hover target (`ready`, `grid-change`) is only a fallback spelling.
  const declared = /^(?:let|const|var|function)\s+([A-Za-z_$][\w$]*)/.exec(signature)?.[1];
  const candidates = declared
    ? [declared, ...memberLookupNames(target)]
    : memberLookupNames(target);
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
  /** When set, the trigger itself is an anchor: hover previews, click navigates. */
  navigable?: boolean;
  /** The token is an exported Sheetwrite API name, not a local or a member. */
  isApiName?: boolean;
}

function nestedRendererConfig(config: ResolvedExpressiveCodeEngineConfig) {
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

function normalizeQuickInfo(raw: string): string {
  let signature = raw.replace(LEADING_KIND, "").replace(IMPORT_SUFFIX, "").trim();
  if (TYPE_MEMBER.test(signature)) signature = `type ${signature}`;
  if (FUNCTION_MEMBER.test(signature)) signature = `function ${signature}`;
  return signature;
}

/** Rewrites checker member paths into parseable TS so signatures render with syntax colors. */
function renderableSignature(signature: string): string {
  const member = signature.match(MEMBER_PATH);
  if (member) return `interface ${member[1]} { ${member[2]}${member[3]}: ${member[4]} }`;
  if (/^[a-z_$][\w$]*: /.test(signature)) return `let ${signature}`;
  return signature;
}

async function formatSignature(rawSignature: string, printWidth: number): Promise<string> {
  if (!rawSignature) return rawSignature;
  const signature = renderableSignature(rawSignature);

  const needsDeclaration = /^(const|let|var|function)\b/.test(signature);
  const source = needsDeclaration ? `declare ${signature.replace(/;?$/, ";")}` : signature;
  try {
    const formatted = await format(source, {
      parser: "typescript",
      printWidth,
      tabWidth: 2,
      semi: true,
      singleQuote: false,
      trailingComma: "all",
    });
    const withoutDeclaration = needsDeclaration
      ? formatted.replace(/^declare\s+/, "").replace(/;\s*$/, "")
      : formatted.trimEnd();
    return withoutDeclaration.trim();
  } catch {
    return signature;
  }
}

/**
 * Formats a bare type expression (e.g. one union variant) by round-tripping
 * it through a synthetic alias, so prettier can lay out long object types.
 */
export async function formatTypeExpression(type: string, printWidth = 78): Promise<string> {
  const formatted = await formatSignature(
    `type __Variant = ${type.replace(/;?\s*$/, "")};`,
    printWidth,
  );
  return formatted.replace(/^type __Variant =\s*/, "").replace(/;$/, "");
}

/** Pretty-prints a full declaration for the generated reference pages. */
export async function formatDeclaration(code: string, printWidth = 78): Promise<string> {
  return formatSignature(code, printWidth);
}

/** Truncates a formatted declaration for preview use, closing the brace. */
function capPreviewLines(formatted: string, maxLines: number): string {
  const lines = formatted.split("\n");
  if (lines.length <= maxLines) return formatted;
  const kept = lines.slice(0, maxLines - 1);
  const remaining = lines.length - kept.length;
  return [...kept, `  // … ${remaining} more lines — see the API reference`, "}"].join("\n");
}

/** Light-theme token colour -> syntax role; each role's colour is unique. */
let roleByColour: ReadonlyMap<string, CodeRole> | undefined;

function codeRoleOf(colour: string): CodeRole | undefined {
  if (roleByColour === undefined) {
    const tokens = themeTokens("light");
    roleByColour = new Map(
      CODE_ROLES.map((role) => [tokenColour(tokens, `--sw-code-${role}`), role]),
    );
  }
  return roleByColour.get(colour.toLowerCase());
}

const LIGHT_COLOUR = /--0:\s*(#[0-9a-fA-F]{3,8})/;

/**
 * Highlighted tokens as role classes (`sw-code-keyword`) instead of the
 * per-span `--0`/`--1` colour properties Expressive Code writes. A panel can
 * hold a few hundred token spans; custom properties on every one made the
 * browser build a separate style for each when the panel first opened.
 * Plain-text tokens lose their span altogether.
 */
function withRoleClasses(nodes: readonly ElementContent[]): ElementContent[] {
  const output: ElementContent[] = [];
  const pushText = (value: string): void => {
    const last = output.at(-1);
    if (last?.type === "text") last.value += value;
    else output.push({ type: "text", value });
  };
  for (const node of nodes) {
    if (node.type === "text") {
      pushText(node.value);
      continue;
    }
    if (node.type !== "element") continue;
    const colour = LIGHT_COLOUR.exec(String(node.properties.style ?? ""))?.[1];
    const children = withRoleClasses(node.children);
    if (colour === undefined) {
      output.push({ ...node, children });
      continue;
    }
    const role = codeRoleOf(colour);
    if (role === undefined) {
      for (const child of children) {
        if (child.type === "text") pushText(child.value);
        else output.push(child);
      }
      continue;
    }
    output.push(h(`span.sw-code-${role}`, children));
  }
  return output;
}

function codeLineContents(ast: Element): ElementContent[] {
  const lines = selectAll(".ec-line > .code", ast);
  const output: ElementContent[] = [];
  for (const [index, line] of lines.entries()) {
    // Block lines use a newline placeholder; flattened code has separators below.
    const placeholder =
      line.children.length === 1 &&
      line.children[0]?.type === "text" &&
      line.children[0].value === "\n";
    output.push(h("span.sw-code-popover__line", placeholder ? [] : withRoleClasses(line.children)));
    if (index < lines.length - 1) output.push({ type: "text", value: "\n" });
  }
  return output;
}

function cleanDocumentation(value: string): string {
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

function resolvedQuickInfo(hover: SheetwriteTypeHover, language: string): string {
  const signature = normalizeQuickInfo(hover.text);
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
  return hover.origin === "lib" || !LOW_QUALITY_HOVER.test(resolvedQuickInfo(hover, language));
}

async function svelteScriptDocumentation(
  source: string,
  analyzer: SheetwriteTypeEngine,
): Promise<ReadonlyMap<string, string>> {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (scripts.length === 0) return new Map();

  const documentation = new Map<string, string>();
  for (const node of await analyzer.analyze(scripts.join("\n"), "ts")) {
    if (node.type !== "hover" || !node.docs?.trim() || documentation.has(node.target)) continue;
    documentation.set(node.target, node.docs);
  }
  return documentation;
}

interface SvelteCode {
  code: string;
  map: string;
}

/** Sources waiting for the next codegen process; see `svelteCode`. */
let svelteQueue: { source: string; resolve(code: SvelteCode): void; reject(error: Error): void }[] =
  [];

/**
 * TypeScript for a Svelte sample, from svelte2tsx in a short-lived child process
 * (`svelte-codegen.mjs`). Samples requested in the same turn of the event loop share one
 * process, so a cold `docs:check` starts it once.
 */
function svelteCode(source: string): Promise<SvelteCode> {
  return new Promise((resolve, reject) => {
    svelteQueue.push({ source, resolve, reject });
    if (svelteQueue.length > 1) return;
    setTimeout(() => {
      const batch = svelteQueue;
      svelteQueue = [];
      const script = fileURLToPath(new URL("./svelte-codegen.mjs", import.meta.url));
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

async function svelteSourceHovers(
  source: string,
  analyzer: SheetwriteTypeEngine,
): Promise<SheetwriteTypeHover[]> {
  const transformed = await svelteCode(source);
  const sourceMap = new TraceMap(JSON.parse(transformed.map.toString()));
  const sourceLines = source.split("\n");
  const lineOffsets = lineStartOffsets(source);
  const mapsBack = (node: { line: number; character: number; target: string }) => {
    const original = originalPositionFor(sourceMap, {
      line: node.line + 1,
      column: node.character,
    });
    if (original.line === null || original.column === null) return undefined;
    const sourceLine = sourceLines[original.line - 1];
    const text = sourceLine?.slice(original.column, original.column + node.target.length);
    return text === node.target ? { line: original.line - 1, column: original.column } : undefined;
  };

  const [scriptDocumentation, result] = await Promise.all([
    svelteScriptDocumentation(source, analyzer),
    // Only generated identifiers that map back into the Svelte source can become hovers.
    analyzer.analyze(transformed.code, "tsx", {
      key: `svelte\0${source}`,
      keep: (identifier) => mapsBack({ ...identifier, target: identifier.text }) !== undefined,
    }),
  ]);
  const hovers: SheetwriteTypeHover[] = [];
  for (const node of result) {
    const original = mapsBack(node);
    if (!original) continue;
    const lineIndex = original.line;
    hovers.push({
      ...node,
      docs: node.docs?.trim() ? node.docs : scriptDocumentation.get(node.target),
      line: lineIndex,
      character: original.column,
      start: (lineOffsets[lineIndex] ?? 0) + original.column,
      length: node.target.length,
    });
  }
  return hovers;
}

async function mapSvelteHovers(
  source: string,
  analyzer: SheetwriteTypeEngine,
): Promise<SheetwriteTypeHover[]> {
  return analyzer.resolveFrameworkTypes(await svelteSourceHovers(source, analyzer), source);
}

/** Where an analyzed identifier sits in the page's code, or null inside the prelude. */
function originalPosition(
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

function remapThroughInjection(
  hovers: readonly SheetwriteTypeHover[],
  injection: PreludeInjection,
  originalSource: string,
): SheetwriteTypeHover[] {
  const lines = originalSource.split("\n");
  const remapped: SheetwriteTypeHover[] = [];
  for (const hover of hovers) {
    const position = originalPosition(hover, injection, lines);
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
    // Svelte hovers are kept by source, so a warm run never loads svelte2tsx.
    return analyzer.remember(`svelte\0${preludeName ?? ""}\0${code}`, async () => {
      if (preludeName === undefined) return mapSvelteHovers(code, analyzer);
      const injection = injectHoverPrelude(code, language, resolveHoverPrelude(preludeName));
      const mapped = remapThroughInjection(
        await svelteSourceHovers(injection.analysisSource, analyzer),
        injection,
        code,
      );
      return analyzer.resolveFrameworkTypes(mapped, code);
    });
  }
  if (preludeName === undefined) return analyzer.analyze(code, language);
  const injection = injectHoverPrelude(code, language, resolveHoverPrelude(preludeName));
  // Prelude identifiers never reach the page, so the engine does not ask about them.
  const lines = code.split("\n");
  const hovers = await analyzer.analyze(injection.analysisSource, language, {
    key: `prelude\0${preludeName}\0${code}`,
    keep: (identifier) =>
      originalPosition({ ...identifier, target: identifier.text }, injection, lines) !== null,
  });
  return remapThroughInjection(hovers, injection, code);
}

export function hoverPopoverId(
  codeBlock: Pick<ExpressiveCodeBlock, "code" | "language" | "meta" | "parentDocument">,
  hover: Pick<SheetwriteTypeHover, "character" | "length" | "line" | "target">,
  hoverIndex: number,
): string {
  const groupIndex = codeBlock.parentDocument?.positionInDocument?.groupIndex;
  const blockIdentity =
    groupIndex === undefined
      ? hashIdentifier(`${codeBlock.language}\0${codeBlock.meta}\0${codeBlock.code}`)
      : String(groupIndex);
  return `sheetwrite-code-popover-${blockIdentity}-${hoverIndex}-${hover.line}-${hover.character}-${hover.length}-${hashIdentifier(hover.target)}`;
}

/** Make external URLs and site paths clickable in tag text. */
function tagValueContents(value: string): ElementContent[] {
  const cleaned = cleanDocumentation(value);
  const contents: ElementContent[] = [];
  const urlPattern = /https?:\/\/[^\s"'<>)]+|\/(?:docs|showcases)\/[^\s"'<>)`]*/g;
  let cursor = 0;
  for (const match of cleaned.matchAll(urlPattern)) {
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

function tagLabel(name: string): Element {
  return h("span.sw-code-popover__tag-name", TAG_LABELS[name] ?? `@${name}`);
}

/**
 * A panel links to a symbol's examples instead of rendering them: a full
 * example is hundreds of highlighted spans, which made the first open of a
 * large panel one long style task. Symbol pages hold them under "Examples";
 * a member route already points at the member row that holds its own.
 */
function exampleHref(referenceRoute: string): string {
  return referenceRoute.includes("#") ? referenceRoute : `${referenceRoute}#examples`;
}

/** `@see` targets separated by commas, each linked when it names a page. */
function seeAlsoTargets(values: readonly string[], rendered: RenderedHover): ElementContent[] {
  return values.flatMap((value, index): ElementContent[] => [
    ...(index > 0 ? [{ type: "text" as const, value: ", " }] : []),
    ...(rendered.seeRoutes?.has(value)
      ? [
          h(
            "a.sw-code-popover__tag-link",
            { href: rendered.seeRoutes.get(value) },
            cleanDocumentation(value),
          ),
        ]
      : tagValueContents(value)),
  ]);
}

/** The panel's one link line: "See also Grid, GridOptions · Example". */
function linksLine(seeAlso: readonly string[], rendered: RenderedHover, hasExample: boolean) {
  const example =
    hasExample && rendered.referenceRoute !== undefined
      ? h("a.sw-code-popover__tag-link", { href: exampleHref(rendered.referenceRoute) }, "Example")
      : undefined;
  if (seeAlso.length === 0 && example === undefined) return undefined;
  const parts: ElementContent[] = [];
  if (seeAlso.length > 0) {
    parts.push(
      h("span.sw-code-popover__tag-name", "See also"),
      ...seeAlsoTargets(seeAlso, rendered),
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
function panelTags(rendered: RenderedHover): Element[] {
  const seeAlso: string[] = [];
  const tags: Element[] = [];
  let hasExample = false;
  for (const [name, value] of rendered.tags) {
    if (name === "see" && value) seeAlso.push(value);
    else if (name === "example") hasExample = true;
    else
      tags.push(h("span.sw-code-popover__tag", [tagLabel(name), ...tagValueContents(value ?? "")]));
  }
  const links = linksLine(seeAlso, rendered, hasExample);
  if (links !== undefined) tags.push(links);
  return tags;
}

/**
 * The hover panel: a visually hidden plain signature for screen readers,
 * the highlighted signature at two widths, the docs, the tags and the link to
 * the API reference. `dedupe-code-popovers.ts` moves it into the page's store.
 */
function popoverPanel(rendered: RenderedHover, popoverId: string): Element {
  const tags = panelTags(rendered);
  return h(
    "span.sw-code-popover__panel",
    {
      id: popoverId,
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
        rendered.wideSignature,
      ),
      h(
        "span.sw-code-popover__signature.sw-code-popover__signature--narrow",
        { ariaHidden: "true" },
        rendered.narrowSignature,
      ),
      rendered.docs ? h("span.sw-code-popover__docs", cleanDocumentation(rendered.docs)) : [],
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
    const { docs, navigable, referenceRoute } = this.rendered;
    const kind = docs ? "documented" : referenceRoute ? "reference" : "type";
    const isLink = navigable === true && referenceRoute !== undefined;
    return nodesToTransform.map((node) =>
      h("span.sw-code-popover", [
        h(
          isLink ? "a.sw-code-popover__trigger" : "span.sw-code-popover__trigger",
          {
            ...(isLink ? { href: referenceRoute } : {}),
            // One Tab stop per code block: `rovingCodeFocus` gives the block's
            // first trigger tabindex 0; arrow keys move between the others.
            tabIndex: -1,
            ariaDescribedBy: this.popoverId,
            dataSwCodePopoverTrigger: this.popoverId,
            dataHoverKind: kind,
            // An exported Sheetwrite API name: the only kind marked at rest.
            ...(this.rendered.isApiName === true ? { dataSwApi: "" } : {}),
          },
          [node],
        ),
        popoverPanel(this.rendered, this.popoverId),
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
  for (const [lineIndex, text] of code.split("\n").entries()) {
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = match[0];
      if (name === declared) continue;
      const route = routes.get(name);
      if (route === undefined) continue;
      const start = match.index;
      const before = start > 0 ? text[start - 1] : "";
      if (before === "." || before === '"' || before === "'") continue;
      links.push({
        line: lineIndex,
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
  const direct = routes.get(target);
  if (direct !== undefined) return direct;
  const referencedRoutes = new Set<string>();
  for (const match of signature.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const route = routes.get(match[0]);
    if (route !== undefined) referencedRoutes.add(route);
  }
  return referencedRoutes.size === 1 ? referencedRoutes.values().next().value : undefined;
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
  let signatureRenderer: ExpressiveCode | undefined;
  let referenceRoutes: ReadonlyMap<string, string> | undefined;
  let memberReferences: ReadonlyMap<string, MemberReference> | undefined;
  let symbolPreviews: ReadonlyMap<string, SymbolPreview> | undefined;
  const previewParts = new Map<
    string,
    { accessible: string; wide: ElementContent[]; narrow: ElementContent[] }
  >();

  const resolveManifest = async (): Promise<void> => {
    if (referenceRoutes && memberReferences && symbolPreviews) return;
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const manifestPath = join(options.cwd, "src/generated/public-api.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ApiManifestShape;
      referenceRoutes = apiReferenceRoutes(manifest);
      memberReferences = apiMemberReferences(manifest);
      symbolPreviews = apiSymbolPreviews(manifest);
    } catch {
      // Docs generation has not run yet; hovers simply render without links.
      referenceRoutes = new Map();
      memberReferences = new Map();
      symbolPreviews = new Map();
    }
  };

  return definePlugin({
    name: "sheetwrite-code-hovers",
    hooks: {
      async preprocessCode({ codeBlock, config }) {
        // Generated declaration fences carry no imports, so the type engine
        // cannot resolve their identifiers. The manifest can: each public
        // symbol gets a preview popover, and the token itself navigates.
        if (/\bgenerated\b/.test(codeBlock.meta)) {
          if (!GENERATED_LANGUAGES.has(codeBlock.language)) return;
          await resolveManifest();
          signatureRenderer ??= new ExpressiveCode(nestedRendererConfig(config));
          const previews = symbolPreviews ?? new Map<string, SymbolPreview>();
          for (const [linkIndex, link] of collectReferenceLinks(
            codeBlock.code,
            referenceRoutes ?? new Map<string, string>(),
          ).entries()) {
            const line = codeBlock.getLine(link.line);
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
            let parts = previewParts.get(name);
            if (parts === undefined) {
              const [wideSignature, narrowSignature] = await Promise.all([
                formatSignature(preview.signature, 68),
                formatSignature(preview.signature, 34),
              ]);
              // Whole-interface previews (Grid: ~50 members) would embed pages
              // of HTML at every mention; the popover is a preview, the page
              // behind the link is the reference.
              const [renderedWideSignature, renderedNarrowSignature] = await Promise.all([
                signatureRenderer.render({
                  code: capPreviewLines(wideSignature, 16),
                  language: "ts",
                  meta: "",
                }),
                signatureRenderer.render({
                  code: capPreviewLines(narrowSignature, 20),
                  language: "ts",
                  meta: "",
                }),
              ]);
              parts = {
                accessible: capPreviewLines(wideSignature, 16),
                wide: codeLineContents(renderedWideSignature.renderedGroupAst),
                narrow: codeLineContents(renderedNarrowSignature.renderedGroupAst),
              };
              previewParts.set(name, parts);
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
                  tags: [],
                  referenceRoute: link.route,
                  navigable: true,
                  isApiName: true,
                },
                hoverPopoverId(codeBlock, hover, linkIndex),
              ),
            );
          }
          return;
        }
        if (!SUPPORTED_LANGUAGES.has(codeBlock.language)) return;
        if (options.shouldTransform && !options.shouldTransform(codeBlock)) return;

        signatureRenderer ??= new ExpressiveCode(nestedRendererConfig(config));
        const hovers = (
          await collectFenceHovers(
            codeBlock.code,
            codeBlock.language as "ts" | "tsx" | "vue" | "svelte",
            analyzer,
            codeBlock.metaOptions.getString("prelude"),
          )
        ).filter((hover) => isHighQualityHover(hover, codeBlock.language));

        await resolveManifest();
        const routes = referenceRoutes ?? new Map<string, string>();
        const members = memberReferences ?? new Map<string, MemberReference>();
        for (const [hoverIndex, hover] of hovers.entries()) {
          const line = codeBlock.getLine(hover.line);
          if (!line) continue;
          const accessibleSignature = resolvedQuickInfo(hover, codeBlock.language);
          if (!accessibleSignature) continue;
          // Import aliases and self-restating declarations waste the reader's hover.
          if (/^import\s/.test(accessibleSignature)) continue;
          // DOM and standard-library names (`document`, `style.height`) are
          // never Sheetwrite APIs, even when a Sheetwrite member shares the name.
          const isLibrarySymbol = hover.origin === "lib";
          const memberReference = isLibrarySymbol
            ? undefined
            : memberDocsFor(hover.target, accessibleSignature, members);
          const hasDetails =
            Boolean(hover.docs ?? memberReference?.docs) || (hover.tags?.length ?? 0) > 0;
          if (!hasDetails) {
            const restated = accessibleSignature.replace(/[;,]\s*$/, "").replace(/\s+/g, " ");
            if (line.text.replace(/\s+/g, " ").includes(restated)) continue;
          }
          const referenceRoute = isLibrarySymbol
            ? undefined
            : (referenceRouteForHover(hover.target, accessibleSignature, routes) ??
              memberReference?.route);
          const [wideSignature, narrowSignature] = await Promise.all([
            formatSignature(accessibleSignature, 68),
            formatSignature(accessibleSignature, 34),
          ]);
          const [renderedWideSignature, renderedNarrowSignature] = await Promise.all([
            signatureRenderer.render({
              code: wideSignature,
              language: "ts",
              meta: "",
            }),
            signatureRenderer.render({
              code: narrowSignature,
              language: "ts",
              meta: "",
            }),
          ]);
          const seeRoutes = new Map<string, string>();
          for (const [name, value] of hover.tags ?? []) {
            if (name !== "see" || !value) continue;
            const label = cleanDocumentation(value);
            const route = referenceRouteForHover(label, label, routes);
            if (route) seeRoutes.set(value, route);
          }
          const popoverId = hoverPopoverId(codeBlock, hover, hoverIndex);
          line.addAnnotation(
            new SheetwriteHoverAnnotation(
              hover,
              {
                accessibleSignature,
                wideSignature: codeLineContents(renderedWideSignature.renderedGroupAst),
                narrowSignature: codeLineContents(renderedNarrowSignature.renderedGroupAst),
                docs: hover.docs ?? memberReference?.docs,
                tags: hover.tags ?? [],
                seeRoutes,
                referenceRoute,
                navigable: referenceRoute !== undefined,
                isApiName: !isLibrarySymbol && routes.has(hover.target),
              },
              popoverId,
            ),
          );
        }
      },
    },
  });
}
