/**
 * Records the formula assist demo for /showcases/formula-assist/: a scripted,
 * human-paced session in the formula bar, captured frame by frame at 60 fps
 * from Chromium's headless shell.
 *
 *   bun docs/src/figures/record-formula-assist.ts [wide|narrow]...
 *
 * Every frame is produced on demand with `HeadlessExperimental.beginFrame`
 * while the page's clock runs on virtual time, 1/60 s per frame, so no frame
 * can be dropped and timers (the caret's blink, debounces) keep their real
 * pace in the video. The script checks that the written video holds exactly
 * duration × 60 frames.
 *
 * Writes docs/public/media/formula-assist/<take>-{demo,loop}.{mp4,webm} and
 * <take>-poster.webp. Needs the built packages (`bun run build`), Playwright's
 * Chromium headless shell and ffmpeg with libx264 and libvpx-vp9.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { createServer } from "vite";

const ROOT = join(import.meta.dir, "../../..");
const STAGE = import.meta.dir;
const OUTPUT = join(ROOT, "docs/public/media/formula-assist");
const FPS = 60;
const FRAME_MS = 1000 / FPS;
/** Seed of the typing rhythm, so a new recording types at the same pace. */
const SEED = 801;
/** Shortest and longest pause between two typed keys, as a person types. */
const KEY_MS = { min: 110, max: 220 } as const;
/** How long the page may take to draw its first frame. */
const READY_TIMEOUT_MS = 60_000;
/** The loop on the page: this slice of the demo, in seconds. */
const LOOP = { start: 1, length: 7 } as const;
/** The poster: the frame at this second, a suggestion on screen. */
const POSTER_AT = 3.2;
/** A recording must change its picture in at least this share of frames, or the page did not respond. */
const MIN_CHANGED_FRAMES = 0.02;

/** The compositor's clock: every frame, also the warm-up ones, one interval later than the last. */
let frameTicks = 0;
function nextFrameTicks(): number {
  frameTicks += FRAME_MS;
  return frameTicks;
}


/** The two takes: wide for desktops, narrow for phones (DemoVideo.tsx). */
const TAKES = {
  wide: { width: 1280, height: 720, scale: 1.5, mobile: false },
  narrow: { width: 390, height: 700, scale: 2, mobile: true },
} as const;
type TakeName = keyof typeof TAKES;

/** Chromium's flags for frames on demand: every compositor stage runs before a frame is drawn. */
const CHROME_FLAGS = [
  "--headless",
  "--enable-begin-frame-control",
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--disable-checker-imaging",
  "--disable-image-animation-resync",
  "--hide-scrollbars",
  "--font-render-hinting=none",
  "--remote-debugging-port=0",
];

function headlessShell(): string {
  const cache = join(homedir(), ".cache/ms-playwright");
  const folder = readdirSync(cache).find((name) => name.startsWith("chromium_headless_shell-"));
  if (folder === undefined)
    throw new Error("Playwright's Chromium headless shell is not installed");
  return join(cache, folder, "chrome-headless-shell-linux64/chrome-headless-shell");
}

