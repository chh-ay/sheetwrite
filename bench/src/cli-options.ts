/**
 * The value of flag `name` in `args`, or undefined when the flag is absent.
 *
 * Accepts `--name value` and `--name=value`. A flag with no value, or with
 * another flag where its value should be, throws: a script must not read the
 * next flag as a path.
 */
export function optionValue(args: readonly string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  for (const [index, argument] of args.entries()) {
    if (argument.startsWith(inlinePrefix)) {
      const value = argument.slice(inlinePrefix.length);
      if (value === "") throw new Error(`${name} requires a value`);
      return value;
    }
    if (argument !== name) continue;

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  }
  return undefined;
}

/** The value of flag `name` in `args`. A missing flag or value throws. */
export function requiredOption(args: readonly string[], name: string): string {
  const value = optionValue(args, name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}
