import type { FormulaArgumentMetadata, FormulaFunctionMetadata } from "./types.js";

/** `name`, `[optional]` or `more...`, as Excel's function tooltips write one argument. */
export function argumentLabel(argument: FormulaArgumentMetadata): string {
  const name = argument.repeating === true ? `${argument.name}...` : argument.name;
  return argument.optional === true ? `[${name}]` : name;
}

/** `NAME(first, [optional], more...)`, as Excel's function tooltips write it. */
export function signature(fn: FormulaFunctionMetadata): string {
  return `${fn.name}(${fn.arguments.map(argumentLabel).join(", ")})`;
}
