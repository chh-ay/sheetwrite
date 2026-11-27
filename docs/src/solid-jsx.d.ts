import "solid-js";

/** Adds SVG `focusable` to Solid's JSX types: the site's icons set `focusable="false"`. */
declare module "solid-js" {
  namespace JSX {
    interface SvgSVGAttributes<T> {
      focusable?: "true" | "false";
    }
  }
}
