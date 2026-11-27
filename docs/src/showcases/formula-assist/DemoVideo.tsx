import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { observeSiteTheme } from "../../lib/site-theme.js";

/** One recording of the demo, for one viewport shape and one site theme. */
export interface DemoTake {
  readonly width: number;
  readonly height: number;
  readonly poster: string;
  /** The short muted loop that plays when the reader reaches the demo. */
  readonly loop: { readonly mp4: string; readonly webm: string };
  /** The whole recorded session. */
  readonly full: { readonly mp4: string; readonly webm: string };
}

/** The light and dark recordings of one viewport shape. */
export interface DemoTakes {
  readonly light: DemoTake;
  readonly dark: DemoTake;
}

export interface DemoVideoProps {
  /** The takes for wide screens, recorded at 960 × 540 CSS pixels. */
  readonly wide: DemoTakes;
  /** The takes for phones, recorded at 390 CSS pixels wide. */
  readonly narrow: DemoTakes;
  readonly label: string;
  /** Length of the full recording, as the button shows it, such as `1:12`. */
  readonly duration: string;
}

/** Below this width the narrow take plays; demo-video.css shows its poster at the same width. */
const NARROW_QUERY = "(max-width: 640px)";

/** The site's theme, as the theme toggle reads it: dark unless the page says light. */
function site_theme(): keyof DemoTakes {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * The recorded demo. The page shows the poster only, in a box of the take's
 * own shape, so nothing moves when the video arrives (CLS 0); demo-video.css
 * shows the poster of the screen's shape and the site's theme. The island
 * hydrates when it comes near the screen (`hydrate="visible"`); only then are
 * the sources set, and a short muted loop plays. A theme change swaps in the
 * other theme's take. "Watch the full demo" swaps in the whole session with
 * controls.
 */
export function DemoVideo(props: DemoVideoProps) {
  const [take, set_take] = createSignal<DemoTake | null>(null);
  const [full, set_full] = createSignal(false);
  let video: HTMLVideoElement | undefined;

  onMount(() => {
    const pick = (): void => {
      const shape = matchMedia(NARROW_QUERY).matches ? props.narrow : props.wide;
      set_take(shape[site_theme()]);
    };
    pick();
    onCleanup(observeSiteTheme(pick));
  });

  const play_full = (): void => {
    set_full(true);
    // The <source> elements change with `full`; the video reads them again on load.
    queueMicrotask(() => {
      video?.load();
      void video?.play();
    });
  };

  const poster = (shape: "wide" | "narrow", theme: keyof DemoTakes) => {
    const shown = props[shape][theme];
    return (
      <img
        alt=""
        class={`sw-demo-video__poster sw-demo-video__poster--${shape} sw-demo-video__poster--${theme}`}
        height={shown.height}
        loading="lazy"
        src={shown.poster}
        width={shown.width}
      />
    );
  };

  return (
    <figure class="sw-demo-video">
      <div class="sw-demo-video__frame">
        {poster("wide", "light")}
        {poster("wide", "dark")}
        {poster("narrow", "light")}
        {poster("narrow", "dark")}
        {/* Keyed: a theme change mounts a new video with the other take's sources. */}
        <Show keyed when={take()}>
          {(chosen) => {
            const sources = () => (full() ? chosen.full : chosen.loop);
            return (
              <video
                aria-label={props.label}
                autoplay
                class="sw-demo-video__video"
                controls={full()}
                height={chosen.height}
                loop={!full()}
                muted
                playsinline
                poster={chosen.poster}
                preload="auto"
                ref={(element) => {
                  video = element;
                }}
                width={chosen.width}
              >
                <source src={sources().webm} type="video/webm" />
                <source src={sources().mp4} type="video/mp4" />
              </video>
            );
          }}
        </Show>
      </div>
      <figcaption class="sw-demo-video__caption">
        <span>{props.label}</span>
        <Show when={!full()}>
          <button class="sw-demo-video__full" onClick={play_full} type="button">
            Watch the full demo ({props.duration})
          </button>
        </Show>
      </figcaption>
    </figure>
  );
}
