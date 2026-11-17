import type { FormulaArgumentMetadata, FormulaFunctionMetadata } from "./types.js";

/**
 * `name` or `[optional]`, as Excel's function tooltips write one argument. A
 * repeating one is written as Excel writes it, `number1, [number2], …`, and
 * a repeating pair `criteria_range1, criteria1, [criteria_range2, criteria2], …`.
 */
export function argumentLabel(argument: FormulaArgumentMetadata): string {
  if (argument.repeating !== true) {
    return argument.optional === true ? `[${argument.name}]` : argument.name;
  }
  const names = argument.name.split(", ");
  const numbered = (number: number) => names.map((name) => `${name}${number}`).join(", ");
  return `${numbered(1)}, [${numbered(2)}], …`;
}

/** `NAME(first, [optional], more...)`, as Excel's function tooltips write it. */
export function signature(fn: FormulaFunctionMetadata): string {
  return `${fn.name}(${fn.arguments.map(argumentLabel).join(", ")})`;
}
