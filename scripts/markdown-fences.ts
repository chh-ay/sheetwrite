/** One fenced code block, by line index: the opener, and the closer or the last line of the text. */
export interface FenceBlock {
  readonly start: number;
  readonly end: number;
  /** `false` when no closer follows, so the block runs to the end of the text. */
  readonly closed: boolean;
  readonly indent: number;
  readonly marker: string;
  readonly info: string;
}

const FENCE_OPENER = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSER = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Finds fenced code blocks by the CommonMark rules the docs site's Markdown
 * parser uses: up to three spaces of indent, three or more backticks or
 * tildes, and a closer of the same character that is at least as long. A
 * backtick info string cannot hold a backtick.
 */
export function fenceBlocks(lines: readonly string[]): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opener = FENCE_OPENER.exec(lines[index] ?? "");
    const [, indent = "", marker = "", info = ""] = opener ?? [];
    if (opener === null || (marker.startsWith("`") && info.includes("`"))) continue;

    const start = index;
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      const closer = FENCE_CLOSER.exec(lines[index] ?? "")?.[1];
      if (closer !== undefined && closer[0] === marker[0] && closer.length >= marker.length) {
        closed = true;
        break;
      }
    }
    const end = Math.min(index, lines.length - 1);
    blocks.push({ start, end, closed, indent: indent.length, marker, info });
  }
  return blocks;
}
