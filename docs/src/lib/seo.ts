import type { Crumb } from "./navigation.js";

/**
 * Production origin; canonical URLs, the sitemap, social cards, structured
 * data, the llms files and IndexNow all use it. Vercel redirects the bare
 * domain and the vercel.app address here, so this is the one indexed host.
 */
export const SITE_URL = "https://www.sheetwrite.dev";

const BRAND_SUFFIX = " — Sheetwrite";
/** Search results cut titles at about 60 characters, so longer ones drop the brand. */
const TITLE_LIMIT = 60;

/**
 * A page's `<title>`: its name and the brand, or the name alone when both do
 * not fit in a search result. `og:site_name` still carries the brand.
 */
export function pageTitle(name: string): string {
  const branded = `${name}${BRAND_SUFFIX}`;
  return branded.length <= TITLE_LIMIT ? branded : name;
}

/**
 * Page title/description mirrored into the OG/Twitter card tags. Route-level
 * meta overrides the root defaults key-by-key, so every page shares one
 * social-card contract without repeating the tag list.
 */
export function pageMeta(title: string, description: string) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

/**
 * Structured data for one documentation page: the article itself, and the
 * breadcrumb trail the page header shows, so search results can show where
 * the page sits. The JSON is escaped for an inline script element.
 */
export function documentStructuredData(page: {
  title: string;
  description: string;
  href: string;
  trail: readonly Crumb[];
}): string {
  const url = new URL(page.href, SITE_URL).href;
  const graph = [
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      headline: page.title,
      description: page.description,
      url,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#source` },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: page.trail.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.label,
        // The last crumb is the page itself; a section without its own page
        // has no URL, which the schema allows.
        ...(crumb.href !== undefined
          ? { item: new URL(crumb.href, SITE_URL).href }
          : index === page.trail.length - 1
            ? { item: url }
            : {}),
      })),
    },
  ];

  // "</" would end the script element early if a title ever held it.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll(
    "</",
    "<\\/",
  );
}
