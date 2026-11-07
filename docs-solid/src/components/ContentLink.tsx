import { Link, useLocation } from "@tanstack/solid-router";
import { type JSX, Show, splitProps } from "solid-js";

import { ISLANDS } from "../islands/Island.js";

/** Files served as-is: the router has no page for them. */
const STATIC_FILE = /\.(?:txt|xml|json|xlsx|csv|png|svg|webp|wasm)$/;

/**
 * The `a` element of documentation content. With full hydration a link to
 * another site page navigates on the client; static pages and external links,
 * static files and links into the current page stay plain anchors.
 */
export function ContentLink(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [own, rest] = splitProps(props, ["href", "children"]);
  const location = useLocation();
  const routed = () => {
    const href = own.href;
    if (ISLANDS || href === undefined || !href.startsWith("/") || href.startsWith("//")) {
      return undefined;
    }
    const [pathAndSearch = href, hash] = href.split("#", 2);
    const [path = pathAndSearch] = pathAndSearch.split("?", 1);
    if (STATIC_FILE.test(path) || pathAndSearch.includes("?") || path === location().pathname) {
      return undefined;
    }
    return { path, hash };
  };
  return (
    <Show
      fallback={
        <a href={own.href} {...rest}>
          {own.children}
        </a>
      }
      when={routed()}
    >
      {(target) => (
        <Link {...rest} activeOptions={{ exact: true }} hash={target().hash} to={target().path}>
          {own.children}
        </Link>
      )}
    </Show>
  );
}
