/**
 * `bun run docs:check-site`: checks the packaged docs deployment
 * (`.vercel/output`, from `bun run docs:prepare-deployment`) the way a search
 * engine sees it, through the same routes the host serves:
 *
 * - every indexable page has a title, a description and a self-referencing
 *   canonical URL, one h1, a language, Open Graph and Twitter card tags with
 *   its own URL and a social image that answers 200, and no other indexable
 *   page shares its title or description; test fixtures and the proof page
 *   carry `noindex`;
 * - every docs page has a BreadcrumbList with Google's required fields, and
 *   each crumb links an indexable page that answers 200;
 * - internal links answer 200 without a redirect;
 * - the sitemap lists exactly the indexable pages, each answering 200;
 * - every URL of the published site (`docs/published-urls.txt`) still opens
 *   a page, directly or through a permanent redirect;
 * - the main content of every page is in its static HTML, and a sample of
 *   pages carries enough text, headings, links and code without JavaScript.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { SITE_URL } from "../docs/src/lib/seo.js";

const repository_root = resolve(import.meta.dir, "..");
const PUBLISHED_URLS = join(repository_root, "docs/published-urls.txt");
const NOINDEX_ROUTES = [/^\/test\//, /^\/docs\/proof\//, /^\/404\/$/];
/** Fewer characters of main text than this is a page whose content renders only in the browser. */
const MIN_MAIN_TEXT = 200;
const PERMANENT = new Set([301, 308]);
const MAX_REDIRECTS = 2;
/** Social card tags every indexable page needs, besides `og:url` and `og:image`. */
const SOCIAL_TAGS = ["og:title", "og:description", "og:type", "twitter:card"];
/** More sitemap URLs than this cannot all have changed on one day: the dates are build dates. */
const ONE_DATE_LIMIT = 50;

/**
 * One page of each kind, with what its static HTML must hold inside `<main>`:
 * text length, h2/h3 headings, internal links, and whether it has code
 * samples. Each number is about half of what the page holds, so content edits
 * pass and content that renders only in the browser fails.
 */
const CONTENT_SAMPLE: readonly {
  path: string;
  text: number;
  headings: number;
  links: number;
  code: boolean;
}[] = [
  { path: "/", text: 10000, headings: 4, links: 50, code: true },
  { path: "/docs/", text: 1000, headings: 2, links: 8, code: false },
  { path: "/docs/start/first-grid/", text: 2000, headings: 3, links: 20, code: true },
  { path: "/docs/features/analysis/charts/", text: 6000, headings: 5, links: 50, code: true },
  { path: "/docs/tutorials/excel-in-react/", text: 3500, headings: 1, links: 80, code: true },
  { path: "/docs/api/", text: 2000, headings: 4, links: 30, code: false },
  { path: "/docs/api/core/", text: 15000, headings: 3, links: 200, code: false },
  { path: "/docs/api/core/create-grid/", text: 700, headings: 3, links: 20, code: true },
  {
    path: "/docs/reference/formula-functions/",
    text: 15000,
    headings: 10,
    links: 200,
    code: false,
  },
  {
    path: "/docs/reference/formula-functions/math/",
    text: 3000,
    headings: 1,
    links: 3,
    code: true,
  },
  { path: "/docs/releases/0.7.0/", text: 7000, headings: 10, links: 50, code: true },
  { path: "/showcases/", text: 1500, headings: 2, links: 10, code: false },
  { path: "/showcases/recalculation/", text: 1500, headings: 3, links: 30, code: false },
  // The framework workbenches mount in the browser; their panels and code are static.
  { path: "/react/", text: 2400, headings: 6, links: 50, code: true },
  { path: "/vue/", text: 2400, headings: 7, links: 30, code: true },
  { path: "/svelte/", text: 1900, headings: 5, links: 30, code: true },
];

type Route =
  | { handle: string }
  | { src: string; continue: true; headers: Record<string, string> }
  | { src: string; status: number; headers: Record<string, string> }
  | { src: string; dest: string; status?: number };

interface Answer {
  status: number;
  location?: string;
  file?: string;
}

/** Answers a request path the way the host applies `config.json` routes. */
function route_request(routes: readonly Route[], static_root: string, pathname: string): Answer {
  for (const route of routes) {
    if ("handle" in route) {
      if (route.handle !== "filesystem") continue;
      const file = join(static_root, decodeURIComponent(pathname));
      if (existsSync(file) && statSync(file).isFile()) return { status: 200, file };
      continue;
    }
    // The host matches route patterns without regard to case.
    const match = new RegExp(route.src, "i").exec(pathname);
    if (match === null || "continue" in route) continue;
    if ("dest" in route) {
      return { status: route.status ?? 200, file: join(static_root, route.dest) };
    }
    const location = route.headers.Location?.replace(
      /\$(\d)/g,
      (_, group: string) => match[Number(group)] ?? "",
    );
    return { status: route.status, location };
  }
  return { status: 404 };
}

