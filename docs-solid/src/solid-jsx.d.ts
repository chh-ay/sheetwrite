import "solid-js";

/** The site's icons keep `focusable="false"` on their SVGs, as the React site renders them. */
declare module "solid-js" {
  namespace JSX {
    interface SvgSVGAttributes<T> {
      focusable?: "true" | "false";
    }
  }
}
