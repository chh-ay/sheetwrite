import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LATEST_RELEASE, RELEASES_HREF } from "../lib/releases.js";
import type { CapabilityOwnerId } from "../showcases/capabilities.js";
import { BrandMark } from "./BrandMark.js";
import { Icon } from "./Icon.js";
import { ThemeToggle } from "./ThemeToggle.js";

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";
/**
 * The router marks any link whose path prefixes the URL as the current page
 * (`/docs/` on every release note). The section marker below is the only
 * source of `aria-current`, so the router matches exact paths only.
 */
const EXACT = { exact: true } as const;

/** Props of {@link SiteTopbar}. */
interface SiteTopbarProps {
  /**
   * Declares showcase context for routes outside `/showcases/` (the framework
   * workbenches). Routes inside the family are recognised from the URL, so a
   * page can never lose its "where am I" marker by passing the wrong id.
   */
  readonly active?: CapabilityOwnerId | "showcases";
  /** The documentation search control, on documentation pages. */
  readonly search?: ReactNode;
  /**
   * Controls after the theme toggle, such as the documentation menu button.
   * A page that brings its own menu holds the site links there on phones;
   * other pages get the site menu button.
   */
  readonly trailing?: ReactNode;
}

type Section = "docs" | "showcases" | "releases" | undefined;

function currentSection(pathname: string, active: SiteTopbarProps["active"]): Section {
  if (pathname.startsWith(RELEASES_HREF)) return "releases";
  if (pathname.startsWith("/docs/")) return "docs";
  if (pathname.startsWith("/showcases/") || active !== undefined) return "showcases";
  return undefined;
}

/**
 * The one site header: brand, Docs, Showcases, Releases, GitHub and the theme
 * toggle, on every page. Documentation pages add their search and menu button
 * through the `search` and `trailing` slots. On phones the header is one row;
 * the site links open from the menu button as a native popover (open, close,
 * Escape, light dismiss and focus come from the browser, without script).
 */
export function SiteTopbar({ active, search, trailing }: SiteTopbarProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const section = currentSection(pathname, active);
  // The landing pages of each section are the destination; deeper pages are
  // inside the section.
  const marker = (name: Exclude<Section, undefined>, href: string) =>
    section !== name ? undefined : pathname === href ? ("page" as const) : ("true" as const);

  return (
    <header className="sw-header" data-has-search={search !== undefined}>
      <Link aria-label="Sheetwrite home" className="sw-header__brand" to="/">
        <BrandMark />
        <span>Sheetwrite</span>
      </Link>
      <nav aria-label="Site" className="sw-header__nav" id="site-nav" popover="auto">
        <Link activeOptions={EXACT} aria-current={marker("docs", "/docs/")} to="/docs/">
          Docs
        </Link>
        <Link
          activeOptions={EXACT}
          aria-current={marker("showcases", "/showcases/")}
          to="/showcases/"
        >
          Showcases
        </Link>
        <Link
          activeOptions={EXACT}
          aria-current={marker("releases", RELEASES_HREF)}
          to={RELEASES_HREF}
        >
          Releases
          <span className="sw-header__version">v{LATEST_RELEASE.version}</span>
        </Link>
        <a className="sw-header__nav-github" href={REPOSITORY_URL}>
          GitHub
        </a>
      </nav>
      {search !== undefined && <div className="sw-header__search">{search}</div>}
      <div className="sw-header__actions">
        <a className="sw-header__link" href={REPOSITORY_URL}>
          GitHub
        </a>
        <ThemeToggle />
        {trailing ?? (
          <button
            aria-label="Site menu"
            className="sw-icon-button sw-header__menu"
            popoverTarget="site-nav"
            type="button"
          >
            <Icon name="menu" />
          </button>
        )}
      </div>
    </header>
  );
}