/** A small CDP client over the browser's WebSocket, with flat sessions. */
class Cdp {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly listeners = new Map<string, ((params: unknown) => void)[]>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)));
    await promise;
    return new Cdp(socket);
  }

  private receive(data: string): void {
    const message: unknown = JSON.parse(data);
    if (typeof message !== "object" || message === null) return;
    if ("id" in message && typeof message.id === "number") {
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if ("error" in message) waiter?.reject(new Error(JSON.stringify(message.error)));
      else waiter?.resolve("result" in message ? message.result : undefined);
      return;
    }
    if ("method" in message && typeof message.method === "string") {
      const params = "params" in message ? message.params : undefined;
      for (const listener of this.listeners.get(message.method) ?? []) listener(params);
    }
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<unknown> {
    const id = this.nextId++;
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    this.pending.set(id, { resolve, reject });
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return promise;
  }

  /** The next `method` event. */
  once(method: string): Promise<unknown> {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const listeners = this.listeners.get(method) ?? [];
    const listener = (params: unknown): void => {
      this.listeners.set(
        method,
        (this.listeners.get(method) ?? []).filter((entry) => entry !== listener),
      );
      resolve(params);
    };
    this.listeners.set(method, [...listeners, listener]);
    return promise;
  }

  close(): void {
    this.socket.close();
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** Mulberry32, so the typing rhythm is the same on every run. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** One input of the session: a key, or a cell selected with the formula bar focused. */
type Step =
  | { readonly kind: "key"; readonly key: string; readonly ctrl?: boolean }
  | { readonly kind: "text"; readonly char: string }
  | { readonly kind: "select"; readonly cell: string };

/** The session, with the pause before each step in milliseconds. */
function session(): { at: number; step: Step }[] {
  const random = seededRandom(SEED);
  const steps: { at: number; step: Step }[] = [];
  let time = 0;
  const wait = (ms: number): void => {
    time += ms;
  };
  const select = (cell: string): void => {
    steps.push({ at: time, step: { kind: "select", cell } });
  };
  const type = (text: string): void => {
    for (const char of text) {
      wait(KEY_MS.min + random() * (KEY_MS.max - KEY_MS.min));
      steps.push({ at: time, step: { kind: "text", char } });
    }
  };
  const press = (key: string, ctrl = false): void => {
    steps.push({ at: time, step: { kind: "key", key, ctrl } });
  };

  /** How long a suggestion stays on screen before it is taken, so a viewer can read it. */
  const READ_MS = 3_000;
  /** The pause after a commit, before the next cell. */
  const SETTLE_MS = 2_200;
  const accept = (cell: string): void => {
    select(cell);
    wait(1_000);
    type("=");
    wait(READ_MS);
    press("Tab");
    wait(900);
    press("Enter");
    wait(SETTLE_MS);
  };

  wait(2_500);
  // Finance's total: the totals above and below agree, so `=` is enough.
  accept("H6");
  // Finance's share, one word at a time with Ctrl+→, then the rest with Tab.
  select("I6");
  wait(1_000);
  type("=");
  wait(READ_MS);
  press("ArrowRight", true);
  wait(900);
  press("ArrowRight", true);
  wait(900);
  press("Tab");
  wait(900);
  press("Enter");
  wait(SETTLE_MS);
  // March's total, from the totals left and right of it.
  accept("D13");
  // People's total: take the function with Ctrl+→, hide the rest with Esc, and type the range yourself.
  select("H9");
  wait(1_000);
  type("=");
  wait(READ_MS);
  press("ArrowRight", true);
  wait(900);
  press("Escape");
  wait(1_200);
  type("B9:G9)");
  wait(1_200);
  press("Enter");
  wait(SETTLE_MS);
  // People's share, from the shares above and below.
  accept("I9");
  // A lookup: the function name completes, and Tab moves to the next argument.
  select("J2");
  wait(1_000);
  type("=VLO");
  wait(READ_MS);
  press("Tab");
  wait(600);
  type("A2");
  wait(1_000);
  press("Tab");
  wait(600);
  type("Rates!A1:B10");
  wait(1_000);
  press("Tab");
  wait(600);
  type("2,FALSE)");
  wait(1_400);
  press("Enter");
  wait(4_000);
  select("A1");
  wait(2_500);
  return steps;
}

const KEY_CODES: Readonly<Record<string, number>> = {
  Tab: 9,
  Enter: 13,
  Escape: 27,
  ArrowRight: 39,
};
/** CDP's modifier bit for Ctrl. */
const CTRL = 2;

async function dispatch(cdp: Cdp, sessionId: string, step: Step): Promise<void> {
  if (step.kind === "select") {
    const addr = /^([A-Z]+)([0-9]+)$/.exec(step.cell);
    const [, letters = "A", digits = "1"] = addr ?? [];
    const col = letters.charCodeAt(0) - 65;
    const row = Number(digits) - 1;
    await cdp.send(
      "Runtime.evaluate",
      {
        expression: `(() => {
          const grid = window.__sheetwriteAssistGrid;
          grid.setSelection({ kind: "cell", addr: { sheet: grid.getActiveSheet(), row: ${row}, col: ${col} } });
          document.querySelector('textarea[aria-label="Formula bar"]').focus();
        })()`,
      },
      sessionId,
    );
    return;
  }
  if (step.kind === "text") {
    const { char } = step;
    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: char, text: char, unmodifiedText: char },
      sessionId,
    );
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: char }, sessionId);
    return;
  }
  const code = KEY_CODES[step.key] ?? 0;
  const modifiers = step.ctrl === true ? CTRL : 0;
  const text = step.key === "Enter" ? "\r" : undefined;
  await cdp.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: step.key,
      code: step.key,
      windowsVirtualKeyCode: code,
      modifiers,
      text,
    },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: step.key, code: step.key, windowsVirtualKeyCode: code, modifiers },
    sessionId,
  );
}

