import type { CSSProperties, ReactNode, RefObject } from "react";

import { Icon, type IconName } from "../components/Icon.js";
import { DemoButton, type DemoButtonProps } from "./ui/DemoButton.js";

import "../styles/feature-showcases.css";

/** A full-width side-panel button with a leading icon. */
export function ControlButton({
  icon,
  children,
  className = "",
  ...props
}: DemoButtonProps & { readonly icon: IconName; readonly children: ReactNode }) {
  return (
    <DemoButton className={`sw-button sw-feature-button ${className}`.trim()} {...props}>
      <Icon name={icon} />
      <span>{children}</span>
    </DemoButton>
  );
}

/** A stack of {@link ControlButton}s. */
export function ControlActions({ children }: { readonly children: ReactNode }) {
  return <div className="sw-feature-actions">{children}</div>;
}

/** Empty rows a sized grid keeps under its data, so the last row never meets the tabs. */
const GRID_SPARE_ROWS = 2;

/**
 * The live grid of a showcase. Without `rows` it takes the shared stage height;
 * with `rows`, where the panel follows the demo it fits that many sheet rows
 * plus a small margin, so short data does not sit above a band of empty rows.
 */
export function DemoGrid({
  hostRef,
  label,
  testId,
  rows,
}: {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly label: string;
  readonly testId: string;
  readonly rows?: number;
}) {
  const style =
    rows === undefined
      ? undefined
      : ({ "--sw-feature-grid-rows": rows + GRID_SPARE_ROWS } as CSSProperties);
  return (
    <div
      aria-label={label}
      className="sw-showcase__grid sw-feature-grid"
      data-sized={rows !== undefined}
      data-testid={testId}
      ref={hostRef}
      style={style}
    />
  );
}
