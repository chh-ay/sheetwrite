import { type JSX, splitProps } from "solid-js";

/** Props of {@link Button}: a native button with the site's button variants. */
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "default" | "primary" | "quiet";
};

/** A showcase control rendered as the site's shared `.sw-button`. */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "type"]);
  return (
    <button
      {...rest}
      class={local.class === undefined ? "sw-button" : `sw-button ${local.class}`}
      data-variant={local.variant ?? "default"}
      type={local.type ?? "button"}
    />
  );
}
