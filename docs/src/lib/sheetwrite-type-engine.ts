import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CompilerOptionsResolver,
  createLanguage,
  createVueLanguagePlugin,
  defaultMapperFactory,
  FileMap,
} from "@vue/language-core";
import ts from "typescript";

import { NativeHoverClient } from "./native-hover-client.js";
import type {
  NativeCompiler,
  NativeHoverAnswer,
  NativeHoverDocument,
} from "./native-hover-worker.js";
import {
  nativeHoverProjections,
  type NativeQuickInfo,
  parseNativeHover,
} from "./native-quick-info.js";
import { lineStartOffsets as lineOffsets } from "./source-offsets.js";

/** Where a hovered symbol's definitions live; drives the docs hover-quality gate. */
export type SheetwriteHoverOrigin = "lib" | "workspace" | "snippet";

export interface SheetwriteTypeHover {
  type: "hover";
  text: string;
  docs?: string;
  tags?: readonly [name: string, text: string | undefined][];
  start: number;
  length: number;
  target: string;
  line: number;
  character: number;
  origin?: SheetwriteHoverOrigin;
}

export interface SheetwriteTypeEngineOptions {
  cwd: string;
  fsMap?: ReadonlyMap<string, string>;
}

/**
 * How Vue and Svelte samples become TypeScript: through the content mappers that the
 * hover tsconfig names, or by generating the TypeScript here (`@vue/language-core`,
 * svelte2tsx) and hovering the generated file.
 */
export type SheetwriteFrameworkRoute = "mappers" | "generated";

/** Svelte's content mapper is not on npm yet; it is built from sveltejs/language-tools. */
const SVELTE_MAPPER_VARIABLE = "SHEETWRITE_SVELTE_CONTENT_MAPPER";

function hoverCompiler(): NativeCompiler {
  const value = process.env.SHEETWRITE_HOVER_COMPILER ?? "tsgo";
  if (value !== "tsgo" && value !== "tsrs") {
    throw new Error(`SHEETWRITE_HOVER_COMPILER must be "tsgo" or "tsrs", not "${value}"`);
  }
  return value;
}

function frameworkRoute(compiler: NativeCompiler): SheetwriteFrameworkRoute {
  // tsrs does not run content mappers (`runExternalCode` does nothing there).
  const value =
    process.env.SHEETWRITE_HOVER_FRAMEWORKS ?? (compiler === "tsrs" ? "generated" : "mappers");
  if (value !== "mappers" && value !== "generated") {
    throw new Error(`SHEETWRITE_HOVER_FRAMEWORKS must be "mappers" or "generated", not "${value}"`);
  }
  if (value === "mappers" && compiler === "tsrs") {
    throw new Error("tsrs does not run content mappers; use SHEETWRITE_HOVER_FRAMEWORKS=generated");
  }
  return value;
}

const INTERNAL_IDENTIFIER = /^__/;
const UNRESOLVED_ANY = /\bany\b/;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

/** Compiler-generated scaffolding (Vue SFC virtual code, private helpers) is never reader-facing. */
const INTERNAL_TAG_TEXT = /__(?:VLS|vls)_?\w*|__sheetwrite/;

/** Vue minor version the Vue content mapper generates code for; docs use Vue 3.5. */
const VUE_TARGET_VERSION = 3.5;

function hoverOrigin(
  definitionFiles: readonly string[],
  virtualFileName: string,
): SheetwriteHoverOrigin | undefined {
  let origin: SheetwriteHoverOrigin | undefined;
  for (const definitionFile of definitionFiles) {
    const file = normalizedPath(definitionFile);
    if (file === virtualFileName) return "snippet";
    if (!file.includes("/node_modules/")) return "workspace";
    origin = "lib";
  }
  return origin;
}

/**
 * The first projection can belong to a helper call the content mapper generated around the
 * reader's name (`__VLS_unwrap(count)` for `{{ count }}`); the reader's own symbol wins.
 */
function readerQuickInfo(markdown: string): NativeQuickInfo | undefined {
  const projections = nativeHoverProjections(markdown).flatMap(
    (projection) => parseNativeHover(projection) ?? [],
  );
  return (
    projections.find((projection) => !INTERNAL_TAG_TEXT.test(projection.text)) ?? projections[0]
  );
}

