import { createSignal, onMount, Show } from "solid-js";

/** One recording of the demo, for one viewport shape. */
export interface DemoTake {
  readonly width: number;
  readonly height: number;
  readonly poster: string;
  /** The short muted loop that plays when the reader reaches the demo. */
  readonly loop: { readonly mp4: string; readonly webm: string };
  /** The whole recorded session. */
  readonly full: { readonly mp4: string; readonly webm: string };
}

export interface DemoVideoProps {
  /** The take for wide screens, recorded at 1280 × 720 CSS pixels. */
  readonly wide: DemoTake;
  /** The take for phones, recorded at 390 CSS pixels wide; demo-video.css switches at the same width. */
  readonly narrow: DemoTake;
  readonly label: string;
  /** Length of the full recording, as the button shows it, such as `1:12`. */
  readonly duration: string;
}

/** Below this width the narrow take plays; demo-video.css shows its poster at the same width. */
const NARROW_QUERY = "(max-width: 640px)";

/**
 * The recorded demo. The page shows the poster only, in a box of the take's
 * own shape, so nothing moves when the video arrives (CLS 0). The island
 * hydrates when it comes near the screen (`hydrate="visible"`); only then are
 * the sources set, and a short muted loop plays. "Watch the full demo" swaps
 * in the whole session with controls.
 */
export function DemoVideo(props: DemoVideoProps) {
  const [take, setTake] = createSignal<DemoTake | null>(null);
  const [full, setFull] = createSignal(false);
  let video: HTMLVideoElement | undefined;

  onMount(() => {
    setTake(matchMedia(NARROW_QUERY).matches ? props.narrow : props.wide);
  });

  const playFull = (): void => {
    setFull(true);
    // The <source> elements change with `full`; the video reads them again on load.
    queueMicrotask(() => {
      video?.load();
      void video?.play();
    });
  };

  return (
    <figure class="sw-demo-video">
      <div class="sw-demo-video__frame">
        <img
          alt=""
          class="sw-demo-video__poster sw-demo-video__poster--wide"
          height={props.wide.height}
          src={props.wide.poster}
          width={props.wide.width}
        />
        <img
          alt=""
          class="sw-demo-video__poster sw-demo-video__poster--narrow"
          height={props.narrow.height}
          src={props.narrow.poster}
          width={props.narrow.width}
        />
        <Show when={take()}>
          {(chosen) => {
            const sources = () => (full() ? chosen().full : chosen().loop);
            return (
              <video
                aria-label={props.label}
                autoplay
                class="sw-demo-video__video"
                controls={full()}
                height={chosen().height}
                loop={!full()}
                muted
                playsinline
                poster={chosen().poster}
                preload="auto"
                ref={(element) => {
                  video = element;
                }}
                width={chosen().width}
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
          <button class="sw-demo-video__full" onClick={playFull} type="button">
            Watch the full demo ({props.duration})
          </button>
        </Show>
      </figcaption>
    </figure>
  );
}
