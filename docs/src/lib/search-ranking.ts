/*
 * How the docs search ranks Pagefind's pages again. Pagefind weighs how often
 * a word appears and prefers short pages, so the page that IS the query (an
 * API symbol, a formula function, a guide titled with the query) can sit far
 * below short API pages that name the word.
 */

/** A section of a page that Pagefind matched. */
export interface PagefindSubResult {
  url: string;
  title: string;
  excerpt: string;
}

/** An element with an id on the page, as Pagefind indexed it. */
export interface PagefindAnchor {
  element: string;
  id: string;
  text?: string;
}

export interface PagefindResultData {
  url: string;
  meta: { title?: string; package?: string };
  excerpt: string;
  content: string;
  sub_results?: PagefindSubResult[];
  anchors?: PagefindAnchor[];
}

/** One rendered hit: pages plus their anchored members and headings. */
export interface SearchEntry {
  url: string;
  title: string;
  package?: string;
  excerpt: string;
}

/**
 * Pagefind's best pages that are ranked again. A guide titled with the query
 * can follow 30 API pages that name the same word ("charts" puts the Charts
 * guide 31st), so the pool is wider than the list.
 */
export const RANKED_PAGES = 40;
/** Pages shown, each with up to three of its sections. */
const SHOWN_PAGES = 8;
/** Sections shown under each page. */
const SECTIONS_PER_PAGE = 3;

/** Letters a word may change at its end and still match: Pagefind matches "sorting" to "sort". */
const ENDING_LENGTH = 3;

// Structural section headings; a sub-result named "Declaration" tells the
// reader nothing about WHICH declaration matched.
const GENERIC_SECTIONS = new Set(["Members", "Declaration", "Variants", "Exported symbols"]);

/**
 * Words of a question that name nothing. Pagefind returns only pages that hold
 * every word, so "how do I freeze rows" would find only pages that say "how"
 * and "do" too. "Use" asks how, as in "how to use conditional formatting".
 */
const QUESTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "use",
  "using",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
]);

const API_REFERENCE_PREFIX = "/docs/api/";

/** A title or query compared without case, outer spaces or a trailing "()". */
function normalized(text: string): string {
  return text.trim().toLowerCase().replace(/\(\)$/u, "");
}

/**
 * The query Pagefind receives: the question without its question words. A
 * query made only of such words stays as typed.
 */
export function searchTerms(query: string): string {
  const words = query.trim().split(/\s+/u).filter(Boolean);
  const kept = words.filter((word) => !QUESTION_WORDS.has(word.toLowerCase()));
  return (kept.length === 0 ? words : kept).join(" ");
}

/**
 * A query that names code (`createGrid`, `XLOOKUP`, `grid.sort`), as opposed
 * to plain words. Plain words look for a guide before the API reference.
 */
function namesCode(query: string): boolean {
  return /[a-z][A-Z]|[.()]|^[A-Z0-9.]{2,}$/u.test(query.trim());
}

/** The word without a plural "s": "datasources" names the same page as "datasource". */
function singular(word: string): string {
  return word.length > ENDING_LENGTH ? word.replace(/s$/u, "") : word;
}

/** The text holds the word, give or take its ending. */
function holdsWord(text: string, word: string): boolean {
  return text.includes(word.length > ENDING_LENGTH + 2 ? word.slice(0, -ENDING_LENGTH) : word);
}

/**
 * The section of a page named exactly by the query: a heading with that
 * text, or the row of the formula function with that name
 * (scripts/formula-docs.ts gives each row the id `fn-<name>`).
 */
function exactSection(data: PagefindResultData, query: string): SearchEntry | undefined {
  const functionId = `fn-${query.replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/(^-|-$)/gu, "")}`;
  for (const anchor of data.anchors ?? []) {
    const isHeading = /^h\d$/iu.test(anchor.element) && normalized(anchor.text ?? "") === query;
    if (!isHeading && anchor.id !== functionId) continue;
    return {
      url: `${data.url}#${anchor.id}`,
      title: isHeading ? (anchor.text ?? "").trim() : query.toUpperCase(),
      excerpt: data.meta.title ?? "",
    };
  }
  return undefined;
}

/**
 * Every word of the query is in the page, give or take its ending. Pagefind
 * also returns pages for a query that matches no word at all, which are
 * not results.
 */
function containsQuery(data: PagefindResultData, words: readonly string[]): boolean {
  const text = `${data.meta.title ?? ""} ${data.content}`.toLowerCase();
  return words.every((word) => holdsWord(text, word));
}

/**
 * For a query of several words, the first heading that holds them as one
 * phrase: "find all" names "Options and Find All in the find bar".
 */
function phraseSection(data: PagefindResultData, query: string): SearchEntry | undefined {
  for (const anchor of data.anchors ?? []) {
    const text = anchor.text ?? "";
    if (!/^h\d$/iu.test(anchor.element) || !normalized(text).includes(query)) continue;
    return { url: `${data.url}#${anchor.id}`, title: text.trim(), excerpt: data.meta.title ?? "" };
  }
  return undefined;
}

