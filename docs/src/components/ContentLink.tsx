import { Link } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";

import { opensFreshDocument } from "../lib/navigation.js";

/** Files served as-is: the router has no page for them. */
const STATIC_FILE = /\.(?:txt|xml|json|xlsx|csv|png|svg|webp|wasm)$/;

/**
 * The `a` element of documentation content. A link to a site page navigates
 * on the client and preloads on intent, like the rest of the site; external
 * links, in-page fragments, and static files stay plain anchors.
 */
export function ContentLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href === undefined || !href.startsWith("/") || href.startsWith("//")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  const [pathAndSearch = href, hash] = href.split("#", 2);
  const [path = pathAndSearch] = pathAndSearch.split("?", 1);
  if (STATIC_FILE.test(path) || pathAndSearch.includes("?")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link {...rest} hash={hash} reloadDocument={opensFreshDocument(path)} to={path}>
      {children}
    </Link>
  );
}