interface Page {
  path: string;
  title: string;
  description: string;
  robots: string;
  canonical: string;
  /** `og:*` and `twitter:*` meta tags by name. */
  social: Map<string, string>;
  lang: string;
  h1: number;
  jsonLd: string[];
  mainText: number;
  mainHeadings: number;
  mainLinks: number;
  mainCode: number;
  hasMain: boolean;
  links: string[];
}

/** Reads what a crawler reads from a page's static HTML. */
async function read_page(path: string, html: string): Promise<Page> {
  const page: Page = {
    path,
    title: "",
    description: "",
    robots: "",
    canonical: "",
    social: new Map(),
    lang: "",
    h1: 0,
    jsonLd: [],
    mainText: 0,
    mainHeadings: 0,
    mainLinks: 0,
    mainCode: 0,
    hasMain: false,
    links: [],
  };
  let in_head = false;
  let in_main = 0;
  let in_script = 0;
  let head_title = false;
  let json_ld: string | null = null;
  const meta = (name: string | null, content: string): void => {
    if (name === "description") page.description = content;
    if (name === "robots") page.robots = content;
    if (name !== null && /^(?:og|twitter):/.test(name)) page.social.set(name, content);
  };
  await new HTMLRewriter()
    .on("html", { element: (element) => void (page.lang = element.getAttribute("lang") ?? "") })
    .on("head", {
      element(element) {
        in_head = true;
        element.onEndTag(() => void (in_head = false));
      },
    })
    .on("title", {
      element(element) {
        if (!in_head || page.title !== "") return;
        head_title = true;
        element.onEndTag(() => void (head_title = false));
      },
      text(text) {
        if (head_title) page.title += text.text;
      },
    })
    .on("meta", {
      element(element) {
        if (!in_head) return;
        meta(
          element.getAttribute("name") ?? element.getAttribute("property"),
          element.getAttribute("content") ?? "",
        );
      },
    })
    .on('link[rel="canonical"]', {
      element: (element) => void (page.canonical = element.getAttribute("href") ?? ""),
    })
    .on('script[type="application/ld+json"]', {
      element(element) {
        json_ld = "";
        element.onEndTag(() => {
          page.jsonLd.push(json_ld ?? "");
          json_ld = null;
        });
      },
      text(text) {
        if (json_ld !== null) json_ld += text.text;
      },
    })
    .on("h1", { element: () => void page.h1++ })
    .on("main", {
      element(element) {
        page.hasMain = true;
        in_main++;
        element.onEndTag(() => void in_main--);
      },
    })
    .on("main script, main style, main template", {
      element(element) {
        in_script++;
        element.onEndTag(() => void in_script--);
      },
    })
    .on("main h2, main h3", { element: () => void page.mainHeadings++ })
    .on("main pre, main code", { element: () => void page.mainCode++ })
    .on("a[href]", {
      element(element) {
        const href = element.getAttribute("href") ?? "";
        page.links.push(href);
        if (in_main > 0 && (href.startsWith("/") || href.startsWith(SITE_URL))) page.mainLinks++;
      },
    })
    .onDocument({
      text(text) {
        if (in_main > 0 && in_script === 0)
          page.mainText += text.text.replace(/\s+/g, " ").trim().length;
      },
    })
    .transform(new Response(html))
    .text();
  return page;
}

function html_pages(static_root: string, directory = ""): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(join(static_root, directory), { withFileTypes: true })) {
    const relative = directory === "" ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...html_pages(static_root, relative));
    else if (entry.name === "index.html") paths.push(`/${relative.slice(0, -"index.html".length)}`);
  }
  return paths;
}

/** `item` of a ListItem: a URL string or a Thing with `@id`. */
function crumb_url(item: unknown): string | undefined {
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null && "@id" in item && typeof item["@id"] === "string")
    return item["@id"];
  return undefined;
}

function structured_items(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(structured_items);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  return "@graph" in record ? structured_items(record["@graph"]) : [record];
}