async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" });
  const [stderr, status] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (status !== 0) throw new Error(`${command[0]} failed (${status}): ${stderr.slice(-2_000)}`);
}

/** Launch the headless shell and return its DevTools URL. */
async function launch(): Promise<{ url: string; stop: () => void }> {
  const profile = mkdtempSync(join(tmpdir(), "sheetwrite-record-profile-"));
  const child = Bun.spawn(
    [headlessShell(), ...CHROME_FLAGS, `--user-data-dir=${profile}`, "about:blank"],
    {
      stdout: "ignore",
      stderr: "pipe",
    },
  );
  const reader = child.stderr.getReader();
  let log = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`The headless shell exited: ${log}`);
    log += new TextDecoder().decode(value);
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
    if (match?.[1] !== undefined) {
      reader.releaseLock();
      return {
        url: match[1],
        stop: () => {
          child.kill();
          rmSync(profile, { recursive: true, force: true });
        },
      };
    }
  }
}

/** Draw frames in real time, without keeping them, until `ready` holds. */
async function pumpUntil(cdp: Cdp, sessionId: string, ready: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    await cdp.send(
      "HeadlessExperimental.beginFrame",
      { frameTimeTicks: nextFrameTicks(), interval: FRAME_MS, noDisplayUpdates: false },
      sessionId,
    );
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression: ready, returnByValue: true },
      sessionId,
    );
    if (field(field(result, "result"), "value") === true) return;
    if (Date.now() > deadline) {
      const state = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `JSON.stringify({ focused: document.activeElement?.getAttribute("aria-label"), bar: document.querySelector('textarea[aria-label="Formula bar"]')?.value })`,
          returnByValue: true,
        },
        sessionId,
      );
      throw new Error(`Timed out waiting for ${ready}; page: ${String(field(field(state, "result"), "value"))}`);
    }
    await Bun.sleep(FRAME_MS);
  }
}

/** Record one take into `scratch/<take>.mp4`, a near-lossless master; returns its frame count. */
async function recordTake(name: TakeName, origin: string, scratch: string): Promise<number> {
  const take = TAKES[name];
  const browser = await launch();
  const cdp = await Cdp.connect(browser.url);
  const master = join(scratch, `${name}.mp4`);
  try {
    const target = await cdp.send("Target.createTarget", {
      url: "about:blank",
      enableBeginFrameControl: true,
      width: take.width,
      height: take.height,
    });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: field(target, "targetId"),
      flatten: true,
    });
    const sessionId = String(field(attached, "sessionId"));
    for (const method of ["Page.enable", "Runtime.enable", "HeadlessExperimental.enable"]) {
      await cdp.send(method, {}, sessionId);
    }
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: take.width,
        height: take.height,
        deviceScaleFactor: take.scale,
        mobile: take.mobile,
      },
      sessionId,
    );
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
    await cdp.send("Page.navigate", { url: `${origin}/assist.html?theme=light` }, sessionId);
    await pumpUntil(cdp, sessionId, "document.documentElement.dataset.figureReady === 'true'");

    // Warm up: one formula edit loads the add-on's predictor, then the page is put back.
    // An open cell: its neighbours give a suggestion as soon as `=` is typed.
    await dispatch(cdp, sessionId, { kind: "select", cell: "H6" });
    await dispatch(cdp, sessionId, { kind: "text", char: "=" });
    await pumpUntil(cdp, sessionId, "document.querySelector('.sheetwrite-formula-ghost') !== null");
    await dispatch(cdp, sessionId, { kind: "key", key: "Escape" });
    await dispatch(cdp, sessionId, { kind: "key", key: "Escape" });
    await dispatch(cdp, sessionId, { kind: "select", cell: "A1" });
    await cdp.send("Runtime.evaluate", { expression: "document.activeElement.blur()" }, sessionId);
    await pumpUntil(cdp, sessionId, "true");

    // From here the page's clock advances only with the frames.
    await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" }, sessionId);
    const steps = session();
    const last = steps.at(-1)?.at ?? 0;
    const frames = Math.ceil(last / FRAME_MS) + 1;
    const encoder = Bun.spawn(
      [
        "ffmpeg",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-c:v",
        "png",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "10",
        "-pix_fmt",
        "yuv444p",
        master,
      ],
      { stdin: "pipe", stderr: "inherit" },
    );
    let next = 0;
    let previous: Uint8Array | null = null;
    let changed = 0;
    for (let frame = 0; frame < frames; frame++) {
      const now = frame * FRAME_MS;
      while (next < steps.length && (steps[next]?.at ?? Number.POSITIVE_INFINITY) <= now) {
        const due = steps[next];
        if (due !== undefined) await dispatch(cdp, sessionId, due.step);
        next++;
      }
      const expired = cdp.once("Emulation.virtualTimeBudgetExpired");
      await cdp.send(
        "Emulation.setVirtualTimePolicy",
        { policy: "advance", budget: FRAME_MS },
        sessionId,
      );
      await expired;
      const result = await cdp.send(
        "HeadlessExperimental.beginFrame",
        { frameTimeTicks: nextFrameTicks(), interval: FRAME_MS, screenshot: { format: "png" } },
        sessionId,
      );
      const data = field(result, "screenshotData");
      // A frame without changes has no new picture: the previous one stands, so the count holds.
      const image = typeof data === "string" ? Buffer.from(data, "base64") : previous;
      if (image === null) throw new Error("The first recorded frame has no picture");
      encoder.stdin.write(image);
      previous = image;
      if (typeof data === "string") changed++;
    }
    await encoder.stdin.end();
    if ((await encoder.exited) !== 0) throw new Error(`Encoding ${name} failed`);
    if (changed < frames * MIN_CHANGED_FRAMES) {
      throw new Error(`${name}: only ${changed} of ${frames} frames changed; the page did not follow the session`);
    }
    return frames;
  } finally {
    cdp.close();
    browser.stop();
  }
}

