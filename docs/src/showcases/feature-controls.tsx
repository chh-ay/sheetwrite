import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DemoButton, type DemoButtonProps } from "./ui/DemoButton.js";

import "../styles/feature-showcases.css";

/** A full-width side-panel button with a leading icon. */
export function ControlButton({
  icon: Icon,
  children,
  className = "",
  ...props
}: DemoButtonProps & { readonly icon: LucideIcon; readonly children: ReactNode }) {
  return (
    <DemoButton className={`sw-button sw-feature-button ${className}`.trim()} {...props}>
      <Icon aria-hidden="true" className="sw-icon" />
      <span>{children}</span>
    </DemoButton>
  );
}

/** A stack of {@link ControlButton}s. */
export function ControlActions({ children }: { readonly children: ReactNode }) {
  return <div className="sw-feature-actions">{children}</div>;
}

/** The live grid of a showcase, sized by the shared stage height. */
export function DemoGrid({
  hostRef,
  label,
  testId,
}: {
  readonly hostRef: React.RefObject<HTMLDivElement | null>;
  readonly label: string;
  readonly testId: string;
}) {
  return (
    <div aria-label={label} className="sw-showcase__grid" data-testid={testId} ref={hostRef} />
  );
}
