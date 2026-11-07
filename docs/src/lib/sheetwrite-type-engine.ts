import {
  CompilerOptionsResolver,
  createLanguage,
  createVueLanguagePlugin,
  defaultMapperFactory,
  FileMap,
  type LanguagePlugin,
  type VueVirtualCode,
} from "@vue/language-core";
import ts from "typescript";

import { type IdentifierSelection, NativeTypeEngine } from "./native-type-engine.js";
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

const INTERNAL_IDENTIFIER = /^__/;
const UNRESOLVED_ANY = /\bany\b/;

/** Compiler-generated scaffolding (Vue SFC virtual code, private helpers) is never reader-facing. */
const INTERNAL_TAG_TEXT = /__(?:VLS|vls)_?\w*|__sheetwrite/;

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/{2,}/g, "/");
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
 * Repository-owned quick-info engine. TypeScript 7.1 (`NativeTypeEngine`) is the type
 * system for every sample; this class turns Vue samples into TypeScript with
 * `@vue/language-core`, maps their hovers back, and repairs unresolved framework types.
 */
export class SheetwriteTypeEngine {
  private readonly native: NativeTypeEngine;
  /** `@vue/language-core` generates code with the TypeScript 5.9 library; it checks nothing. */
  private readonly vuePlugin: LanguagePlugin<string, VueVirtualCode>;

  constructor(private readonly options: SheetwriteTypeEngineOptions) {
    this.native = new NativeTypeEngine({
      cwd: options.cwd,
      internalIdentifier: INTERNAL_IDENTIFIER,
      internalTagText: INTERNAL_TAG_TEXT,
      ...(options.fsMap ? { fsMap: options.fsMap } : {}),
    });
    const resolver = new CompilerOptionsResolver(ts as never, ts.sys.readFile);
    resolver.addConfig({}, options.cwd);
    // The options the generated code was written for before TypeScript 7.1 checked it.
    const codegenOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      jsxImportSource: "react",
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
      allowJs: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      skipLibCheck: true,
      strict: true,
      noImplicitAny: false,
    };
    this.vuePlugin = createVueLanguagePlugin<string>(
      ts as never,
      codegenOptions as never,
      resolver.build(),
      (id) => id,
    );
  }

  /** Samples requested in the same turn of the event loop are analyzed together. */
  analyze(
    source: string,
    language: "ts" | "tsx" | "vue",
    selection?: IdentifierSelection,
  ): Promise<SheetwriteTypeHover[]> {
    if (language === "vue") return this.analyzeVue(source);
    return this.native.analyze(source, language, selection);
  }

  /** Hovers derived from generated code (Svelte samples), cached by `key` like every sample. */
  remember(
    key: string,
    compute: () => Promise<SheetwriteTypeHover[]>,
  ): Promise<SheetwriteTypeHover[]> {
    return this.native.remember(key, compute);
  }

  /** Stops the TypeScript 7.1 processes; without it they stop once the process is idle. */
  dispose(): Promise<void> {
    return this.native.dispose();
  }

  private async analyzeVue(source: string): Promise<SheetwriteTypeHover[]> {
    const language = createLanguage(
      [this.vuePlugin],
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
    // Only generated identifiers that map back into the Vue source can become hovers.
    const generatedHovers = await this.native.analyze(generated, "tsx", {
      key: `vue\0${source}`,
      keep: (identifier) => [...mapper.toSourceLocation(identifier.start)].length > 0,
    });
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
