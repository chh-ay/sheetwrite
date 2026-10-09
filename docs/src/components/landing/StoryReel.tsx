import { type CSSProperties, useEffect, useState } from "react";
import { onTabListKey } from "./tabKeys.js";
import { useScenePlayback } from "./useScenePlayback.js";

/**
 * A reel of three short animated stories. Each plays one 10-second loop and
 * then hands over to the next; the progress bar in the active tab is the
 * timer, so a paused (off-screen) reel also stops advancing, and reduced
 * motion shows each story's finished picture with no automatic change.
 */

const STORY_SECONDS = 10;

interface Story {
  id: "spill" | "offline" | "undo";
  tab: string;
  title: string;
  detail: string;
  href: string;
  link: string;
}

const STORIES: readonly Story[] = [
  {
    id: "spill",
    tab: "Dynamic arrays",
    title: "One formula. The answer takes the space it needs.",
    detail:
      "FILTER spills its result into the cells below. When a source value changes, the spill grows, and every formula that reads E2# follows.",
    href: "/showcases/formulas/",
    link: "Try the formula showcase",
  },
  {
    id: "offline",
    tab: "Offline and sync",
    title: "Lose the network. Keep every edit.",
    detail:
      "Edits made offline wait in a durable outbox. On reconnect they drain in order, the server gives each a version, and the other client follows.",
    href: "/showcases/collaboration/",
    link: "Try the collaboration showcase",
  },
  {
    id: "undo",
    tab: "Large undo",
    title: "Clear 100,000 cells. Undo it in one step.",
    detail:
      "Undo sends one compressed restore. When it is larger than one server version, it travels as one atomic batch: every peer applies all of it or none.",
    href: "/showcases/database/",
    link: "Try the database showcase",
  },
];

const delay = (seconds: number) => ({ animationDelay: `${seconds.toFixed(2)}s` }) as CSSProperties;

/* ---- Story 1: FILTER spills, then grows ---------------------------------------- */

const SOURCE_ROWS = [
  ["EMEA", "Chair", "3,200"],
  ["APAC", "Desk", "6,400"],
  ["AMER", "Lamp", "2,100"],
  ["APAC", "Screen", "3,100"],
  ["EMEA", "Desk", "4,800"],
  ["AMER", "Chair", "1,900"],
] as const;

function SpillStory() {
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

/* ---- Story 2: offline edits queue, then drain ------------------------------------ */

function MiniGrid({ x, flashes }: Readonly<{ x: number; flashes: readonly number[] }>) {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const index = row * 4 + column;
      cells.push(
        <rect
          className="sr-mini"
          data-flash={flashes.includes(index) || undefined}
          height={22}
          key={index}
          rx={2}
          // Offline edits land at 1.6 s, 2.5 s and 3.4 s into the story.
          style={flashes.includes(index) ? delay(1.6 + flashes.indexOf(index) * 0.9) : undefined}
          width={36}
          x={x + 16 + column * 40}
          y={124 + row * 26}
        />,
      );
    }
  }
  return <>{cells}</>;
}

function OfflineStory() {
  return (
    <svg aria-hidden="true" className="sr sr-offline" viewBox="0 0 640 330">
      <g className="sr-device" data-device="ana">
        <rect className="sr-panel" height={250} rx={12} width={196} x={20} y={40} />
        <text className="sr-name" x={36} y={70}>
          Ana
        </text>
        <circle className="sr-dot" cx={196} cy={65} r={6} />
        <text className="sr-sub" x={36} y={94}>
          version
        </text>
        <g className="sr-version-swap" data-device="ana">
          <text className="sr-ver sr-v0" x={196} y={94} data-num="">
            v42
          </text>
          <text className="sr-ver sr-v1" x={196} y={94} data-num="">
            v45
          </text>
        </g>
        <MiniGrid flashes={[]} x={20} />
        <g className="sr-ana-flash">
          <rect height={22} rx={2} width={36} x={76} y={150} />
          <rect height={22} rx={2} width={36} x={116} y={176} />
          <rect height={22} rx={2} width={36} x={156} y={202} />
        </g>
      </g>

      <g className="sr-server">
        <rect className="sr-panel" height={110} rx={12} width={132} x={254} y={110} />
        <text className="sr-name" x={320} y={142} data-center="">
          Your server
        </text>
        <g className="sr-server-versions">
          <text className="sr-big sr-s0" x={320} y={186} data-center="">
            v42
          </text>
          <text className="sr-big sr-s1" x={320} y={186} data-center="">
            v43
          </text>
          <text className="sr-big sr-s2" x={320} y={186} data-center="">
            v44
          </text>
          <text className="sr-big sr-s3" x={320} y={186} data-center="">
            v45
          </text>
        </g>
      </g>

      <line className="sr-wire" data-side="ana" x1={216} x2={254} y1={165} y2={165} />
      <line className="sr-wire" data-side="bram" x1={386} x2={424} y1={165} y2={165} />

      <g className="sr-device" data-device="bram">
        <rect className="sr-panel" height={250} rx={12} width={196} x={424} y={40} />
        <text className="sr-name" x={440} y={70}>
          Bram
        </text>
        <circle className="sr-dot sr-dot-bram" cx={600} cy={65} r={6} />
        <text className="sr-sub sr-state-online" x={440} y={94}>
          online
        </text>
        <text className="sr-sub sr-state-offline" x={440} y={94}>
          offline · edits queue here
        </text>
        <MiniGrid flashes={[5, 10, 15]} x={424} />
      </g>

      {[0, 1, 2].map((index) => (
        <g
          className="sr-outbox"
          key={index}
          style={
            {
              "--i": index,
              // Travel from the chip to the server's centre.
              "--dx": `${291 - (500 - index * 64)}px`,
            } as CSSProperties
          }
        >
          <rect height={20} rx={10} width={58} x={500 - index * 64} y={300} />
          <text x={529 - index * 64} y={314} data-center="">
            edit {index + 1}
          </text>
        </g>
      ))}
      {[0, 1, 2].map((index) => (
        <circle
          className="sr-broadcast"
          cx={320}
          cy={165}
          key={index}
          r={6}
          style={{ "--i": index } as CSSProperties}
        />
      ))}
    </svg>
  );
}

