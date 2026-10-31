import { engineFunctionNames } from "../engine.js";
import { SheetwriteError } from "../errors.js";
import type { HostFunctionHooks } from "../store/data-engine.js";
import { storeEngine } from "../store/engine-registry.js";
import type { RecomputingCellStore } from "../store/wasm-contract.js";
import type { Store } from "../types/store.js";
import { type HostCall, hostCall } from "./host-call.js";
import type { FormulaFunction, FormulaFunctionMetadata } from "./types.js";

/** Row flag bits; `scripts/formula-docs.ts` writes the same bits. */
const FUNCTION_FLAG_VOLATILE = 1;
const FUNCTION_FLAG_DEFAULT_ENGINE = 2;
const FUNCTION_FLAG_FULL_ENGINE = 4;

/** The spelling that the formula parser reads as a function call. */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;

interface HostFunctionEntry {
  readonly metadata: FormulaFunctionMetadata;
  /** The host's function, wrapped for the engine's flat argument buffers. */
  readonly call: HostCall;
}

export function invalidFunction(message: string, name: string): SheetwriteError {
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
    throw invalidFunction("Function metadata must be an object", "");
  }

  const name = typeof metadata.name === "string" ? metadata.name : "";
  if (!FUNCTION_NAME.test(name)) {
    throw invalidFunction(
      "Function name must start with a letter or _ and use letters, digits, _ or .",
      name,
    );
  }
  if (typeof metadata.description !== "string" || typeof metadata.returnKind !== "string") {
    throw invalidFunction("Function description and returnKind must be strings", name);
  }
  if (!Array.isArray(metadata.arguments)) {
    throw invalidFunction("Function arguments must be an array", name);
  }
  if (metadata.examples !== undefined && !isStringArray(metadata.examples)) {
    throw invalidFunction("Function examples must be strings", name);
  }

  const argumentsMetadata = metadata.arguments.map((argument) => {
    if (typeof argument?.name !== "string" || !isStringArray(argument.types)) {
      throw invalidFunction("Each argument needs a name and a types array", name);
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
 * The built-in functions of the active engine, then the host functions of
 * `store` in registration order. A store without an engine has only the
 * built-in functions.
 */
export async function storeFunctions(store: Store): Promise<FormulaFunctionMetadata[]> {
  const hostFunctions = storeEngine(store)?.hostFunctions?.metadata() ?? [];

  return [...(await builtInFunctions()), ...hostFunctions];
}

type HostFunctionSetter = (
  name: string,
  callback: HostCall | undefined,
  volatile: boolean,
  recalculate: boolean,
) => boolean;

/** Only the full engine (`@sheetwrite/formulas`) has the host function bridge. */
function setterOf(wasm: RecomputingCellStore): HostFunctionSetter {
  const setHostFunction = wasm.setHostFunction;
  if (setHostFunction === undefined) {
    throw new SheetwriteError(
      "optional-backend-unavailable",
      "host-function",
      "Host functions need the full engine: call initSheetwrite(undefined, formulas) with @sheetwrite/formulas",
    );
  }

  return setHostFunction.bind(wasm);
}

/**
 * Host functions of one store. The registry keeps them in JavaScript, because
 * the WASM store that calls them can be replaced when engine memory is
 * released; the engine hands each new WASM store to `adopt`.
 */
export class HostFunctionRegistry implements HostFunctionHooks {
  private readonly entries = new Map<string, HostFunctionEntry>();
  private runningCalls = 0;
  private wasm: RecomputingCellStore | undefined;

  /**
   * A host function runs inside recalculation, while the engine store is
   * busy. A change at that point could update the JavaScript document state
   * and then fail in the engine. A read that reaches the busy engine object
   * fails in a way that leaves the object unable to be freed. So every store
   * call that can reach the engine refuses before it starts.
   */
  assertIdle(): void {
    if (this.runningCalls === 0) return;

    throw new SheetwriteError(
      "blocked",
      "host-function",
      "A formula function cannot use the store while formulas calculate",
    );
  }

  /** Later registrations change `wasm`; the engine calls this once `wasm` is live. */
  adopt(wasm: RecomputingCellStore): void {
    this.wasm = wasm;
  }

  /**
   * Registers every host function on a replacement WASM store without
   * recalculating: it already holds the calculated values, and a
   * recalculation would draw new values for volatile formulas.
   */
  restore(wasm: RecomputingCellStore): void {
    if (this.entries.size === 0) return;

    const setHostFunction = setterOf(wasm);
    for (const { metadata, call } of this.entries.values()) {
      if (!setHostFunction(metadata.name, call, metadata.volatile === true, false)) {
        throw invalidFunction(
          "The replacement engine refused a registered function",
          metadata.name,
        );
      }
    }
  }

  register(metadata: FormulaFunctionMetadata, implementation: FormulaFunction): void {
    const frozen = frozenMetadata(metadata);
    if (typeof implementation !== "function") {
      throw invalidFunction("Function implementation must be a function", frozen.name);
    }

    const call = hostCall(implementation, (running) => {
      this.runningCalls += running ? 1 : -1;
    });
    if (!this.adopted()(frozen.name, call, frozen.volatile === true, true)) {
      throw invalidFunction(
        "Function name is a built-in function, a cell reference, or not a function name",
        frozen.name,
      );
    }

    this.entries.set(frozen.name, { metadata: frozen, call });
  }

  unregister(name: string): boolean {
    const key = name.toUpperCase();
    if (!this.entries.delete(key)) return false;

    return this.adopted()(key, undefined, false, true);
  }

  /** Host function metadata in registration order. */
  metadata(): FormulaFunctionMetadata[] {
    return [...this.entries.values()].map((entry) => entry.metadata);
  }

  private adopted(): HostFunctionSetter {
    if (this.wasm === undefined) {
      throw new SheetwriteError("unavailable", "host-function", "The registry has no engine");
    }

    return setterOf(this.wasm);
  }
}
