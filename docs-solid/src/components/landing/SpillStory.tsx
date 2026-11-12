import { For } from "solid-js";

import { delay } from "./storyParts.js";

/* ---- Story 1: FILTER spills, then grows ---------------------------------------- */

const SOURCE_ROWS = [
  ["EMEA", "Chair", "3,200"],
  ["APAC", "Desk", "6,400"],
  ["AMER", "Lamp", "2,100"],
  ["APAC", "Screen", "3,100"],
  ["EMEA", "Desk", "4,800"],
  ["AMER", "Chair", "1,900"],
] as const;

const HEADINGS = ["Region", "Product", "Revenue"] as const;
const HEADING_X = [36, 112, 296] as const;
/** The Revenue heading is right-aligned like its numbers. */
const NUMERIC_HEADING = 2;
/** The APAC Screen order, whose revenue changes and joins the spill. */
const EDITED_ROW = 3;

export function SpillStory() {
  const rowY = (index: number) => 76 + index * 30;
  return (
    <svg aria-hidden="true" class="sr sr-spill" viewBox="0 0 640 330">
      <g class="sr-table">
        <rect class="sr-panel" height={250} rx={10} width={292} x={20} y={30} />
        <For each={HEADINGS}>
          {(label, index) => (
            <text
              class="sr-head"
              x={HEADING_X[index()]}
              y={58}
              data-num={index() === NUMERIC_HEADING ? "true" : undefined}
            >
              {label}
            </text>
          )}
        </For>
        <For each={SOURCE_ROWS}>
          {([region, product, revenue], index) => (
            <g>
              <line
                class="sr-rule"
                x1={28}
                x2={304}
                y1={rowY(index()) - 10}
                y2={rowY(index()) - 10}
              />
              <text class="sr-cell" x={36} y={rowY(index()) + 10}>
                {region}
              </text>
              <text class="sr-cell" x={112} y={rowY(index()) + 10}>
                {product}
              </text>
              {index() === EDITED_ROW ? (
                <g class="sr-change">
                  <rect class="sr-flash" height={30} width={90} x={214} y={rowY(index()) - 10} />
                  <text class="sr-cell sr-before" data-num="" x={296} y={rowY(index()) + 10}>
                    {revenue}
                  </text>
                  <text class="sr-cell sr-after" data-num="" x={296} y={rowY(index()) + 10}>
                    5,200
                  </text>
                </g>
              ) : (
                <text class="sr-cell" data-num="" x={296} y={rowY(index()) + 10}>
                  {revenue}
                </text>
              )}
            </g>
          )}
        </For>
      </g>

      <g class="sr-out">
        <rect class="sr-panel" height={250} rx={10} width={268} x={352} y={30} />
        <defs>
          <clipPath id="sr-type-clip">
            <rect class="sr-type" height={24} width={240} x={366} y={40} />
          </clipPath>
        </defs>
        <text class="sr-formula" clip-path="url(#sr-type-clip)" x={368} y={58}>
          =FILTER(A2:C7, C2:C7&gt;4000)
        </text>
        <text class="sr-cell sr-spill-row" style={delay(3)} x={372} y={96}>
          APAC · Desk
        </text>
        <text class="sr-cell sr-spill-row" data-num="" style={delay(3)} x={604} y={96}>
          6,400
        </text>
        <text class="sr-cell sr-spill-row" style={delay(3.3)} x={372} y={126}>
          EMEA · Desk
        </text>
        <text class="sr-cell sr-spill-row" data-num="" style={delay(3.3)} x={604} y={126}>
          4,800
        </text>
        <g class="sr-grow">
          <text class="sr-cell" x={372} y={156}>
            APAC · Screen
          </text>
          <text class="sr-cell" data-num="" x={604} y={156}>
            5,200
          </text>
        </g>
        <rect class="sr-spill-edge" height={92} rx={4} width={246} x={364} y={74} />
        <text class="sr-tag" x={366} y={210}>
          =ROWS(E2#)
        </text>
        <g class="sr-change-count">
          <text class="sr-count sr-before" data-num="" x={604} y={210}>
            2
          </text>
          <text class="sr-count sr-after" data-num="" x={604} y={210}>
            3
          </text>
        </g>
        <text class="sr-note" x={366} y={256}>
          E2# reads the whole spill, whatever its size.
        </text>
      </g>
      <path class="sr-link" d="M 312 156 C 330 156, 336 140, 352 140" />
    </svg>
  );
}
