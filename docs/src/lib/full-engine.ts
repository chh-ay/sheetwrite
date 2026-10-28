import { initSheetwrite } from "@sheetwrite/core";

/** One full-page reload is allowed when an earlier page already selected the default engine. */
const ENGINE_RELOAD_KEY = "sheetwrite:formulas-engine-reload";

/** A stylesheet that never settles must not hold the Grid back for longer than this. */
const STYLES_WAIT_CAP_MS = 3_000;

/** Core's one engine-selection conflict; wrapped errors keep the original as `cause`. */
function isEngineConflict(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes("the engine cannot change")) return true;
  }

  return false;
}

/**
 * Select the full engine (`@sheetwrite/formulas`) for this page. Each page
 * selects one engine. After client navigation from a page that loaded the
 * default engine, the page reloads one time and this resolves `false`: do not
 * create a Grid then. Other failures, such as a missing WASM file, reject.
 */
export async function initFullEngine(): Promise<boolean> {
  const formulas = await import("@sheetwrite/formulas");

  try {
    await initSheetwrite(undefined, formulas);
  } catch (cause) {
    if (isEngineConflict(cause) && !sessionStorage.getItem(ENGINE_RELOAD_KEY)) {
      sessionStorage.setItem(ENGINE_RELOAD_KEY, "1");
      location.reload();
      return false;
    }

    throw cause;
  }

  sessionStorage.removeItem(ENGINE_RELOAD_KEY);
  return true;
}

/**
 * The route stylesheet can land after this page mounts, and the engine reads
 * its theme (and seeds the palette of its menus and find bar) from the host's
 * CSS variables at construction. Resolve once every pending stylesheet has
 * applied, so the first paint uses the site palette instead of engine defaults.
 */
export function whenStylesReady(): Promise<void> {
  const pending = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ).filter((link) => link.sheet === null);
  if (pending.length === 0) return Promise.resolve();

  const applied = Promise.all(
    pending.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet !== null) {
            resolve();
            return;
          }

          const done = () => resolve();
          link.addEventListener("load", done, { once: true });
          link.addEventListener("error", done, { once: true });
        }),
    ),
  ).then(() => undefined);
  const cap = new Promise<void>((resolve) => window.setTimeout(resolve, STYLES_WAIT_CAP_MS));

  return Promise.race([applied, cap]);
}