/* ---- Story 3: clear, then one-step undo ------------------------------------------ */

function UndoStory() {
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 14; column++) {
      const shade = ((row * 7 + column * 3) % 5) / 10 + 0.18;
      cells.push(
        <rect
          className="sr-data"
          height={20}
          key={`${row}-${column}`}
          rx={2}
          // The clear sweeps left to right from 1 s into the story.
          style={{ ...delay(1 + column * 0.09 + row * 0.03), "--shade": shade } as CSSProperties}
          width={22}
          x={24 + column * 26}
          y={56 + row * 26}
        />,
      );
    }
  }
  const restored = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 14; column++) {
      const shade = ((row * 7 + column * 3) % 5) / 10 + 0.18;
      restored.push(
        <rect
          height={20}
          key={`${row}-${column}`}
          rx={2}
          style={{ "--shade": shade } as CSSProperties}
          width={22}
          x={24 + column * 26}
          y={56 + row * 26}
        />,
      );
    }
  }
  return (
    <svg aria-hidden="true" className="sr sr-undo" viewBox="0 0 640 330">
      <rect className="sr-panel" height={260} rx={12} width={388} x={12} y={34} />
      <g className="sr-cells">{cells}</g>
      <g className="sr-restored">{restored}</g>
      <g className="sr-cleared">
        <rect height={30} rx={15} width={196} x={108} y={278} />
        <text x={206} y={298} data-center="">
          100,000 cells cleared
        </text>
      </g>
      <g className="sr-key">
        <rect height={40} rx={8} width={64} x={174} y={146} />
        <text x={206} y={172} data-center="">
          Undo
        </text>
      </g>

      <g className="sr-block">
        <rect height={46} rx={8} width={120} x={412} y={140} />
        <text x={472} y={160} data-center="">
          1 restore
        </text>
        <text className="sr-block-sub" x={472} y={176} data-center="">
          compressed
        </text>
      </g>
      <g className="sr-server">
        <rect className="sr-panel" height={70} rx={10} width={100} x={528} y={60} />
        <text className="sr-name" x={578} y={90} data-center="">
          Server
        </text>
        <text className="sr-sub" x={578} y={112} data-center="">
          v51–v55
        </text>
      </g>
      <g className="sr-peer">
        <rect className="sr-panel" height={110} rx={10} width={100} x={528} y={200} />
        <text className="sr-name" x={578} y={226} data-center="">
          Peer
        </text>
        <g className="sr-peer-cells">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <rect
              height={14}
              key={index}
              rx={2}
              width={18}
              x={548 + (index % 3) * 22}
              y={244 + Math.floor(index / 3) * 18}
            />
          ))}
        </g>
      </g>
      <text className="sr-batch" x={578} y={330 - 6} data-center="">
        one atomic batch
      </text>
    </svg>
  );
}

export function StoryReel() {
  const [active, setActive] = useState<Story["id"]>("spill");
  const { ref, epoch, sync } = useScenePlayback<HTMLDivElement>();
  useEffect(() => {
    void active;
    requestAnimationFrame(sync);
  }, [active, sync]);
  const index = STORIES.findIndex((story) => story.id === active);
  const story = STORIES[index] ?? (STORIES[0] as Story);
  const advance = () => setActive(STORIES[(index + 1) % STORIES.length]?.id ?? "spill");
  return (
    <div
      className="sw-reel"
      ref={ref}
      style={{ "--sr-loop": `${STORY_SECONDS}s` } as CSSProperties}
    >
      <div
        aria-label="Stories"
        className="sw-reel__tabs"
        onKeyDown={(event) =>
          onTabListKey(
            event,
            STORIES.map((item) => item.id),
            active,
            setActive,
            (id) => `landing-story-${id}`,
          )
        }
        role="tablist"
      >
        {STORIES.map((item) => (
          <button
            aria-controls="landing-story-panel"
            aria-selected={item.id === active}
            id={`landing-story-${item.id}`}
            key={item.id}
            onClick={() => setActive(item.id)}
            role="tab"
            tabIndex={item.id === active ? 0 : -1}
            type="button"
          >
            <span>{item.tab}</span>
            {item.id === active ? (
              <i
                aria-hidden="true"
                className="sw-reel__timer"
                key={`${item.id}-${epoch}`}
                onAnimationEnd={advance}
              />
            ) : null}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`landing-story-${story.id}`}
        className="sw-reel__panel"
        id="landing-story-panel"
        role="tabpanel"
      >
        <div className="sw-reel__copy">
          <h3>{story.title}</h3>
          <p>{story.detail}</p>
          <a href={story.href}>{story.link} →</a>
        </div>
        <div className="sw-reel__stage" data-story={story.id} key={story.id}>
          {story.id === "spill" ? <SpillStory /> : null}
          {story.id === "offline" ? <OfflineStory /> : null}
          {story.id === "undo" ? <UndoStory /> : null}
        </div>
      </div>
    </div>
  );
}