/** Language-server answers in the engine's hover shape; positions without quick info drop out. */
function nativeHovers(answer: NativeHoverAnswer, fileName: string): SheetwriteTypeHover[] {
  const hovers: SheetwriteTypeHover[] = [];
  for (const [index, identifier] of answer.identifiers.entries()) {
    const markdown = answer.hovers[index];
    const quickInfo = markdown ? readerQuickInfo(markdown) : undefined;
    if (!quickInfo?.text) continue;
    const tags = quickInfo.tags.filter(([, value]) => !value || !INTERNAL_TAG_TEXT.test(value));
    const definitionFiles = (answer.definitions[index] ?? []).map((definition) =>
      fileURLToPath(definition),
    );
    const origin = hoverOrigin(definitionFiles, normalizedPath(fileName));
    hovers.push({
      type: "hover",
      text: quickInfo.text,
      ...(quickInfo.docs ? { docs: quickInfo.docs } : {}),
      ...(tags.length ? { tags } : {}),
      ...(origin ? { origin } : {}),
      start: identifier.start,
      length: identifier.end - identifier.start,
      target: identifier.text,
      line: identifier.line,
      character: identifier.character,
    });
  }
  return hovers;
}

function sourcePosition(
  offsets: readonly number[],
  offset: number,
): { line: number; character: number } {
  let low = 0;
  let high = offsets.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if ((offsets[middle] ?? 0) <= offset) low = middle;
    else high = middle;
  }
  return { line: low, character: offset - (offsets[low] ?? 0) };
}

function usefulType(text: string): boolean {
  return text.length > 0 && !UNRESOLVED_ANY.test(text);
}

