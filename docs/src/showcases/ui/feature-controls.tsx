import { type JSX, splitProps } from "solid-js";

import { Icon, type IconName } from "../../components/Icon.js";
import { Button, type ButtonProps } from "./Button.js";

/** A full-width side-panel button with a leading icon. Styles: styles/feature-showcases.css. */
export function ControlButton(props: ButtonProps & { readonly icon: IconName }) {
  const [local, rest] = splitProps(props, ["icon", "children", "class"]);
  return (
    <Button class={["sw-feature-button", local.class].filter(Boolean).join(" ")} {...rest}>
      <Icon name={local.icon} />
      <span>{local.children}</span>
    </Button>
  );
}

/** A stack of {@link ControlButton}s. */
export function ControlActions(props: { readonly children: JSX.Element }) {
  return <div class="sw-feature-actions">{props.children}</div>;
}

/** The empty row a sized grid keeps under its data, so the last row never meets the tabs. */
const GRID_SPARE_ROWS = 1;

/**
 * The live grid of a showcase. Without `rows` it takes the shared stage height;
 * with `rows`, it fits that many sheet rows plus one, so short data does not
 * sit above a band of empty rows.
 */
export function DemoGrid(props: {
  readonly host: (element: HTMLElement) => void;
  readonly label: string;
  readonly testId: string;
  readonly rows?: number;
}) {
  return (
    <div
      aria-label={props.label}
      class="sw-showcase__grid sw-feature-grid"
      data-sized={props.rows !== undefined}
      data-testid={props.testId}
      ref={props.host}
      style={
        props.rows === undefined
          ? undefined
          : { "--sw-feature-grid-rows": String(props.rows + GRID_SPARE_ROWS) }
      }
    />
  );
}
