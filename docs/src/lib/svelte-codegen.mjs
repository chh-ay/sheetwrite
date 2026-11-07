// Turns Svelte samples into TypeScript for the hover engine, in a process of its own:
// svelte2tsx loads TypeScript 5.9 (about 85 MiB), which the docs build should not keep
// for the rest of the run. Reads a JSON array of sources on stdin and writes a JSON array
// of `{ code, map }` or `{ error }` to stdout, then exits.
import { svelte2tsx } from "svelte2tsx";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const results = JSON.parse(input).map((source) => {
  try {
    const transformed = svelte2tsx(source, {
      filename: "Component.svelte",
      isTsFile: true,
      mode: "ts",
    });
    return { code: transformed.code, map: transformed.map.toString() };
  } catch (error) {
    // Reported per sample, as svelte2tsx's own error was before.
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
process.stdout.write(JSON.stringify(results));
