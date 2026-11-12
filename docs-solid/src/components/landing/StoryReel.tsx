import { type Component, createEffect, createMemo, createSignal, For, on, Show } from "solid-js";

import { Icon } from "../Icon.js";
import { onTabListKey } from "../tabKeys.js";
import { AnalysisStory } from "./AnalysisStory.js";
import { OfflineStory } from "./OfflineStory.js";
import { createScenePlayback } from "./scene-playback.js";
import { SpillStory } from "./SpillStory.js";
import { UndoStory } from "./UndoStory.js";

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

const STORY_IDS = STORIES.map((story) => story.id);

const STAGES: Readonly<Record<Story["id"], Component>> = {
  analysis: AnalysisStory,
  spill: SpillStory,
  offline: OfflineStory,
  undo: UndoStory,
};

const storyTabId = (id: Story["id"]) => `landing-story-${id}`;

export function StoryReel() {
  const [active, setActive] = createSignal<Story["id"]>("analysis");
  // The reel holds its story while focus is inside it, so a story change never
  // removes the link or tab the reader is on, and while the reader pauses it.
  // A held reel has no timer; the countdown starts again when the hold ends.
  const [focusInside, setFocusInside] = createSignal(false);
  const [pausedByReader, setPausedByReader] = createSignal(false);
  const held = () => focusInside() || pausedByReader();
  const playback = createScenePlayback<HTMLDivElement>();
  let root: HTMLDivElement | undefined;
  createEffect(
    on(active, () => {
      requestAnimationFrame(playback.sync);
    }),
  );
  const index = createMemo(() => STORIES.findIndex((story) => story.id === active()));
  const story = createMemo(() => STORIES[index()] ?? (STORIES[0] as Story));
  const select = (id: Story["id"]) => setActive(id);
  const advance = () => setActive(STORIES[(index() + 1) % STORIES.length]?.id ?? "analysis");
  return (
    <div
      class="sw-reel"
      onFocusIn={() => setFocusInside(true)}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && root?.contains(next) === true)) setFocusInside(false);
      }}
      ref={(element) => {
        root = element;
        playback.ref(element);
      }}
      style={{ "--sr-loop": `${STORY_SECONDS}s` }}
    >
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs inside take focus; the tab list itself does not. */}
      <div
        aria-label="Stories"
        class="sw-reel__tabs"
        onKeyDown={(event) => onTabListKey(event, STORY_IDS, active(), select, storyTabId)}
        role="tablist"
        // The indicator slides to this tab instead of jumping.
        style={{ "--sr-index": Math.max(index(), 0), "--sr-count": STORIES.length }}
      >
        <For each={STORIES}>
          {(item) => (
            <button
              aria-controls="landing-story-panel"
              aria-selected={item.id === active()}
              id={storyTabId(item.id)}
              onClick={() => setActive(item.id)}
              role="tab"
              tabIndex={item.id === active() ? 0 : -1}
              type="button"
            >
              <span>{item.tab}</span>
              <Show when={item.id === active() && !held()}>
                <i aria-hidden="true" class="sw-reel__timer" onAnimationEnd={advance} />
              </Show>
            </button>
          )}
        </For>
      </div>
      <div
        aria-labelledby={storyTabId(story().id)}
        class="sw-reel__panel"
        id="landing-story-panel"
        role="tabpanel"
      >
        {/* Keyed on the story, so the copy and the stage are built anew and their fades play on each story. */}
        <Show keyed when={story()}>
          {(shown) => {
            const Stage = STAGES[shown.id];
            return (
              <>
                <div class="sw-reel__copy">
                  <h3>{shown.title}</h3>
                  <p>{shown.detail}</p>
                  <a href={shown.href}>
                    {shown.link}
                    <Icon name="arrow-right" />
                  </a>
                  <button
                    aria-pressed={pausedByReader()}
                    class="sw-reel__pause"
                    onClick={() => setPausedByReader((paused) => !paused)}
                    type="button"
                  >
                    Pause stories
                  </button>
                </div>
                <div class="sw-reel__stage" data-story={shown.id}>
                  <Stage />
                </div>
              </>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
