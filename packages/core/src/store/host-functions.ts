import { engineFunctionNames } from "../engine.js";
import { SheetwriteError } from "../errors.js";
import { BUILT_IN_FUNCTION_METADATA } from "../generated/function-metadata.js";
import type { FormulaFunction, FormulaFunctionMetadata } from "../types/formula.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

/** The package name that `builds` uses for each engine. */
const DEFAULT_ENGINE_BUILD = "@sheetwrite/wasm";
const FULL_ENGINE_BUILD = "@sheetwrite/formulas";

/** The spelling that the formula parser reads as a function call. */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;

interface HostFunctionEntry {
  readonly metadata: FormulaFunctionMetadata;
  readonly implementation: FormulaFunction;
}

function invalid(message: string, name: string): SheetwriteError {
  return new SheetwriteError("invalid-function", "register-function", message, {
    context: { name },
  });
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** A copy that later changes to the caller's object cannot alter. */
function frozenMetadata(metadata: FormulaFunctionMetadata): FormulaFunctionMetadata {
  if (typeof metadata !== "object" || metadata === null) {
    throw invalid("Function metadata must be an object", "");
  }

  const name = typeof metadata.name === "string" ? metadata.name : "";
  if (!FUNCTION_NAME.test(name)) {
    throw invalid(
      "Function name must start with a letter or _ and use letters, digits, _ or .",
      name,
    );
  }
  if (typeof metadata.description !== "string" || typeof metadata.returnKind !== "string") {
    throw invalid("Function description and returnKind must be strings", name);
  }
  if (!Array.isArray(metadata.arguments)) {
    throw invalid("Function arguments must be an array", name);
  }
  if (metadata.examples !== undefined && !isStringArray(metadata.examples)) {
    throw invalid("Function examples must be strings", name);
  }

  const argumentsMetadata = metadata.arguments.map((argument) => {
    if (typeof argument?.name !== "string" || !isStringArray(argument.types)) {
      throw invalid("Each argument needs a name and a types array", name);
    }

    return Object.freeze({
      name: argument.name,
      types: Object.freeze([...argument.types]),
      optional: argument.optional === true,
      repeating: argument.repeating === true,
    });
  });

  return Object.freeze({
    name: name.toUpperCase(),
    description: metadata.description,
    arguments: Object.freeze(argumentsMetadata),
    returnKind: metadata.returnKind,
    examples: Object.freeze([...(metadata.examples ?? [])]),
    volatile: metadata.volatile === true,
  });
}

/**
 * Host functions of one store. The registry keeps them in JavaScript, because
 * the WASM store that calls them can be replaced when engine memory is
 * released.
 */
export class HostFunctionRegistry {
  private readonly entries = new Map<string, HostFunctionEntry>();

  register(
    wasm: RecomputingCellStore,
    metadata: FormulaFunctionMetadata,
    implementation: FormulaFunction,
  ): void {
    const frozen = frozenMetadata(metadata);
    if (typeof implementation !== "function") {
      throw invalid("Function implementation must be a function", frozen.name);
    }

    if (!wasm.registerFunction(frozen.name, implementation, frozen.volatile === true)) {
      throw invalid(
        "Function name is a built-in function, a cell reference, or not a function name",
        frozen.name,
      );
    }

    this.entries.set(frozen.name, { metadata: frozen, implementation });
  }

  unregister(wasm: RecomputingCellStore, name: string): boolean {
    const key = name.toUpperCase();
    if (!this.entries.delete(key)) return false;

    return wasm.unregisterFunction(key);
  }

  /**
   * Registers every host function on a replacement WASM store without
   * recalculating: the replacement already holds the calculated values, and a
   * recalculation would draw new values for volatile formulas.
   */
  restore(wasm: RecomputingCellStore): void {
    for (const { metadata, implementation } of this.entries.values()) {
      if (!wasm.restoreFunction(metadata.name, implementation, metadata.volatile === true)) {
        throw invalid("The replacement engine refused a registered function", metadata.name);
      }
    }
  }

  /** Built-in functions of the active engine, then host functions in registration order. */
  list(): readonly FormulaFunctionMetadata[] {
    const build = engineFunctionNames === undefined ? DEFAULT_ENGINE_BUILD : FULL_ENGINE_BUILD;
    const builtIns = BUILT_IN_FUNCTION_METADATA.filter((entry) => entry.builds.includes(build));

    return [...builtIns, ...[...this.entries.values()].map((entry) => entry.metadata)];
  }
}
