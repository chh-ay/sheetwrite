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

function useful_type(text: string): boolean {
  return text.length > 0 && !UNRESOLVED_ANY.test(text);
}

function event_property_name(target: string): string {
  return `on${target
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}`;
}

function type_after_declaration(text: string): string | undefined {
  const separator = text.indexOf(":");
  if (separator < 0) return undefined;
  const value = text.slice(separator + 1).trim();
  return useful_type(value) ? value : undefined;
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
    const resolved_by_target = new Map<string, SheetwriteTypeHover>();
    for (const hover of normalized) {
      if (useful_type(hover.text)) resolved_by_target.set(hover.target, hover);
    }
    const script_boundary = source?.lastIndexOf("</script>") ?? -1;

    const repaired = normalized.map((hover) => {
      if (useful_type(hover.text)) return hover;
      if (source && hover.target === "$props") {
        const line_start = source.lastIndexOf("\n", hover.start) + 1;
        const prefix = source.slice(line_start, hover.start);
        const annotated_type = prefix.match(/:\s*([^=]+?)\s*=\s*$/)?.[1]?.trim();
        if (annotated_type && useful_type(annotated_type)) {
          return { ...hover, text: `function $props(): ${annotated_type}` };
        }
      }
      const same_target = resolved_by_target.get(hover.target);
      if (same_target && source && script_boundary >= 0 && hover.start > script_boundary) {
        return { ...hover, text: same_target.text, docs: hover.docs ?? same_target.docs };
      }

      if (source && hover.target.includes("-")) {
        const suffix = source.slice(hover.start + hover.length);
        const handler_name = suffix.match(/^="([A-Za-z_$][\w$]*)"/)?.[1];
        const handler = handler_name ? resolved_by_target.get(handler_name) : undefined;
        const handler_type = handler ? type_after_declaration(handler.text) : undefined;
        if (handler_type) {
          return { ...hover, text: `${event_property_name(hover.target)}: ${handler_type}` };
        }
      }
      return hover;
    });

    const by_range = new Map<string, SheetwriteTypeHover>();
    for (const hover of repaired) by_range.set(`${hover.start}:${hover.length}`, hover);
    return [...by_range.values()].sort((left, right) => left.start - right.start);
  }
}
