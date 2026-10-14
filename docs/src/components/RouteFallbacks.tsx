import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { SiteTopbar } from "./SiteTopbar.js";

/** Site page for any URL without a route. Documentation URLs have their own. */
export function SiteNotFound() {
  return (
    <div className="sw-showcase-frame">
      <SiteTopbar />
      <main className="sw-showcase-page sw-route-fallback" id="main-content">
        <h1>Page not found</h1>
        <p>This page does not exist. It may have moved.</p>
        <p>
          <Link to="/">Home</Link> · <Link to="/docs/">Documentation</Link> ·{" "}
          <Link to="/showcases/">Showcases</Link>
        </p>
      </main>
    </div>
  );
}

/**
 * Shown when a route throws while it loads or renders. The rest of the site
 * stays usable: the reader can retry this page or leave it.
 */
export function SiteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="sw-showcase-frame">
      <SiteTopbar />
      <main className="sw-showcase-page sw-route-fallback" id="main-content" role="alert">
        <h1>This page stopped working</h1>
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
        <p>
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
      </main>
    </div>
  );
}
