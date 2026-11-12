import { iconHref } from "@docs/icons/icon-href.js";
import type { IconName } from "@docs/icons/icon-names.js";
import { mergeProps } from "solid-js";

export type { IconName } from "@docs/icons/icon-names.js";

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
  readonly class?: string;
}

/** One icon from the Sheetwrite sprite. */
export function Icon(props: IconProps) {
  const merged = mergeProps({ size: "sm" as IconSize }, props);
  const labelled = () => merged.label !== undefined;
  return (
    <svg
      aria-hidden={labelled() ? undefined : true}
      aria-label={merged.label}
      class={merged.class === undefined ? "sw-icon" : `sw-icon ${merged.class}`}
      data-size={merged.size}
      focusable="false"
      role={labelled() ? "img" : undefined}
    >
      <use href={iconHref(merged.name)} />
    </svg>
  );
}
