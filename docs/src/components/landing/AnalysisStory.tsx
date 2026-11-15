import { For, type JSX } from "solid-js";

import { delay, secs } from "./storyParts.js";

/* ---- Analysis story: orders → pivot → chart -------------------------------------------- */

/** Orders by region; the first EMEA order changes at 6 s. */
const ORDERS = [
  ["EMEA", 3200],
  ["APAC", 6400],
  ["AMER", 2100],
  ["APAC", 3100],
  ["EMEA", 4800],
  ["AMER", 1900],
] as const;
const EDITED_ORDER = 0;
const EDITED_REVENUE = 6200;
const REGIONS = ["AMER", "APAC", "EMEA"] as const;
const EDITED_REGION = "EMEA";
/** The chart's value axis ends here, above the edited EMEA bar. */
const ANALYSIS_MAX = 12_000;
const PLOT = { x: 452, base: 236, height: 150, width: 34, pitch: 56 } as const;

const thousands = (value: number) => value.toLocaleString("en-US");
const regionTotal = (region: string, edited: boolean) =>
  ORDERS.reduce(
    (total, [name, revenue], index) =>
      name === region
        ? total + (edited && index === EDITED_ORDER ? EDITED_REVENUE : revenue)
        : total,
    0,
  );

/** A value that changes at the story's edit: the old one shows until then. */
function Changed(props: Readonly<{ before: string; after: string; x: number; y: number }>) {
  return (
    <>
      <text class="sr-cell sr-before" data-num="" x={props.x} y={props.y}>
        {props.before}
      </text>
      <text class="sr-cell sr-after" data-num="" x={props.x} y={props.y}>
        {props.after}
      </text>
    </>
  );
}

/** A chart bar's inline style: the bars rise in turn, except the edited one. */
function barStyle(index: number, edited: boolean, after: number): JSX.CSSProperties {
  // The edited bar runs one absolute timeline (sr-bar-follow), so an inline
  // delay would shift its edit away from the cells'. It holds at its old share
  // until the edit lands.
  if (edited) return { "--sr-from": regionTotal(EDITED_REGION, false) / after };
  return { "animation-delay": secs(2.2 + index * 0.2), "--sr-from": 1 };
}

export function AnalysisStory() {
  const rowY = (index: number) => 76 + index * 30;
  const grand = (edited: boolean) =>
    REGIONS.reduce((total, region) => total + regionTotal(region, edited), 0);
  return (
    <svg aria-hidden="true" class="sr sr-analysis" viewBox="0 0 640 330">
      <g>
        <rect class="sr-panel" height={250} rx={10} width={196} x={20} y={30} />
        <text class="sr-head" x={36} y={58}>
          Region
        </text>
        <text class="sr-head" data-num="" x={200} y={58}>
          Revenue
        </text>
        <For each={ORDERS}>
          {([region, revenue], index) => (
            <g>
              <line
                class="sr-rule"
                x1={28}
                x2={208}
                y1={rowY(index()) - 10}
                y2={rowY(index()) - 10}
              />
              <text class="sr-cell" x={36} y={rowY(index()) + 10}>
                {region}
              </text>
              {index() === EDITED_ORDER ? (
                <g class="sr-change" data-step="order">
                  <rect class="sr-flash" height={30} width={84} x={124} y={rowY(index()) - 10} />
                  <Changed
                    after={thousands(EDITED_REVENUE)}
                    before={thousands(revenue)}
                    x={200}
                    y={rowY(index()) + 10}
                  />
                </g>
              ) : (
                <text class="sr-cell" data-num="" x={200} y={rowY(index()) + 10}>
                  {thousands(revenue)}
                </text>
              )}
            </g>
          )}
        </For>
      </g>

      <path class="sr-link" d="M 216 86 C 226 86, 226 136, 236 136" />

      <g>
        <rect class="sr-panel" height={250} rx={10} width={178} x={236} y={30} />
        <text class="sr-head" x={252} y={58}>
          Region
        </text>
        <text class="sr-head" data-num="" x={398} y={58}>
          Sum of Revenue
        </text>
        <For each={REGIONS}>
          {(region, index) => (
            <g class="sr-pivot-row" style={delay(0.8 + index() * 0.25)}>
              <line
                class="sr-rule"
                x1={244}
                x2={406}
                y1={rowY(index()) - 10}
                y2={rowY(index()) - 10}
              />
              <text class="sr-cell" x={252} y={rowY(index()) + 10}>
                {region}
              </text>
              {region === EDITED_REGION ? (
                <g class="sr-change" data-step="pivot">
                  <rect class="sr-flash" height={30} width={84} x={322} y={rowY(index()) - 10} />
                  <Changed
                    after={thousands(regionTotal(region, true))}
                    before={thousands(regionTotal(region, false))}
                    x={398}
                    y={rowY(index()) + 10}
                  />
                </g>
              ) : (
                <text class="sr-cell" data-num="" x={398} y={rowY(index()) + 10}>
                  {thousands(regionTotal(region, false))}
                </text>
              )}
            </g>
          )}
        </For>
        <g class="sr-pivot-row" style={delay(1.6)}>
          <line class="sr-rule sr-total-rule" x1={244} x2={406} y1={166} y2={166} />
          <text class="sr-cell sr-total" x={252} y={186}>
            Grand Total
          </text>
          <g class="sr-change" data-step="pivot">
            <Changed
              after={thousands(grand(true))}
              before={thousands(grand(false))}
              x={398}
              y={186}
            />
          </g>
        </g>
      </g>

      <path class="sr-link" d="M 414 136 C 424 136, 424 120, 434 120" />

      <g>
        <rect class="sr-panel" height={250} rx={10} width={186} x={434} y={30} />
        <text class="sr-head" data-center="" x={527} y={58}>
          Revenue by region
        </text>
        <line class="sr-rule" x1={446} x2={608} y1={PLOT.base} y2={PLOT.base} />
        <For each={REGIONS}>
          {(region, index) => {
            const after = regionTotal(region, true);
            const height = (after / ANALYSIS_MAX) * PLOT.height;
            const x = PLOT.x + index() * PLOT.pitch;
            const edited = region === EDITED_REGION;
            return (
              <g>
                <rect
                  class="sr-bar"
                  data-edited={edited ? "true" : undefined}
                  height={height}
                  rx={3}
                  style={barStyle(index(), edited, after)}
                  width={PLOT.width}
                  x={x}
                  y={PLOT.base - height}
                />
                <text class="sr-cell" data-center="" x={x + PLOT.width / 2} y={PLOT.base + 18}>
                  {region}
                </text>
              </g>
            );
          }}
        </For>
      </g>

      <text class="sr-note" x={20} y={310}>
        The pivot reads the orders; the chart reads the pivot&apos;s cells.
      </text>
    </svg>
  );
}
