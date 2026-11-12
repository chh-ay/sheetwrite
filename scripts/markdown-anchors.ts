import { maskFences } from "./markdown-fences.js";

/**
 * Every fragment the site gives a page. Explicit `id` attributes keep their
 * value. Headings get the slug of their text, and a repeated slug gets `-1`,
 * `-2` and so on in page order, as `rehype-slug` (github-slugger) does in
 * `docs/src/lib/mdx-pipeline.ts`.
 */
export function headingAnchors(content: string): Set<string> {
  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const line of maskFences(content).split("\n")) {
    const explicit = /<[a-z][^>]*\sid=["']([^"']+)["']/i.exec(line);
    if (explicit !== null) anchors.add(explicit[1] ?? "");
    const heading =
      /^#{1,6}\s+(.+?)\s*$/.exec(line)?.[1] ??
      (explicit === null ? /<h[1-6](?:\s[^>]*)?>(.*?)<\/h[1-6]>/i.exec(line)?.[1] : undefined);
    if (heading === undefined) continue;

    const base = heading
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s/g, "-");
    let slug = base;
    while (occurrences.has(slug)) {
      const count = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, count);
      slug = `${base}-${count}`;
    }
    occurrences.set(slug, 0);
    if (slug.length > 0) anchors.add(slug);
  }
  return anchors;
}
