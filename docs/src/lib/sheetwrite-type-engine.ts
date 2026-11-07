import { type IdentifierSelection, NativeTypeEngine } from "../../hovers/native-type-engine.js";

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
 * Repository-owned quick-info engine. TypeScript 7.1 (`NativeTypeEngine`) answers every
 * sample, Vue ones through the Vue content mapper; this class repairs unresolved
 * framework types the samples' bindings leave behind.
 */
export class SheetwriteTypeEngine {
  private readonly native: NativeTypeEngine;
  constructor(options: SheetwriteTypeEngineOptions) {
    this.native = new NativeTypeEngine({
      cwd: options.cwd,
      internalIdentifier: INTERNAL_IDENTIFIER,
      internalTagText: INTERNAL_TAG_TEXT,
      ...(options.fsMap ? { fsMap: options.fsMap } : {}),
    });
  }

  /** Samples requested in the same turn of the event loop are analyzed together. */
  analyze(
    source: string,
    language: "ts" | "tsx" | "vue",
    selection?: IdentifierSelection,
  ): Promise<SheetwriteTypeHover[]> {
    if (language !== "vue") return this.native.analyze(source, language, selection);
    return this.native
      .analyze(source, language, selection)
      .then((hovers) => this.resolveFrameworkTypes(hovers, source));
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
