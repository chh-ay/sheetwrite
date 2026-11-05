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

export function SpillStory() {
  const rowY = (index: number) => 76 + index * 30;
  return (
    <svg aria-hidden="true" className="sr sr-spill" viewBox="0 0 640 330">
      <g className="sr-table">
        <rect className="sr-panel" height={250} rx={10} width={292} x={20} y={30} />
        {["Region", "Product", "Revenue"].map((label, index) => (
          <text
            className="sr-head"
            key={label}
            x={[36, 112, 296][index]}
            y={58}
            data-num={index === 2 || undefined}
          >
            {label}
          </text>
        ))}
        {SOURCE_ROWS.map(([region, product, revenue], index) => (
          <g key={`${region}-${product}`}>
            <line
              className="sr-rule"
              x1={28}
              x2={304}
              y1={rowY(index) - 10}
              y2={rowY(index) - 10}
            />
            <text className="sr-cell" x={36} y={rowY(index) + 10}>
              {region}
            </text>
            <text className="sr-cell" x={112} y={rowY(index) + 10}>
              {product}
            </text>
            {index === 3 ? (
              <g className="sr-change">
                <rect className="sr-flash" height={30} width={90} x={214} y={rowY(index) - 10} />
                <text className="sr-cell sr-before" data-num="" x={296} y={rowY(index) + 10}>
                  {revenue}
                </text>
                <text className="sr-cell sr-after" data-num="" x={296} y={rowY(index) + 10}>
                  5,200
                </text>
              </g>
            ) : (
              <text className="sr-cell" data-num="" x={296} y={rowY(index) + 10}>
                {revenue}
              </text>
            )}
          </g>
        ))}
      </g>

      <g className="sr-out">
        <rect className="sr-panel" height={250} rx={10} width={268} x={352} y={30} />
        <defs>
          <clipPath id="sr-type-clip">
            <rect className="sr-type" height={24} width={240} x={366} y={40} />
          </clipPath>
        </defs>
        <text className="sr-formula" clipPath="url(#sr-type-clip)" x={368} y={58}>
          =FILTER(A2:C7, C2:C7&gt;4000)
        </text>
        <text className="sr-cell sr-spill-row" style={delay(3)} x={372} y={96}>
          APAC · Desk
        </text>
        <text className="sr-cell sr-spill-row" data-num="" style={delay(3)} x={604} y={96}>
          6,400
        </text>
        <text className="sr-cell sr-spill-row" style={delay(3.3)} x={372} y={126}>
          EMEA · Desk
        </text>
        <text className="sr-cell sr-spill-row" data-num="" style={delay(3.3)} x={604} y={126}>
          4,800
        </text>
        <g className="sr-grow">
          <text className="sr-cell" x={372} y={156}>
            APAC · Screen
          </text>
          <text className="sr-cell" data-num="" x={604} y={156}>
            5,200
          </text>
        </g>
        <rect className="sr-spill-edge" height={92} rx={4} width={246} x={364} y={74} />
        <text className="sr-tag" x={366} y={210}>
          =ROWS(E2#)
        </text>
        <g className="sr-change-count">
          <text className="sr-count sr-before" data-num="" x={604} y={210}>
            2
          </text>
          <text className="sr-count sr-after" data-num="" x={604} y={210}>
            3
          </text>
        </g>
        <text className="sr-note" x={366} y={256}>
          E2# reads the whole spill, whatever its size.
        </text>
      </g>
      <path className="sr-link" d="M 312 156 C 330 156, 336 140, 352 140" />
    </svg>
  );
}
