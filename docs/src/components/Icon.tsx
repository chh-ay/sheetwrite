import { iconHref } from "../icons/icon-href.js";
import type { IconName } from "../icons/icon-names.js";

export type { IconName } from "../icons/icon-names.js";

/** Rendered size: 16, 20 or 24 px. */
export type IconSize = "sm" | "md" | "lg";

/** Props of {@link Icon}. */
export interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
  /**
   * The icon's meaning, for an icon that stands alone. Without a label the
   * icon is decorative and hidden from assistive technology, so the control
   * or text next to it must carry the meaning.
   */
  readonly label?: string;
  readonly className?: string;
}

/** One icon from the Sheetwrite sprite. */
export function Icon({ name, size = "sm", label, className }: IconProps) {
  const labelled = label !== undefined;
  return (
    <svg
      aria-hidden={labelled ? undefined : true}
      aria-label={label}
      className={className === undefined ? "sw-icon" : `sw-icon ${className}`}
      data-size={size}
      focusable="false"
      role={labelled ? "img" : undefined}
    >
      <use href={iconHref(name)} />
    </svg>
  );
}
