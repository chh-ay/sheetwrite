import { DemoRadioGroup, DemoRadioItem } from "./DemoRadioGroup.js";
import type { RenderingMode } from "./rendering-mode.js";

interface DemoRenderingModeProps {
  label: string;
  mode: RenderingMode;
  onModeChange: (mode: RenderingMode) => void;
}

export function DemoRenderingMode({ label, mode, onModeChange }: DemoRenderingModeProps) {
  return (
    <div className="sw-demo-render-mode">
      <span className="sw-demo-render-mode__label">{label}</span>
      <DemoRadioGroup
        className="sw-demo-render-mode__control"
        label={label}
        value={mode}
        onValueChange={onModeChange}
      >
        <DemoRadioItem className="sw-demo-render-mode__option" value="canvas">
          Main thread
        </DemoRadioItem>
        <DemoRadioItem className="sw-demo-render-mode__option" value="worker">
          Web Worker
        </DemoRadioItem>
      </DemoRadioGroup>
    </div>
  );
}
