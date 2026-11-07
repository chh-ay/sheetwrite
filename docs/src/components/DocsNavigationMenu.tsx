import { type RefObject, useEffect, useRef, useState } from "react";

import type { DocsTabId } from "../lib/navigation.js";
import { NavigationSections } from "./DocsNavigation.js";
import { Icon } from "./Icon.js";

/**
 * Keep the sidebar only when it fits beside the reading panel; smaller
 * viewports use the same navigation in a modal drawer.
 */
const RAIL_VIEWPORT_QUERY = "(min-width: 64rem)";
const NAVIGATION_DIALOG_ID = "sw-docs-navigation";

interface NavigationDrawerProps {
  activeHref?: string;
  tab: DocsTabId;
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Asks the modal to close; Escape and the browser's own close report via onClosed. */
  onDismiss: () => void;
  onClosed: () => void;
}

/**
 * The section list for viewports without room for the sidebar. A modal dialog
 * brings the focus trap, Escape handling, backdrop, and focus restore with it;
 * the header button only opens it.
 */
function NavigationDrawer({
  activeHref,
  tab,
  dialogRef,
  onDismiss,
  onClosed,
}: Readonly<NavigationDrawerProps>) {
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- a modal dialog already closes on Escape, so the backdrop click needs no second key handler.
    <dialog
      aria-label="Documentation"
      className="sw-nav-dialog"
      id={NAVIGATION_DIALOG_ID}
      onClick={(event) => {
        // Only the backdrop targets the dialog itself: its children fill it.
        if (event.target === event.currentTarget) onDismiss();
      }}
      onClose={onClosed}
      ref={dialogRef}
    >
      <div className="sw-nav-dialog__head">
        <span className="sw-nav-dialog__title">Documentation</span>
        <button
          aria-label="Close documentation menu"
          className="sw-icon-button"
          onClick={onDismiss}
          type="button"
        >
          <Icon name="close" size="md" />
        </button>
      </div>
      <NavigationSections activeHref={activeHref} onNavigate={onDismiss} tab={tab} />
    </dialog>
  );
}

/**
 * The documentation menu: the top bar's button and the drawer it opens, with
 * all of their state, so the shell around them renders no client state.
 */
export function DocsNavigationMenu({
  activeHref,
  tab,
}: Readonly<{ activeHref?: string; tab: DocsTabId }>) {
  const navigationDialog = useRef<HTMLDialogElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);

  // A drawer left open while the viewport grows would sit on top of the rail.
  useEffect(() => {
    const rail = window.matchMedia(RAIL_VIEWPORT_QUERY);
    const closeWhenRailFits = (event: MediaQueryListEvent) => {
      if (event.matches) navigationDialog.current?.close();
    };
    rail.addEventListener("change", closeWhenRailFits);
    return () => rail.removeEventListener("change", closeWhenRailFits);
  }, []);

  const openNavigation = () => {
    const dialog = navigationDialog.current;
    if (dialog === null) return;

    dialog.showModal();
    setNavigationOpen(true);
    // The current page can sit far down a long section list.
    requestAnimationFrame(() => {
      dialog
        .querySelector<HTMLElement>('a[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <>
      <button
        aria-controls={NAVIGATION_DIALOG_ID}
        aria-expanded={navigationOpen}
        aria-haspopup="dialog"
        className="sw-icon-button sw-nav-toggle"
        onClick={openNavigation}
        type="button"
      >
        <Icon name="menu" size="md" />
        <span className="sw-visually-hidden">Documentation menu</span>
      </button>
      <NavigationDrawer
        activeHref={activeHref}
        dialogRef={navigationDialog}
        onClosed={() => setNavigationOpen(false)}
        onDismiss={() => navigationDialog.current?.close()}
        tab={tab}
      />
    </>
  );
}
