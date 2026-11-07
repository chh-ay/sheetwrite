import { Link, useLocation } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";

import { opensFreshDocument } from "../lib/site-links.js";

/** Files served as-is: the router has no page for them. */
const STATIC_FILE = /\.(?:txt|xml|json|xlsx|csv|png|svg|webp|wasm)$/;

/**
 * The `a` element of documentation content. A link to another site page
 * navigates on the client and preloads on intent, like the rest of the site.
 * External links, static files and links into the current page stay plain
 * anchors: the router would mark a link to the current page
 * `aria-current="page"`, which made every code symbol on an API page that
 * names the page's own symbol announce itself as the current page.
 */
export function ContentLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const currentPath = useLocation({ select: (location) => location.pathname });
  if (href === undefined || !href.startsWith("/") || href.startsWith("//")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  const [pathAndSearch = href, hash] = href.split("#", 2);
  const [path = pathAndSearch] = pathAndSearch.split("?", 1);
  if (STATIC_FILE.test(path) || pathAndSearch.includes("?") || path === currentPath) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    // A link is never current: the current page's links are plain anchors.
    // Exact matching keeps a link to a parent page (`/docs/`) from matching.
    <Link
      {...rest}
      activeOptions={{ exact: true }}
      hash={hash}
      reloadDocument={opensFreshDocument(path)}
      to={path}
    >
      {children}
    </Link>
  );
}
