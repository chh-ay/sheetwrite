import { type ErrorComponentProps, Link, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DocsShell } from "./DocsShell.js";
import { SiteTopbar } from "./SiteTopbar.js";

/** Site page for any URL without a route. Documentation URLs have their own. */
export function SiteNotFound() {
  return (
    <SitePage>
      <h1>Page not found</h1>
      <p>This page does not exist. It may have moved.</p>
      <p>
        <Link to="/">Home</Link> · <Link to="/docs/">Documentation</Link> ·{" "}
        <Link to="/showcases/">Showcases</Link>
      </p>
    </SitePage>
  );
}

/**
 * Shown when a route throws while it loads or renders. It replaces the
 * router's plain default with the site chrome, so the reader can retry this
 * page or leave it. Documentation pages use the documentation layout, whose
 * styles are the only ones those pages load.
 */
export function SiteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  const actions = (
    <p className="sw-route-fallback__actions">
      <button
        onClick={() => {
          reset();
          void router.invalidate();
        }}
        type="button"
      >
        Try again
      </button>{" "}
      <Link to="/">Home</Link>
    </p>
  );
  if (pathname.startsWith("/docs/")) {
    return (
      <DocsShell activeHref="" description={message} title="This page stopped working">
        <div role="alert">{actions}</div>
      </DocsShell>
    );
  }
  return (
    <SitePage alert>
      <h1>This page stopped working</h1>
      <p>{message}</p>
      {actions}
    </SitePage>
  );
}

function SitePage({ alert = false, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <div className="sw-showcase-frame">
      <SiteTopbar />
      <main
        className="sw-showcase-page sw-route-fallback"
        id="main-content"
        role={alert ? "alert" : undefined}
      >
        {children}
      </main>
    </div>
  );
}
