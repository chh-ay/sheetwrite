import { Button } from "@base-ui/react/button";
import type { ComponentProps } from "react";

/** Props of {@link DemoButton}: a Base UI button with the site's button variants. */
export type DemoButtonProps = ComponentProps<typeof Button> & {
  variant?: "default" | "primary" | "quiet";
};

/** A showcase control rendered as the site's shared `.sw-button`. */
export function DemoButton({ className = "", variant = "default", ...props }: DemoButtonProps) {
  return <Button {...props} className={`sw-button ${className}`.trim()} data-variant={variant} />;
}
