import { iconHref } from "../icons/icon-href.js";
import type { PerfIconName } from "../lib/perf-bars.js";
import { renderSpeedupStory, type StoryMachine } from "../lib/speedup-story.js";

function spriteIcon(name: PerfIconName): string {
  return `<svg aria-hidden="true" class="sw-icon" data-size="sm" focusable="false"><use href="${iconHref(name)}"></use></svg>`;
}

/**
 * The speed story on a React page: the same static markup the Performance
 * pages carry, so the switch and disclosures need no client code.
 */
export default function SpeedupBars({
  id,
  machines,
}: Readonly<{ id: string; machines: readonly StoryMachine[] }>) {
  return (
    <div
      className="speed-story-host"
      // The renderer escapes every text value; the markup is built from committed captures.
      dangerouslySetInnerHTML={{
        __html: renderSpeedupStory({ id, baseName: "Handsontable", machines }, spriteIcon),
      }}
    />
  );
}