/** The number of frames in a video file, counted by decoding it. */
async function countFrames(path: string): Promise<number> {
  const child = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      path,
    ],
    { stdout: "pipe" },
  );
  return Number((await new Response(child.stdout).text()).trim());
}

/** The page's files from the master: MP4 and WebM of the demo and of the loop, and the poster. */
async function publish(name: TakeName, master: string, frames: number): Promise<void> {
  const out = (file: string): string => join(OUTPUT, `${name}-${file}`);
  const h264 = [
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
  ];
  const vp9 = [
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "36",
    "-row-mt",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-an",
  ];
  const loop = ["-ss", String(LOOP.start), "-t", String(LOOP.length)];

  await run(["ffmpeg", "-loglevel", "error", "-y", "-i", master, ...h264, out("demo.mp4")]);
  await run(["ffmpeg", "-loglevel", "error", "-y", "-i", master, ...vp9, out("demo.webm")]);
  await run([
    "ffmpeg",
    "-loglevel",
    "error",
    "-y",
    ...loop,
    "-i",
    master,
    ...h264,
    out("loop.mp4"),
  ]);
  await run([
    "ffmpeg",
    "-loglevel",
    "error",
    "-y",
    ...loop,
    "-i",
    master,
    ...vp9,
    out("loop.webm"),
  ]);
  await run([
    "ffmpeg",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(POSTER_AT),
    "-i",
    master,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "86",
    out("poster.webp"),
  ]);

  for (const file of ["demo.mp4", "demo.webm"]) {
    const written = await countFrames(out(file));
    if (written !== frames)
      throw new Error(`${name}-${file} has ${written} frames, not ${frames}: a frame was dropped`);
  }
  process.stdout.write(
    `${name}: ${frames} frames (${(frames / FPS).toFixed(2)} s) at ${FPS} fps\n`,
  );
}

const wanted = process.argv.slice(2);
function isTakeName(name: string): name is TakeName {
  return name in TAKES;
}
const takes = (wanted.length === 0 ? Object.keys(TAKES) : wanted).map((name) => {
  if (!isTakeName(name))
    throw new Error(`Unknown take ${name}; takes: ${Object.keys(TAKES).join(", ")}`);
  return name;
});

mkdirSync(OUTPUT, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "sheetwrite-record-"));
const server = await createServer({
  configFile: false,
  root: STAGE,
  cacheDir: join(scratch, "vite"),
  logLevel: "warn",
  server: { port: 0, host: "127.0.0.1", fs: { allow: [ROOT] } },
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address !== "object") throw new Error("The stage did not start");
try {
  for (const name of takes) {
    const frames = await recordTake(name, `http://127.0.0.1:${address.port}`, scratch);
    await publish(name, join(scratch, `${name}.mp4`), frames);
  }
} finally {
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
}