function eventPropertyName(target: string): string {
  return `on${target
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

function typeAfterDeclaration(text: string): string | undefined {
  const separator = text.indexOf(":");
  if (separator < 0) return undefined;
  const value = text.slice(separator + 1).trim();
  return usefulType(value) ? value : undefined;
}

/**
 * Repository-owned quick-info engine. TypeScript remains the type system; this class owns
 * virtual files, identifier discovery, framework source mapping, and unresolved-type repair.
 */
export class SheetwriteTypeEngine {
  private readonly compilerOptions: ts.CompilerOptions;
  private readonly compiler = hoverCompiler();
  readonly frameworkRoute = frameworkRoute(this.compiler);
  /** TypeScript 7.1 or tsrs, created on the first sample. */
  private nativeServer: NativeHoverClient | undefined;
  private nativeOpenUri: string | undefined;

  constructor(private readonly options: SheetwriteTypeEngineOptions) {
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "react",
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      baseUrl: this.options.cwd,
      paths: {
        "@sheetwrite/core": ["../packages/core/src/index.ts"],
        // Subpaths whose `exports` target differs from the file name; the wildcard
        // below would resolve `history` to the internal undo module.
        "@sheetwrite/core/history": ["../packages/core/src/history-archive.ts"],
        "@sheetwrite/core/browser/history": ["../packages/core/src/history-indexeddb.ts"],
        "@sheetwrite/core/*": ["../packages/core/src/*"],
        "@sheetwrite/react": ["../packages/react/src/index.tsx"],
        "@sheetwrite/svelte": ["../packages/svelte/src/index.ts"],
        "@sheetwrite/vue": ["../packages/vue/src/index.ts"],
        "@sheetwrite/wasm": ["../packages/wasm/loader.mjs"],
        "@sheetwrite/xlsx": ["../packages/xlsx/src/index.ts"],
        "@sheetwrite/xlsx/*": ["../packages/xlsx/src/*"],
      },
      allowJs: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      noImplicitAny: false,
    };
  }

  /**
   * Every sample goes through TypeScript 7.1 or tsrs. Vue samples go through the Vue
   * content mapper, or through TypeScript generated here when `frameworkRoute` is
   * `"generated"`. Svelte samples reach this method only through the Svelte content
   * mapper; on the generated route, svelte2tsx output arrives as `tsx`.
   */
  analyze(source: string, language: "ts" | "tsx" | "vue" | "svelte"): SheetwriteTypeHover[] {
    if (language === "ts" || language === "tsx") return this.analyzeNative(source, language);
    if (this.frameworkRoute === "mappers") return this.analyzeMapped(source, language);
    if (language === "vue") return this.analyzeVue(source);
    throw new Error("Svelte samples on the generated route go through svelte2tsx first");
  }

  dispose(): void {
    this.nativeServer?.dispose();
    this.nativeServer = undefined;
  }

  private nativeProjectDirectory(): string {
    return normalizedPath(`${this.options.cwd}/.sheetwrite-hover`);
  }

  /**
   * The same compiler options as the 5.9 language service, as a tsconfig the language
   * server reads from memory. TypeScript 7 has no `baseUrl`, so `paths` are absolute, and
   * its `types` default is empty, so `"*"` keeps loading every visible `@types` package.
   */
  private nativeProjectConfig(): string {
    const paths = Object.fromEntries(
      Object.entries(this.compilerOptions.paths ?? {}).map(([specifier, targets]) => [
        specifier,
        targets.map((target) => resolve(this.options.cwd, target)),
      ]),
    );
    return JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "react",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        types: ["*"],
        paths,
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noImplicitAny: false,
      },
      ...(this.frameworkRoute === "mappers" ? { contentMappers: this.contentMappers() } : {}),
      files: ["hover.ts", "hover.tsx", "hover.vue", "hover.svelte"],
    });
  }

  private contentMappers(): object[] {
    const svelteMapper = process.env[SVELTE_MAPPER_VARIABLE];
    return [
      {
        package: "@vue/content-mapper",
        extensions: [".vue"],
        options: { target: VUE_TARGET_VERSION },
      },
      // An absolute directory resolves like a package name.
      ...(svelteMapper ? [{ package: svelteMapper, extensions: [".svelte"] }] : []),
    ];
  }

  /**
   * The Vue content mapper parses with the `typescript` package that resolves from the
   * project directory and needs 7.1, but `typescript` in docs is 5.9. A link in the
   * project directory's own `node_modules` points that name at 7.1.
   */
  private linkTypeScriptForVueMapper(): void {
    const link = `${this.nativeProjectDirectory()}/node_modules/typescript`;
    const target = dirname(createRequire(import.meta.url).resolve("typescript-7.1/package.json"));
    mkdirSync(dirname(link), { recursive: true });
    rmSync(link, { force: true });
    symlinkSync(target, link, "dir");
  }

  private nativeClient(): NativeHoverClient {
    if (this.nativeServer) return this.nativeServer;
    if (this.frameworkRoute === "mappers") this.linkTypeScriptForVueMapper();
    const documents: NativeHoverDocument[] = [
      {
        uri: pathToFileURL(this.nativeProjectFile()).href,
        languageId: "json",
        text: this.nativeProjectConfig(),
      },
      ...[...(this.options.fsMap ?? [])].map(([fileName, text]) => ({
        uri: pathToFileURL(fileName).href,
        languageId: fileName.endsWith(".tsx") ? "typescriptreact" : "typescript",
        text,
      })),
    ];
    this.nativeServer = new NativeHoverClient(
      this.options.cwd,
      this.compiler,
      INTERNAL_IDENTIFIER,
      documents,
    );
    return this.nativeServer;
  }

  private nativeProjectFile(): string {
    return `${this.nativeProjectDirectory()}/tsconfig.json`;
  }

  /** Only one sample is in the program at a time, as with the 5.9 language service. */
  private openSample(client: NativeHoverClient, uri: string): void {
    if (this.nativeOpenUri !== undefined && this.nativeOpenUri !== uri) {
      client.close([this.nativeOpenUri]);
    }
    this.nativeOpenUri = uri;
  }

  private analyzeNative(source: string, language: "ts" | "tsx"): SheetwriteTypeHover[] {
    const fileName = `${this.nativeProjectDirectory()}/hover.${language}`;
    const uri = pathToFileURL(fileName).href;
    const client = this.nativeClient();
    this.openSample(client, uri);
    const answer = client.analyze(fileName, {
      uri,
      languageId: language === "tsx" ? "typescriptreact" : "typescript",
      text: source,
    });
    return nativeHovers(answer, fileName);
  }

  private analyzeMapped(source: string, language: "vue" | "svelte"): SheetwriteTypeHover[] {
    if (language === "svelte" && !process.env[SVELTE_MAPPER_VARIABLE]) {
      throw new Error(
        `Svelte samples need ${SVELTE_MAPPER_VARIABLE}: the directory of ` +
          "packages/typescript-content-mapper, built in a sveltejs/language-tools checkout",
      );
    }
    const fileName = `${this.nativeProjectDirectory()}/hover.${language}`;
    const uri = pathToFileURL(fileName).href;
    const client = this.nativeClient();
    this.openSample(client, uri);
    const answer = client.analyzeMapped({
      projectFile: this.nativeProjectFile(),
      projectText: this.nativeProjectConfig(),
      fileName,
      document: { uri, languageId: language, text: source },
    });
    return this.resolveFrameworkTypes(nativeHovers(answer, fileName), source);
  }

  private analyzeVue(source: string): SheetwriteTypeHover[] {
    const resolver = new CompilerOptionsResolver(ts as never, ts.sys.readFile);
    resolver.addConfig({}, this.options.cwd);
    const language = createLanguage(
      [
        createVueLanguagePlugin<string>(
          ts as never,
          { ...this.compilerOptions, jsx: ts.JsxEmit.Preserve } as never,
          resolver.build(),
          (id) => id,
        ),
      ],
      new FileMap(ts.sys.useCaseSensitiveFileNames),
      () => {},
    );
    const sourceFileName = normalizedPath(`${this.options.cwd}/.sheetwrite-hover.vue`);
    const script = language.scripts.set(sourceFileName, ts.ScriptSnapshot.fromString(source));
    if (!script?.generated) return [];
    const embedded = [...script.generated.embeddedCodes.values()].find(
      (code) => code.id === "script_ts",
    );
    if (!embedded) return [];

    const generated = embedded.snapshot.getText(0, embedded.snapshot.getLength());
    const mapper = defaultMapperFactory(embedded.mappings);
    const generatedHovers = this.analyzeNative(generated, "tsx");
    const offsets = lineOffsets(source);
    const mapped: SheetwriteTypeHover[] = [];

    for (const hover of generatedHovers) {
      const startMapping = [...mapper.toSourceLocation(hover.start)][0];
      if (!startMapping) continue;
      const start = startMapping[0];
      let end = [...mapper.toSourceLocation(hover.start + hover.length)][0]?.[0];
      if (end === undefined && startMapping[1].sourceOffsets[0] === start) {
        end = startMapping[1].sourceOffsets[1];
      }
      if (end === undefined || start < 0 || end <= start || end > source.length) continue;
      const target = source.slice(start, end);
      if (!target.trim()) continue;
      const { line, character } = sourcePosition(offsets, start);
      mapped.push({ ...hover, start, length: end - start, target, line, character });
    }

    return this.resolveFrameworkTypes(mapped, source);
  }

  resolveFrameworkTypes(
    hovers: readonly SheetwriteTypeHover[],
    source?: string,
  ): SheetwriteTypeHover[] {
    const normalized = hovers.map((hover) => ({
      ...hover,
      text: hover.text.replace(/<__VLS_[A-Za-z0-9_$]+>/g, ""),
    }));
    const resolvedByTarget = new Map<string, SheetwriteTypeHover>();
    for (const hover of normalized) {
      if (usefulType(hover.text)) resolvedByTarget.set(hover.target, hover);
    }
    const scriptBoundary = source?.lastIndexOf("</script>") ?? -1;

    const repaired = normalized.map((hover) => {
      if (usefulType(hover.text)) return hover;
      if (source && hover.target === "$props") {
        const lineStart = source.lastIndexOf("\n", hover.start) + 1;
        const prefix = source.slice(lineStart, hover.start);
        const annotatedType = prefix.match(/:\s*([^=]+?)\s*=\s*$/)?.[1]?.trim();
        if (annotatedType && usefulType(annotatedType)) {
          return { ...hover, text: `function $props(): ${annotatedType}` };
        }
      }
      const sameTarget = resolvedByTarget.get(hover.target);
      if (sameTarget && source && scriptBoundary >= 0 && hover.start > scriptBoundary) {
        return { ...hover, text: sameTarget.text, docs: hover.docs ?? sameTarget.docs };
      }

      if (source && hover.target.includes("-")) {
        const suffix = source.slice(hover.start + hover.length);
        const handlerName = suffix.match(/^="([A-Za-z_$][\w$]*)"/)?.[1];
        const handler = handlerName ? resolvedByTarget.get(handlerName) : undefined;
        const handlerType = handler ? typeAfterDeclaration(handler.text) : undefined;
        if (handlerType) {
          return { ...hover, text: `${eventPropertyName(hover.target)}: ${handlerType}` };
        }
      }
      return hover;
    });

    const byRange = new Map<string, SheetwriteTypeHover>();
    for (const hover of repaired) byRange.set(`${hover.start}:${hover.length}`, hover);
    return [...byRange.values()].sort((left, right) => left.start - right.start);
  }
}
