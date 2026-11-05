import { useEffect, useRef, useState } from "react";

import { errorText } from "../../lib/errors.js";
import { Icon } from "../Icon.js";
import { LANDING_HEADERS, landingPreviewRows } from "./live-grid/landing-workbook.js";

type LiveGridState = "preview" | "loading" | "live" | "failed";

/** How long after the page's load event the grid starts when nobody reaches for it. */
const IDLE_START_TIMEOUT_MS = 2500;
const COLUMN_LETTERS = LANDING_HEADERS.map((_, index) => String.fromCharCode(65 + index));
/** Empty rows the preview paints under the totals, as the live sheet does. */
const PREVIEW_SPARE_ROWS = 3;

const STATUS_TEXT: Readonly<Record<LiveGridState, string>> = {
  preview: "Preview",
  loading: "Starting the engine",
  live: "Live",
  failed: "Preview",
};

/**
 * The hero's spreadsheet: a server-rendered preview of the workbook that
 * becomes the real engine and Grid as soon as the reader reaches for it, or
 * when the page goes idle. The preview and the live grid show the same cells,
 * so the swap does not move the page.
 */
export function LiveGrid() {
  const frameRef = useRef<HTMLDivElement>(null);
  const formulaBarRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LiveGridState>("preview");
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const formulaBar = formulaBarRef.current;
    const grid = gridRef.current;
    if (frame === null || formulaBar === null || grid === null) return undefined;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    let started = false;
    let idleHandle: number | undefined;

    const start = () => {
      if (started) return;
      started = true;
      setState("loading");
      import("./live-grid/mount-live-grid.js")
        .then(({ mountLiveGrid }) => mountLiveGrid({ formulaBar, grid }))
        .then((disposer) => {
          if (cancelled) disposer();
          else {
            dispose = disposer;
            setState("live");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setFailure(errorText(error));
          setState("failed");
        });
    };
    // Safari has no idle callback; a short timer after load serves the same purpose.
    const hasIdleCallback = typeof window.requestIdleCallback === "function";
    const startWhenIdle = () => {
      idleHandle = hasIdleCallback
        ? window.requestIdleCallback(start, { timeout: IDLE_START_TIMEOUT_MS })
        : window.setTimeout(start, IDLE_START_TIMEOUT_MS);
    };
    const intents = ["pointerenter", "focusin", "touchstart"] as const;
    for (const intent of intents)
      frame.addEventListener(intent, start, { once: true, passive: true });
    if (document.readyState === "complete") startWhenIdle();
    else window.addEventListener("load", startWhenIdle, { once: true });

    return () => {
      cancelled = true;
      for (const intent of intents) frame.removeEventListener(intent, start);
      window.removeEventListener("load", startWhenIdle);
      if (idleHandle !== undefined) {
        if (hasIdleCallback) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, []);

  return (
    <figure
      className="sw-live-grid"
      data-state={state}
      data-testid="landing-live-grid"
      ref={frameRef}
    >
      <figcaption className="sw-live-grid__bar">
        <span className="sw-live-grid__file">
          <Icon name="sheet" />
          Q3 sales.xlsx
        </span>
        <span className="sw-badge" data-tone={state === "live" ? "accent" : undefined}>
          {state === "live" ? <Icon name="live" /> : null}
          {STATUS_TEXT[state]}
        </span>
      </figcaption>
      <div className="sw-live-grid__formula" ref={formulaBarRef}>
        <span aria-hidden="true" className="sw-live-grid__preview-namebox">
          B2
        </span>
        <span aria-hidden="true" className="sw-live-grid__preview-formula">
          128
        </span>
      </div>
      <div className="sw-live-grid__sheet">
        <PreviewTable />
        {/* The Grid styles its own host, so the host sits inside a positioned layer. */}
        <div className="sw-live-grid__host">
          <div
            aria-label="Live spreadsheet"
            className="sw-live-grid__mount"
            ref={gridRef}
            role="region"
          />
        </div>
      </div>
      <p className="sw-live-grid__hint">
        {state === "failed" && failure !== null ? (
          <>The live grid could not start: {failure}</>
        ) : (
          <>
            <Icon name="formula" />
            Change a unit count or price. Revenue, share and the total recalculate.
          </>
        )}
      </p>
    </figure>
  );
}

/** The workbook's first cells as static markup, laid out like the live grid. */
function PreviewTable() {
  const rows = landingPreviewRows();
  return (
    <table aria-hidden="true" className="sw-live-grid__preview">
      <thead>
        <tr>
          <th />
          {COLUMN_LETTERS.map((letter) => (
            <th key={letter}>{letter}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr
            data-row={
              rowIndex === 0 ? "header" : rowIndex === rows.length - 1 ? "total" : undefined
            }
            key={cells[0]}
          >
            <th>{rowIndex + 1}</th>
            {cells.map((cell, colIndex) => (
              <td data-align={colIndex === 0 ? undefined : "end"} key={COLUMN_LETTERS[colIndex]}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {Array.from({ length: PREVIEW_SPARE_ROWS }, (_, index) => (
          <tr key={`spare-${rows.length + index + 1}`}>
            <th>{rows.length + index + 1}</th>
            {COLUMN_LETTERS.map((letter) => (
              <td key={letter} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