async function site_issues(
  output_root: string,
  published_urls: readonly string[],
): Promise<string[]> {
  const static_root = join(output_root, "static");
  const { routes } = JSON.parse(readFileSync(join(output_root, "config.json"), "utf8")) as {
    routes: Route[];
  };
  const answers = new Map<string, Answer>();
  const answer = (pathname: string): Answer => {
    let known = answers.get(pathname);
    if (known === undefined) {
      known = route_request(routes, static_root, pathname);
      answers.set(pathname, known);
    }
    return known;
  };
  const issues: string[] = [];
  const pages = new Map<string, Page>();
  for (const path of html_pages(static_root)) {
    pages.set(
      path,
      await read_page(path, readFileSync(join(static_root, path, "index.html"), "utf8")),
    );
  }
  const indexable = (path: string): boolean => {
    const page = pages.get(path);
    return page !== undefined && !/noindex/i.test(page.robots);
  };
  /** A path that answers 200 with a page, without a redirect. */
  const opens = (path: string): boolean => answer(path).status === 200 && pages.has(path);

  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  for (const page of pages.values()) {
    const where = page.path;
    if (NOINDEX_ROUTES.some((route) => route.test(where))) {
      if (!/noindex/i.test(page.robots))
        issues.push(`${where}: a fixture or proof page without robots noindex`);
      continue;
    }
    if (!/noindex/i.test(page.robots) && !/\bindex\b/i.test(page.robots)) {
      issues.push(`${where}: robots meta is "${page.robots}", not index, follow`);
    }
    if (!indexable(where)) continue;
    const url = `${SITE_URL}${where}`;
    if (page.title.trim() === "") issues.push(`${where}: no <title>`);
    if (page.description.trim() === "") issues.push(`${where}: no meta description`);
    if (page.canonical !== url)
      issues.push(`${where}: canonical is "${page.canonical}", not ${url}`);
    for (const tag of SOCIAL_TAGS) {
      if ((page.social.get(tag) ?? "").trim() === "") issues.push(`${where}: no ${tag}`);
    }
    const og_url = page.social.get("og:url") ?? "";
    if (og_url !== url) issues.push(`${where}: og:url is "${og_url}", not ${url}`);
    const og_image = page.social.get("og:image") ?? "";
    if (!og_image.startsWith(`${SITE_URL}/`))
      issues.push(`${where}: og:image "${og_image}" is not an absolute site URL`);
    else if (answer(new URL(og_image).pathname).status !== 200)
      issues.push(`${where}: og:image ${og_image} does not answer 200`);
    if (page.lang === "") issues.push(`${where}: <html> has no lang`);
    if (page.h1 !== 1) issues.push(`${where}: ${page.h1} h1 headings, not 1`);
    if (!page.hasMain || page.mainText < MIN_MAIN_TEXT) {
      issues.push(`${where}: ${page.mainText} characters of main content in the static HTML`);
    }
    titles.set(page.title, [...(titles.get(page.title) ?? []), where]);
    descriptions.set(page.description, [...(descriptions.get(page.description) ?? []), where]);

    let breadcrumbs = 0;
    for (const source of page.jsonLd) {
      let data: unknown;
      try {
        data = JSON.parse(source);
      } catch {
        issues.push(`${where}: JSON-LD does not parse`);
        continue;
      }
      for (const item of structured_items(data)) {
        if (item["@type"] !== "BreadcrumbList") continue;
        breadcrumbs++;
        const elements = item.itemListElement;
        if (!Array.isArray(elements) || elements.length === 0) {
          issues.push(`${where}: BreadcrumbList without itemListElement`);
          continue;
        }
        elements.forEach((element: Record<string, unknown>, index) => {
          const crumb = `${where}: breadcrumb ${index + 1}`;
          if (element["@type"] !== "ListItem") issues.push(`${crumb} is not a ListItem`);
          if (element.position !== index + 1)
            issues.push(`${crumb} has position ${String(element.position)}`);
          if (typeof element.name !== "string" || element.name.trim() === "")
            issues.push(`${crumb} has no name`);
          const target = crumb_url(element.item);
          // Google requires `item` on every crumb but the last.
          if (target === undefined) {
            if (index < elements.length - 1) issues.push(`${crumb} has no item URL`);
            return;
          }
          if (!target.startsWith(`${SITE_URL}/`)) {
            issues.push(`${crumb} item "${target}" is not an absolute site URL`);
            return;
          }
          const target_path = new URL(target).pathname;
          if (!opens(target_path) || !indexable(target_path)) {
            issues.push(`${crumb} item ${target} is not an indexable page that answers 200`);
          }
        });
      }
    }
    if (where.startsWith("/docs/") && breadcrumbs !== 1)
      issues.push(`${where}: ${breadcrumbs} BreadcrumbList items, not 1`);
  }
  for (const [label, seen] of [
    ["title", titles],
    ["description", descriptions],
  ] as const) {
    for (const [text, paths] of seen) {
      if (paths.length > 1)
        issues.push(
          `${paths.length} pages share the ${label} "${text}": ${paths.slice(0, 5).join(" ")}`,
        );
    }
  }

  const broken = new Map<string, Set<string>>();
  for (const page of pages.values()) {
    for (const href of page.links) {
      if (href.startsWith("#") || /^(?:mailto|tel):/.test(href)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(`${SITE_URL}/`)) continue;
      if (!href.startsWith("/") && !href.startsWith(`${SITE_URL}/`)) {
        issues.push(`${page.path}: link "${href}" is not an absolute path`);
        continue;
      }
      const pathname = decodeURI(new URL(href, SITE_URL).pathname);
      const status = answer(pathname);
      if (status.status !== 200) {
        const label = `${pathname} (${status.status}${status.location === undefined ? "" : ` to ${status.location}`})`;
        broken.set(label, (broken.get(label) ?? new Set()).add(page.path));
      }
    }
  }
  for (const [link, from] of broken) {
    issues.push(
      `link to ${link} from ${[...from].slice(0, 3).join(" ")}${from.size > 3 ? ` and ${from.size - 3} more` : ""}`,
    );
  }

  const sitemap = readFileSync(join(static_root, "sitemap.xml"), "utf8");
  const listed = new Set<string>();
  const lastmods = new Set<string>();
  for (const entry of sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "";
    if (!loc.startsWith(`${SITE_URL}/`)) {
      issues.push(`sitemap lists "${loc}", not a site URL`);
      continue;
    }
    const path = new URL(loc).pathname;
    listed.add(path);
    if (!opens(path)) issues.push(`sitemap lists ${path}, which answers ${answer(path).status}`);
    else if (!indexable(path)) issues.push(`sitemap lists ${path}, which is noindex`);
    const lastmod = entry.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
    if (lastmod === undefined) issues.push(`sitemap entry ${path} has no lastmod`);
    else lastmods.add(lastmod);
  }
  if (listed.size > ONE_DATE_LIMIT && lastmods.size === 1)
    issues.push(
      `all ${listed.size} sitemap entries have lastmod ${[...lastmods].join("")}; build from a full clone so each page gets its last source commit`,
    );
  for (const path of pages.keys()) {
    if (indexable(path) && !listed.has(path))
      issues.push(`sitemap omits the indexable page ${path}`);
  }
  const robots = readFileSync(join(static_root, "robots.txt"), "utf8");
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) issues.push("robots.txt disallows the whole site");
  if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`))
    issues.push("robots.txt does not name the sitemap");
  if (!existsSync(join(static_root, "llms.txt"))) issues.push("llms.txt is missing");
  const not_found = answer("/sheetwrite-missing-page/");
  if (not_found.status !== 404) issues.push(`a missing page answers ${not_found.status}, not 404`);

  for (const published of published_urls) {
    let path = published;
    const hops: string[] = [];
    let status = answer(path);
    while (status.location !== undefined && hops.length < MAX_REDIRECTS) {
      if (!PERMANENT.has(status.status)) break;
      hops.push(`${status.status} ${status.location}`);
      path = new URL(status.location, `${SITE_URL}${path}`).pathname;
      status = answer(path);
    }
    if (status.status !== 200 || !pages.has(path) || !indexable(path)) {
      issues.push(
        `published URL ${published} ${hops.length > 0 ? `redirects (${hops.join(", ")}) and ` : ""}answers ${status.status}${pages.has(path) && !indexable(path) ? " with a noindex page" : ""}`,
      );
    }
  }

  for (const sample of CONTENT_SAMPLE) {
    const page = pages.get(sample.path);
    if (page === undefined) {
      issues.push(`content sample ${sample.path} has no page`);
      continue;
    }
    const short = (label: string, have: number, need: number): void => {
      if (have < need)
        issues.push(
          `${sample.path}: static HTML has ${have} ${label} in <main>, expected at least ${need}`,
        );
    };
    short("characters of text", page.mainText, sample.text);
    short("h2/h3 headings", page.mainHeadings, sample.headings);
    short("internal links", page.mainLinks, sample.links);
    if (sample.code) short("code elements", page.mainCode, 1);
  }
  return issues;
}

/** The paths of the published site's sitemap, one per line; `#` starts a comment. */
function read_published_urls(path = PUBLISHED_URLS): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

if (import.meta.main) {
  const output_root = resolve(process.argv[2] ?? join(repository_root, ".vercel/output"));
  const issues = await site_issues(output_root, read_published_urls());
  if (issues.length > 0) {
    process.stderr.write(`${issues.join("\n")}\n`);
    throw new Error(`Docs site check failed: ${issues.length} issues`);
  }
  process.stdout.write("Docs site check passed\n");
}
