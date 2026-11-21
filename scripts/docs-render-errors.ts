/**
 * Fails the docs build when a prerendered page carries a render error.
 *
 * A component that throws while the server renders a page does not stop the
 * build: Solid serializes the error into the page's hydration data
 * (`_$HY.r[…]=$R[…]=Object.assign(new Error("…"),…)`), the page ships without
 * the part that threw, and its hydration fails in the browser. A blueprint
 * figure whose box holds more text than the kit allows is one such error.
 *
 *   bun scripts/docs-render-errors.ts <static root>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** An error object as Seroval writes it into a page's hydration script. */
const SERIALIZED_ERROR = /\$R\[\d+\]=Object\.assign\(new (\w*Error)\("((?:[^"\\]|\\.)*)"/g;

/** The render errors one page's HTML carries, as "Error: message". */
export function renderErrors(html: string): string[] {
  return [...html.matchAll(SERIALIZED_ERROR)].map(
    ([, name, message]) => `${name}: ${JSON.parse(`"${message ?? ""}"`) as string}`,
  );
}

function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? "docs/dist/client");
  const issues = htmlFiles(root).flatMap((file) =>
    renderErrors(readFileSync(file, "utf8")).map((error) => `${relative(root, file)}: ${error}`),
  );
  if (issues.length > 0) {
    process.stderr.write(`${issues.join("\n")}\n`);
    throw new Error(`${issues.length} prerendered pages carry a render error`);
  }
  process.stdout.write("No prerendered page carries a render error\n");
}
