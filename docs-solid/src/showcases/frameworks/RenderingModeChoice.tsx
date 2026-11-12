import type { RenderingMode } from "@docs/showcases/ui/rendering-mode.js";

import { RadioGroup } from "../ui/RadioGroup.js";

const MODES: readonly { value: RenderingMode; label: string }[] = [
  { value: "canvas", label: "Main thread" },
  { value: "worker", label: "Web Worker" },
];

/** The labelled Main thread / Web Worker choice. Styles: styles/showcase.css (`sw-demo-render-mode`). */
export function RenderingModeChoice(props: {
  readonly label: string;
  readonly mode: RenderingMode;
  readonly onChange: (mode: RenderingMode) => void;
}) {
  return (
    <div class="sw-demo-render-mode">
      <span class="sw-demo-render-mode__label">{props.label}</span>
      <RadioGroup
        class="sw-demo-render-mode__control"
        label={props.label}
        onChange={props.onChange}
        options={MODES}
        value={props.mode}
      />
    </div>
  );
}
