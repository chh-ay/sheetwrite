/**
 * Records every `CellStore` call a formula fixture makes, so a native build of
 * the engine can replay exactly the work the formula gate times.
 *
 * Trace format, one record per line, fields separated by tabs:
 *
 * - `W <id> <size> <restore 0|1>` starts a workload.
 * - `P <setup|run|check|restore>` names the fixture phase of the calls after it.
 * - `N <store>` constructs store number `store`.
 * - `C <store> <method> <arg>...` calls a method. Arguments are typed:
 *   `n:<number>`, `s:<escaped text>`, `b:<0|1>`, `f:<comma-separated numbers>`.
 * - `= <kind> <number> <escaped text or ~>` is the `CellOut` the previous
 *   `getCell` returned, so a replay can check its results.
 *
 * Numbers use JavaScript's shortest round-trip form. Text escapes `\`, tab and
 * newline as `\\`, `\t` and `\n`.
 */

interface RecordedCellOut {
  kind: number;
  num: number;
  string: string | undefined;
}

let lines: string[] | undefined;
let storeCount = 0;

function escapeText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("\t", "\\t").replaceAll("\n", "\\n");
}

function encodeArgument(value: unknown): string {
  if (typeof value === "number") return `n:${String(value)}`;
  if (typeof value === "string") return `s:${escapeText(value)}`;
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
  if (value instanceof Float64Array) return `f:${Array.from(value, String).join(",")}`;
  throw new Error(`formula trace cannot encode argument ${String(value)}`);
}

/** Start recording a workload; calls outside a workload are not recorded. */
export function beginTraceWorkload(): void {
  lines = [];
  storeCount = 0;
}

/** Mark the fixture phase of the calls that follow. */
export function traceFixturePhase(phase: "setup" | "run" | "check" | "restore"): void {
  lines?.push(`P\t${phase}`);
}

/** Finish the current workload and return its trace text, headed by its `W` record. */
export function endTraceWorkload(id: string, size: number, restore: boolean): string {
  if (lines === undefined) throw new Error("formula trace has no open workload");
  const text = [`W\t${id}\t${size}\t${restore ? 1 : 0}`, ...lines, ""].join("\n");
  lines = undefined;
  return text;
}

/**
 * Wrap a `CellStore` class so each instance logs its calls while a workload is
 * open. The wrapped class keeps the original prototype, so feature checks on
 * `CellStore.prototype` still see the engine's real methods.
 */
export function recordingCellStore<T extends abstract new (...args: never[]) => object>(
  base: T,
): T {
  return new Proxy(base, {
    construct(target, args, newTarget) {
      const store = Reflect.construct(target, args, newTarget) as Record<PropertyKey, unknown>;
      const index = storeCount;
      storeCount += 1;
      lines?.push(`N\t${index}`);
      return new Proxy(store, {
        get(instance, property) {
          const value = Reflect.get(instance, property, instance);
          if (typeof value !== "function" || typeof property !== "string") return value;
          return (...callArgs: unknown[]) => {
            if (lines !== undefined) {
              lines.push(["C", index, property, ...callArgs.map(encodeArgument)].join("\t"));
            }
            const result = (value as (...a: unknown[]) => unknown).apply(instance, callArgs);
            if (lines !== undefined && property === "getCell") {
              const cell = result as RecordedCellOut;
              const text = cell.string === undefined ? "~" : escapeText(cell.string);
              lines.push(`=\t${cell.kind}\t${String(cell.num)}\t${text}`);
            }
            return result;
          };
        },
      });
    },
  });
}
