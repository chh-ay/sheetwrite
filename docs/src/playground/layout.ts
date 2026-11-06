/**
 * Sizes the loading placeholder (components/RunnableCode.tsx) and the
 * playground share, so the panel keeps its size when the editor replaces the
 * placeholder and when the example's grid appears.
 */

/** The line under the editor. */
export const EDITOR_HINT =
  "Edit the code, then press Run or Ctrl+Enter. Press Escape, then Tab, to leave the editor.";

/** An example sizes its grid host with `host.style.height = "<n>px"`. */
const HOST_HEIGHT = /\bhost\.style\.height\s*=\s*["'](\d+)px["']/;

/**
 * The height the example's result needs, read from the height it gives its
 * grid host, so the result frame opens at that size. `undefined` when the
 * example sets no host height; the frame then keeps the stylesheet's height
 * until the example draws.
 */
export function expectedResultHeight(source: string): number | undefined {
  const match = HOST_HEIGHT.exec(source)?.[1];
  return match === undefined ? undefined : Number.parseInt(match, 10);
}
