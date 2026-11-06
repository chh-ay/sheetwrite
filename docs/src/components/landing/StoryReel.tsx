import { type CSSProperties, useEffect, useState } from "react";

import { Icon } from "../Icon.js";
import { onTabListKey } from "../tabKeys.js";
import { AnalysisStory } from "./AnalysisStory.js";
import { OfflineStory } from "./OfflineStory.js";
import { SpillStory } from "./SpillStory.js";
import { UndoStory } from "./UndoStory.js";
import { useScenePlayback } from "./useScenePlayback.js";

/**
 * A reel of four short animated stories. Each plays one 10-second loop and
 * then hands over to the next; the progress bar in the active tab is the
 * timer, so a paused (off-screen) reel also stops advancing, and reduced
 * motion shows each story's finished picture with no automatic change.
 */

const STORY_SECONDS = 10;

interface Story {
  id: "analysis" | "spill" | "offline" | "undo";
  tab: string;
  title: string;
  detail: string;
  href: string;
  link: string;
}

const STORIES: readonly Story[] = [
  {
    id: "analysis",
    tab: "Pivots and charts",
    title: "Change an order. The pivot and the chart follow.",
    detail:
      "A pivot table sums the orders by region, and a chart reads the pivot's cells. Edit one order and both update in place, with no refresh call.",
    href: "/showcases/analysis/",
    link: "Try the analysis showcase",
  },
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

export function StoryReel() {
  const [active, setActive] = useState<Story["id"]>("analysis");
  // The reel holds its story while focus is inside it, so a story change never
  // removes the link or tab the reader is on, and while the reader pauses it.
  // A held reel has no timer; the countdown starts again when the hold ends.
  const [focusInside, setFocusInside] = useState(false);
  const [pausedByReader, setPausedByReader] = useState(false);
  const held = focusInside || pausedByReader;
  const { ref, sync } = useScenePlayback<HTMLDivElement>();
  useEffect(() => {
    void active;
    requestAnimationFrame(sync);
  }, [active, sync]);
  const index = STORIES.findIndex((story) => story.id === active);
  const story = STORIES[index] ?? (STORIES[0] as Story);
  const advance = () => setActive(STORIES[(index + 1) % STORIES.length]?.id ?? "analysis");
  return (
    <div
      className="sw-reel"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
      }}
      onFocus={() => setFocusInside(true)}
      ref={ref}
      style={{ "--sr-loop": `${STORY_SECONDS}s` } as CSSProperties}
    >
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs inside take focus; the tab list itself does not. */}
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
        // The indicator slides to this tab instead of jumping.
        style={{ "--sr-index": Math.max(index, 0), "--sr-count": STORIES.length } as CSSProperties}
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
            {item.id === active && !held ? (
              <i aria-hidden="true" className="sw-reel__timer" onAnimationEnd={advance} />
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
        {/* The copy key remounts it so its fade plays on each story. Sibling keys must differ. */}
        <div className="sw-reel__copy" key={`copy-${story.id}`}>
          <h3>{story.title}</h3>
          <p>{story.detail}</p>
          <a href={story.href}>
            {story.link}
            <Icon name="arrow-right" />
          </a>
          <button
            aria-pressed={pausedByReader}
            className="sw-reel__pause"
            onClick={() => setPausedByReader((paused) => !paused)}
            type="button"
          >
            Pause stories
          </button>
        </div>
        <div className="sw-reel__stage" data-story={story.id} key={`stage-${story.id}`}>
          {story.id === "analysis" ? <AnalysisStory /> : null}
          {story.id === "spill" ? <SpillStory /> : null}
          {story.id === "offline" ? <OfflineStory /> : null}
          {story.id === "undo" ? <UndoStory /> : null}
        </div>
      </div>
    </div>
  );
}
