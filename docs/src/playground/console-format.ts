/** Console output of a runnable example, as text the playground lists. */

/** Console output stops listing items or keys after this many. */
const MAX_LISTED = 20;
/** Console output shows nested values to this depth. */
const MAX_DEPTH = 3;

/** A console value as one line of text, the way a browser console would list it. */
export function formatValue(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (typeof value === "string") return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value !== "object" || value === null) return String(value);
  if ("message" in value && "stack" in value)
    return `${String(Reflect.get(value, "name"))}: ${String(value.message)}`;
  if (seen.has(value)) return "[Circular]";
  const nested = (item: unknown) => formatValue(item, depth + 1, new Set([...seen, value]));
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const items = Array.from(value as ArrayLike<unknown>);
    if (depth >= MAX_DEPTH) return `[…${items.length}]`;
    const listed = items.slice(0, MAX_LISTED).map(nested);
    if (items.length > MAX_LISTED) listed.push(`… ${items.length - MAX_LISTED} more`);
    const prefix = Array.isArray(value) ? "" : `${value.constructor.name}(${items.length}) `;
    return `${prefix}[${listed.join(", ")}]`;
  }
  const entries = Object.entries(value);
  if (depth >= MAX_DEPTH) return "{…}";
  const listed = entries.slice(0, MAX_LISTED).map(([key, item]) => `${key}: ${nested(item)}`);
  if (entries.length > MAX_LISTED) listed.push(`… ${entries.length - MAX_LISTED} more`);
  return listed.length === 0 ? "{}" : `{ ${listed.join(", ")} }`;
}
