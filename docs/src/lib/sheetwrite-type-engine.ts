import { resolve } from "node:path";
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
import type { NativeHoverDocument } from "./native-hover-worker.js";
import { parseNativeHover } from "./native-quick-info.js";
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

interface VirtualSource {
  code: string;
  version: number;
}

const INTERNAL_IDENTIFIER = /^__/;
const UNRESOLVED_ANY = /\bany\b/;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
}

function displayParts(parts: readonly ts.SymbolDisplayPart[] | undefined): string {
  return parts?.map((part) => part.text).join("") ?? "";
}

/** Compiler-generated scaffolding (Vue SFC virtual code, private helpers) is never reader-facing. */
const INTERNAL_TAG_TEXT = /__(?:VLS|vls)_?\w*|__sheetwrite/;

/**
 * A `@see Name` tag directly followed by another tag comes back from the
 * compiler with the next line's comment asterisk attached (`"Grid *"`).
 */
const TRAILING_COMMENT_ASTERISK = /\s+\*\s*$/;

/**
 * Join JSDoc tag parts keeping link parts word-separated: quickinfo emits
 * `{text: url, kind: "linkText"}` directly against the following prose part.
 */
function tagText(parts: readonly ts.SymbolDisplayPart[] | undefined): string | undefined {
  if (!parts?.length) return undefined;
  let out = "";
  for (const part of parts) {
    if (
      out.length > 0 &&
      !/\s$/.test(out) &&
      part.text.length > 0 &&
      !/^[\s.,;:)\]}]/.test(part.text) &&
      (part.kind.startsWith("link") || /https?:\/\/\S+$/.test(out))
    ) {
      out += " ";
    }
    out += part.text;
  }
  return out.replace(TRAILING_COMMENT_ASTERISK, "");
}

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
  private readonly virtualSources = new Map<string, VirtualSource>();
  private readonly languageService: ts.LanguageService;
  private projectVersion = 0;
  /** TypeScript 7.1, created on the first `ts` or `tsx` sample. */
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

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.compilerOptions,
      getCurrentDirectory: () => this.options.cwd,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getNewLine: () => "\n",
      getProjectVersion: () => String(this.projectVersion),
      getScriptFileNames: () => [...this.virtualSources.keys()],
      getScriptKind: (fileName) =>
        fileName.endsWith(".tsx")
          ? ts.ScriptKind.TSX
          : fileName.endsWith(".jsx")
            ? ts.ScriptKind.JSX
            : fileName.endsWith(".js")
              ? ts.ScriptKind.JS
              : fileName.endsWith(".json")
                ? ts.ScriptKind.JSON
                : ts.ScriptKind.TS,
      getScriptSnapshot: (fileName) => {
        const content = this.readFile(fileName);
        return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
      },
      getScriptVersion: (fileName) =>
        String(this.virtualSources.get(normalizedPath(fileName))?.version ?? 0),
      fileExists: (fileName) => this.readFile(fileName) !== undefined,
      readFile: (fileName) => this.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      realpath: ts.sys.realpath,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    };
    this.languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  /**
   * `ts` and `tsx` samples go through TypeScript 7.1. Vue samples, and TypeScript that
   * svelte2tsx generated (`origin: "svelte"`), stay on the 5.9 language service: their
   * mapping code is written against the 5.9 compiler API.
   */
  analyze(
    source: string,
    language: "ts" | "tsx" | "vue",
    origin?: "svelte",
  ): SheetwriteTypeHover[] {
    if (language === "vue") return this.analyzeVue(source);
    if (origin === "svelte") return this.analyzeTypeScript(source, language);
    return this.analyzeNative(source, language);
  }

  dispose(): void {
    this.nativeServer?.dispose();
    this.nativeServer = undefined;
  }

  private readFile(fileName: string): string | undefined {
    const path = normalizedPath(fileName);
    const virtual = this.virtualSources.get(path);
    if (virtual) return virtual.code;
    const mapped = this.options.fsMap?.get(path) ?? this.options.fsMap?.get(fileName);
    return mapped ?? ts.sys.readFile(fileName);
  }

  private analyzeTypeScript(source: string, language: "ts" | "tsx"): SheetwriteTypeHover[] {
    const fileName = normalizedPath(`${this.options.cwd}/.sheetwrite-hover.${language}`);
    const current = this.virtualSources.get(fileName);
    this.virtualSources.clear();
    this.virtualSources.set(fileName, { code: source, version: (current?.version ?? 0) + 1 });
    this.projectVersion += 1;

    const sourceFile = this.languageService.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return [];

    const hovers: SheetwriteTypeHover[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !INTERNAL_IDENTIFIER.test(node.text)) {
        const start = node.getStart(sourceFile);
        const quickInfo = this.languageService.getQuickInfoAtPosition(fileName, start);
        const text = displayParts(quickInfo?.displayParts);
        if (text) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
          const docs = displayParts(quickInfo?.documentation);
          const tags = quickInfo?.tags
            ?.map((tag) => [tag.name, tagText(tag.text)] as [string, string | undefined])
            .filter(([, value]) => !value || !INTERNAL_TAG_TEXT.test(value));
          const definitions = this.languageService.getDefinitionAtPosition(fileName, start) ?? [];
          const origin = hoverOrigin(
            definitions.map((definition) => definition.fileName),
            fileName,
          );
          hovers.push({
            type: "hover",
            text,
            ...(docs ? { docs } : {}),
            ...(tags?.length ? { tags } : {}),
            ...(origin ? { origin } : {}),
            start,
            length: node.end - start,
            target: node.text,
            line,
            character,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return hovers;
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
      files: ["hover.ts", "hover.tsx"],
    });
  }

  private nativeClient(): NativeHoverClient {
    if (this.nativeServer) return this.nativeServer;
    const documents: NativeHoverDocument[] = [
      {
        uri: pathToFileURL(`${this.nativeProjectDirectory()}/tsconfig.json`).href,
        languageId: "json",
        text: this.nativeProjectConfig(),
      },
      ...[...(this.options.fsMap ?? [])].map(([fileName, text]) => ({
        uri: pathToFileURL(fileName).href,
        languageId: fileName.endsWith(".tsx") ? "typescriptreact" : "typescript",
        text,
      })),
    ];
    this.nativeServer = new NativeHoverClient(this.options.cwd, INTERNAL_IDENTIFIER, documents);
    return this.nativeServer;
  }

  private analyzeNative(source: string, language: "ts" | "tsx"): SheetwriteTypeHover[] {
    const fileName = `${this.nativeProjectDirectory()}/hover.${language}`;
    const uri = pathToFileURL(fileName).href;
    const client = this.nativeClient();
    // Only one sample is in the program at a time, as with the 5.9 language service.
    if (this.nativeOpenUri !== undefined && this.nativeOpenUri !== uri) {
      client.close([this.nativeOpenUri]);
    }
    this.nativeOpenUri = uri;

    const answer = client.analyze(fileName, {
      uri,
      languageId: language === "tsx" ? "typescriptreact" : "typescript",
      text: source,
    });

    const hovers: SheetwriteTypeHover[] = [];
    for (const [index, identifier] of answer.identifiers.entries()) {
      const markdown = answer.hovers[index];
      const quickInfo = markdown ? parseNativeHover(markdown) : undefined;
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
    const generatedHovers = this.analyzeTypeScript(generated, "tsx");
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