function entriesFor(data: PagefindResultData, exact: SearchEntry | undefined): SearchEntry[] {
  const page: SearchEntry = {
    url: data.url,
    title: data.meta.title ?? data.url,
    package: data.meta.package,
    excerpt: data.excerpt,
  };
  const anchored = (data.sub_results ?? [])
    .filter((sub) => sub.url.includes("#") && !GENERIC_SECTIONS.has(sub.title.trim()))
    .slice(0, SECTIONS_PER_PAGE)
    .map((sub) => ({ url: sub.url, title: sub.title, excerpt: sub.excerpt }));
  return exact === undefined ? [page, ...anchored] : [exact, page, ...anchored];
}

/** How well a page answers the query; a lower tier ranks first. */
interface Ranked {
  page: PagefindResultData;
  exact: SearchEntry | undefined;
  order: number;
  tier: number;
  isApiReference: boolean;
}

const TIER_TITLE = 0;
const TIER_SECTION = 1;
const TIER_GUIDE_NAMED = 2;
const TIER_TITLE_WORDS_OR_PHRASE = 3;
const TIER_OTHER = 4;

/** Letters two long words share at their start when they name one thing: "formats" and "formatting". */
const SHARED_STEM_LENGTH = 6;

/** Two words name the same thing: equal but for a plural "s", or long words with one stem. */
function sameWord(left: string, right: string): boolean {
  if (singular(left) === singular(right)) return true;
  return (
    left.length >= SHARED_STEM_LENGTH &&
    right.length >= SHARED_STEM_LENGTH &&
    left.slice(0, SHARED_STEM_LENGTH) === right.slice(0, SHARED_STEM_LENGTH)
  );
}

function rankPage(
  page: PagefindResultData,
  order: number,
  query: string,
  words: readonly string[],
): Ranked {
  const title = normalized(page.meta.title ?? "");
  const isApiReference = page.url.startsWith(API_REFERENCE_PREFIX);
  const ranked = (tier: number, exact?: SearchEntry): Ranked => ({
    page,
    exact,
    order,
    tier,
    isApiReference,
  });
  if (title === query || singular(title) === singular(query)) return ranked(TIER_TITLE);
  const exact = exactSection(page, query);
  if (exact !== undefined) return ranked(TIER_SECTION, exact);
  if (words.length < 2) return ranked(TIER_OTHER);
  // A question names a guide by its title: "use sheetwrite with react" names
  // React, "add a chart" names Charts. API pages are left out: their one-word
  // titles (Grid, Range, Theme) are words of many questions.
  const titleWords = title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && !QUESTION_WORDS.has(word));
  if (
    !isApiReference &&
    titleWords.length > 0 &&
    titleWords.every((titleWord) => words.some((word) => sameWord(word, titleWord)))
  ) {
    return ranked(TIER_GUIDE_NAMED);
  }
  if (title.includes(query) || words.every((word) => holdsWord(title, word))) {
    return ranked(TIER_TITLE_WORDS_OR_PHRASE);
  }
  const phrase = phraseSection(page, query);
  return phrase === undefined ? ranked(TIER_OTHER) : ranked(TIER_TITLE_WORDS_OR_PHRASE, phrase);
}

/**
 * The entries to show for `rawQuery`, from Pagefind's pages in its order:
 * first the pages titled as the query, then the pages with a section of that
 * name (shown first, above its page). For a query of several words, the
 * guides whose every title word the query names come next ("how do I use
 * sheetwrite with react" names React), then the pages whose title holds every
 * word, or whose title or a heading holds them as one phrase, so "data
 * validation" finds the Data Validation guide before the API types whose
 * names hold both words. Then the rest. Within a
 * tier, a query in plain words lists guides before the API reference; a query
 * that names code keeps Pagefind's order.
 */
export function rankEntries(pages: readonly PagefindResultData[], rawQuery: string): SearchEntry[] {
  const terms = searchTerms(rawQuery);
  const query = normalized(terms);
  const words = query.split(/\s+/u).filter(Boolean);
  const guidesFirst = !namesCode(terms);
  const ranked = pages
    .filter((page) => containsQuery(page, words))
    .map((page, order) => rankPage(page, order, query, words))
    .sort(
      (left, right) =>
        left.tier - right.tier ||
        (guidesFirst ? Number(left.isApiReference) - Number(right.isApiReference) : 0) ||
        left.order - right.order,
    )
    .slice(0, SHOWN_PAGES);
  const seen = new Set<string>();
  const entries: SearchEntry[] = [];
  for (const { page, exact } of ranked) {
    for (const entry of entriesFor(page, exact)) {
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      entries.push(entry);
    }
  }
  return entries;
}
