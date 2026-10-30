import { engineFunctionNames } from "../engine.js";
import { SheetwriteError } from "../errors.js";
import type {
  FormulaArgumentMetadata,
  FormulaFunction,
  FormulaFunctionMetadata,
} from "../types/formula.js";
import type { RecomputingCellStore } from "./wasm-contract.js";

/**
 * The built-in functions as `docs:generate` writes them: each family title and
 * signature profile once, and one row per name that refers to them by index.
 * Rows are `[name, family, profile, flags]`.
 */
export interface BuiltInFunctionTable {
  readonly families: readonly string[];
  readonly profiles: readonly {
    readonly arguments: readonly FormulaArgumentMetadata[];
    readonly returnKind: string;
  }[];
  readonly functions: readonly (readonly [string, number, number, number])[];
}

/** Row flag bits; `scripts/formula-docs.ts` writes the same bits. */
const FUNCTION_FLAG_VOLATILE = 1;
const FUNCTION_FLAG_DEFAULT_ENGINE = 2;
const FUNCTION_FLAG_FULL_ENGINE = 4;

/** The spelling that the formula parser reads as a function call. */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;

interface HostFunctionEntry {
  readonly metadata: FormulaFunctionMetadata;
  /** The host's function, wrapped so the store knows when a call is running. */
  readonly guarded: FormulaFunction;
}

function invalid(message: string, name: string): SheetwriteError {
  return new SheetwriteError("invalid-function", "host-function", message, {
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
 * The built-in functions of the active engine. A static import would put the
 * table in every bundle that includes the store, so it loads on the first
 * call and bundlers split it into its own chunk.
 */
async function builtInFunctions(): Promise<FormulaFunctionMetadata[]> {
  const { BUILT_IN_FUNCTIONS } = await import("../generated/function-metadata.js");
  const engineFlag =
    engineFunctionNames === undefined ? FUNCTION_FLAG_DEFAULT_ENGINE : FUNCTION_FLAG_FULL_ENGINE;

  return BUILT_IN_FUNCTIONS.functions.flatMap(([name, family, profile, flags]) => {
    const familyTitle = BUILT_IN_FUNCTIONS.families[family];
    const signature = BUILT_IN_FUNCTIONS.profiles[profile];
    if ((flags & engineFlag) === 0 || familyTitle === undefined || signature === undefined) {
      return [];
    }

    return [
      {
        name,
        description: `${familyTitle} function.`,
        arguments: signature.arguments,
        returnKind: signature.returnKind,
        examples: [],
        volatile: (flags & FUNCTION_FLAG_VOLATILE) !== 0,
      },
    ];
  });
}

/**
 * Host functions of one store. The registry keeps them in JavaScript, because
 * the WASM store that calls them can be replaced when engine memory is
 * released.
 */
export class HostFunctionRegistry {
  private readonly entries = new Map<string, HostFunctionEntry>();
  private runningCalls = 0;

  /** Whether the engine is inside a host function call, so the store is busy. */
  get isCalling(): boolean {
    return this.runningCalls > 0;
  }

  register(
    wasm: RecomputingCellStore,
    metadata: FormulaFunctionMetadata,
    implementation: FormulaFunction,
  ): void {
    const frozen = frozenMetadata(metadata);
    if (typeof implementation !== "function") {
      throw invalid("Function implementation must be a function", frozen.name);
    }

    const guarded: FormulaFunction = (...values) => {
      this.runningCalls += 1;
      try {
        return implementation(...values);
      } finally {
        this.runningCalls -= 1;
      }
    };
    if (!wasm.registerFunction(frozen.name, guarded, frozen.volatile === true)) {
      throw invalid(
        "Function name is a built-in function, a cell reference, or not a function name",
        frozen.name,
      );
    }

    this.entries.set(frozen.name, { metadata: frozen, guarded });
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
    for (const { metadata, guarded } of this.entries.values()) {
      if (!wasm.restoreFunction(metadata.name, guarded, metadata.volatile === true)) {
        throw invalid("The replacement engine refused a registered function", metadata.name);
      }
    }
  }

  /** Built-in functions of the active engine, then host functions in registration order. */
  async list(): Promise<readonly FormulaFunctionMetadata[]> {
    const builtIns = await builtInFunctions();

    return [...builtIns, ...[...this.entries.values()].map((entry) => entry.metadata)];
  }
}
