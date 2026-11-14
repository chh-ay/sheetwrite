import ReactSnippet from "@docs/components/landing/snippets/react.mdx";
import SvelteSnippet from "@docs/components/landing/snippets/svelte.mdx";
import VanillaSnippet from "@docs/components/landing/snippets/vanilla.mdx";
import VueSnippet from "@docs/components/landing/snippets/vue.mdx";
// Named imports, so only these three numbers are read.
import { localPassed, regressions, totalTests } from "@docs/generated/compatibility-summary.json";
import landingBench from "@docs/generated/landing-bench.json";
// The speed story: markup the docs generator built from the committed captures.
import speedStory from "@docs/generated/landing-story.html?raw";
import releaseFacts from "@docs/generated/release-facts.json" with { type: "json" };
import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { For, type JSX, Show } from "solid-js";
import { NoHydration, resolveSSRNode } from "solid-js/web";

import corePackage from "../../../packages/core/package.json" with { type: "json" };
import { Icon } from "../components/Icon.js";
import { ArchitectureScene } from "../components/landing/ArchitectureScene.js";
import { CodeTabs } from "../components/landing/CodeTabs.js";
import { FeatureGlyph, type FeatureGlyphKind } from "../components/landing/FeatureGlyph.js";
import { HeroApp } from "../components/landing/HeroApp.js";
import { StoryReel } from "../components/landing/StoryReel.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { PackageCommand } from "../islands/content.js";
import { Island } from "../islands/Island.js";

import landingStylesheet from "@docs/styles/landing.css?url";

/*
 * The product landing, ported from docs/src/routes/index.tsx. The page is
 * static; the hero, the architecture scene, the story reel and the framework
 * snippets are islands. The grid glow and the feature cards' animations are
 * plain DOM (lib/landing.ts).
 */

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV",
      "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.",
    ),
    links: [
      { rel: "stylesheet", href: landingStylesheet },
      // On a slow link Chromium paints a partly parsed body, and the rest of the
      // header or the hero's buttons and install box then arrive a frame later
      // and push the layout (a layout shift). Hold the first paint until the
      // hero's picture starts, which comes after both; other browsers ignore it.
      { rel: "expect", href: "#landing-hero-app", blocking: "render" },
    ],
  }),
  component: LandingRoute,
});

interface LandingBenchSize {
  size: number;
  comparedScenarios: number;
  medianRatio: number;
  bestRatio: number;
  bestScenario: string;
  handsontableIncomplete: number;
}

interface LandingEvidence {
  capture: {
    commit: string;
    timestamp: string;
    browser: string;
    rounds: number;
    engineVersions: { sheetwrite: string; handsontable: string };
  };
  heroStats: {
    millionRowScenarios: number;
    millionRowMedianMs: number;
    millionRowHeapMb: number;
  };
  sizes: LandingBenchSize[];
}

interface LandingBenchData extends Partial<LandingEvidence> {
  available: boolean;
  /** Brotli-compressed downloads; absent when the size report or engine artifact is incomplete. */
  downloads?: {
    coreFirstLoadBrotliBytes: number;
    defaultEngineBrotliBytes: number;
    fullEngineBrotliBytes: number;
  };
}

const BYTES_PER_KIB = 1024;

/** Whole kibibytes, the unit the size reports in the docs use. */
function kib(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_KIB)} KiB`;
}

interface Feature {
  kind: FeatureGlyphKind;
  label: string;
  href: string;
  summary: string;
}

const FEATURES: readonly Feature[] = [
  {
    kind: "spreadsheet",
    label: "Spreadsheet app",
    href: "/showcases/spreadsheet/",
    summary:
      "An Excel-style ribbon, name box, formula bar and sheet tabs around the Grid. Every command is a public API call.",
  },
  {
    kind: "analysis",
    label: "Charts & pivot tables",
    href: "/showcases/analysis/",
    summary:
      "Pivot your data and chart any range. Edit a source cell and the pivot and its chart update in place.",
  },
  {
    kind: "scale",
    label: "Performance & scale",
    href: "/showcases/performance/",
    summary:
      "Address 1,000,000 rows × 1,000 columns. The Grid requests only the tiles on screen and keeps memory inside a fixed cache.",
  },
  {
    kind: "formulas",
    label: "Formula analysis",
    href: "/showcases/formulas/",
    summary:
      "GROUPBY, PIVOTBY, FILTER, LAMBDA, statistics and finance. Results spill, and other formulas read the spill with A2#.",
  },
  {
    kind: "collaboration",
    label: "Collaboration",
    href: "/showcases/collaboration/",
    summary:
      "Clients commit in order through your server. Duplicates, gaps, and conflicts recover with explicit protocol steps.",
  },
  {
    kind: "database",
    label: "Database & documents",
    href: "/showcases/database/",
    summary:
      "Snapshots and append-only commits in your storage. Pending edits survive a reload and drain in order.",
  },
  {
    kind: "interoperability",
    label: "XLSX & CSV",
    href: "/showcases/interoperability/",
    summary:
      "Import and export workbooks with formulas and styles. Every lossy case returns a named warning, not a silent change.",
  },
  {
    kind: "host-rows",
    label: "Host-owned rows",
    href: "/showcases/host-rows/",
    summary:
      "Your store keeps the records. Sort, filter, and edit the Grid, and every delta names the same record ID.",
  },
];

/** The rows that the landing snippets show, beside the code. */
const SAMPLE_ROWS = [
  ["Notebook", 12],
  ["Pen", 4],
  ["Folder", 9],
] as const;

/** Each framework's snippet, in CodeTabs' tab order, rendered once as markup. */
const SNIPPETS = [VanillaSnippet, ReactSnippet, VueSnippet, SvelteSnippet];

/** A link to another page of the site, with its trailing arrow. */
function MoreLink(props: {
  readonly href: string;
  readonly class?: string;
  children: JSX.Element;
}) {
  return (
    <a class={props.class} href={props.href}>
      {props.children}
      <Icon name="arrow-right" />
    </a>
  );
}

function FeatureCards() {
  return (
    <ol class="sw-features">
      <For each={FEATURES}>
        {(feature) => (
          <li>
            <a data-feature={feature.kind} href={feature.href}>
              <span class="sw-features__art">
                <FeatureGlyph kind={feature.kind} />
              </span>
              <strong>{feature.label}</strong>
              <span class="sw-features__summary">{feature.summary}</span>
              <span class="sw-features__cta">
                Open the live example
                <Icon name="arrow-right" />
              </span>
            </a>
          </li>
        )}
      </For>
    </ol>
  );
}

function LandingRoute() {
  return (
    <NoHydration>
      <Landing />
    </NoHydration>
  );
}

function Landing() {
  const bench = landingBench as LandingBenchData;
  const evidence: LandingEvidence | undefined =
    bench.available && bench.sizes && bench.heroStats && bench.capture
      ? { sizes: bench.sizes, heroStats: bench.heroStats, capture: bench.capture }
      : undefined;
  const millionRow = evidence?.sizes.find((entry) => entry.size === 1_000_000);
  const { downloads } = bench;
  const highlighted = releaseFacts.highlighted;
  return (
    <div class="sw-landing">
      <canvas class="sw-landing__glow" />
      <SiteTopbar pathname="/" />

      <main id="main-content">
        <section aria-labelledby="landing-title" class="sw-lp-hero">
          <div class="sw-lp-hero__copy">
            <p class="sw-lp-eyebrow">
              Open source · MIT · v{corePackage.version}
              <span class="sw-lp-eyebrow__extra"> · Rust/WASM engine</span>
            </p>
            <h1 id="landing-title">The spreadsheet engine for your web app.</h1>
            <p class="sw-lp-hero__lede">
              A real calculation engine and a canvas Grid in your page, with the ribbon, charts and
              pivot tables of a spreadsheet app. Your application keeps the data, the UI, and the
              server.
            </p>
          </div>
          <div class="sw-lp-hero__start">
            <div class="sw-lp-actions">
              <a class="sw-lp-button" href="/docs/start/installation/">
                Get started
              </a>
              <a class="sw-lp-button sw-lp-button--ghost" href="/showcases/">
                Explore showcases
              </a>
            </div>
            <div class="sw-lp-hero__install">
              <PackageCommand packages="@sheetwrite/core" />
            </div>
          </div>
          <Island component={HeroApp} name="landing-hero" props={{}} />
        </section>

        <Show when={evidence}>
          {(measured) => (
            <section aria-label="Measured results" class="sw-lp-facts">
              <dl>
                <div>
                  <dt>{measured().heroStats.millionRowMedianMs} ms</dt>
                  <dd>median interaction at 1,000,000 rows, Linux x86-64</dd>
                </div>
                <Show when={millionRow}>
                  {(row) => (
                    <div>
                      <dt>{row().medianRatio}×</dt>
                      <dd>faster than Handsontable at 1,000,000 rows, same Linux capture</dd>
                    </div>
                  )}
                </Show>
                <div>
                  <dt>
                    {localPassed.toLocaleString("en")} / {totalTests.toLocaleString("en")}
                  </dt>
                  <dd>Excel compatibility checks pass, {regressions} regressions</dd>
                </div>
                <Show when={downloads}>
                  {(sizes) => (
                    <div>
                      <dt>{kib(sizes().coreFirstLoadBrotliBytes)}</dt>
                      <dd>first load with the default engine, Brotli, in a Vite app</dd>
                    </div>
                  )}
                </Show>
              </dl>
              <MoreLink href="#benchmarks">How we measured</MoreLink>
            </section>
          )}
        </Show>

        <section aria-labelledby="landing-how" class="sw-lp-section">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">How it works</p>
            <h2 id="landing-how">Three layers. One clear line of ownership.</h2>
            <p>
              The Grid handles input and painting. The engine stores cells and recalculates. Your
              application decides what to save and where.
            </p>
          </header>
          <Island
            component={ArchitectureScene}
            hydrate="visible"
            name="landing-architecture"
            props={{}}
          />
          <MoreLink class="sw-lp-more" href="/docs/concepts/runtime-ownership/">
            Read the runtime-ownership model
          </MoreLink>
        </section>

        <section aria-labelledby="landing-features" class="sw-lp-section">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">What you can build</p>
            <h2 id="landing-features">Real workbooks, not a table with formulas on top.</h2>
            <p>
              Every card opens a live example that runs the real engine in your browser.{" "}
              <MoreLink href="/showcases/">See all showcases</MoreLink>
            </p>
          </header>
          <FeatureCards />
        </section>

        <section aria-labelledby="landing-stories" class="sw-lp-section">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">See it happen</p>
            <h2 id="landing-stories">The hard parts of a spreadsheet, handled.</h2>
            <p>
              Short stories about work that a table component leaves to you. Each one links to the
              live example that runs it for real.
            </p>
          </header>
          <Island component={StoryReel} hydrate="visible" name="landing-stories" props={{}} />
        </section>

        <section aria-labelledby="landing-code" class="sw-lp-section sw-lp-split">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">Start in minutes</p>
            <h2 id="landing-code">Mount a Grid in the framework you already use.</h2>
            <p>
              One engine, four entry points. The adapters share one lifecycle: create on mount,
              apply live option changes, and destroy on unmount.
            </p>
            <MoreLink class="sw-lp-more" href="/docs/start/first-grid/">
              Build your first grid
            </MoreLink>
          </header>
          <Island
            component={CodeTabs}
            hydrate="interaction"
            name="landing-code"
            omitFromPage={["panels"]}
            props={{ panels: SNIPPETS.map((Snippet) => resolveSSRNode(<Snippet />)) }}
          />
          <figure class="sw-lp-result">
            <table aria-label="The Grid the snippet renders">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <th scope="col">Product</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                <For each={SAMPLE_ROWS}>
                  {([product, amount], index) => (
                    <tr>
                      <th scope="row">{index() + 1}</th>
                      <td>{product}</td>
                      <td>{amount}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <figcaption>
              What every tab renders, with these rows. You can edit cells, undo, redo, copy and
              paste.
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="landing-engine" class="sw-lp-section sw-lp-engines">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">Formula engines</p>
            <h2 id="landing-engine">Pick the formula engine that fits your download budget.</h2>
          </header>
          <div class="sw-lp-engines__choices">
            <article>
              <span>Default</span>
              <strong>@sheetwrite/wasm</strong>
              <p>
                Included by the core package. The standard function set and the smaller download.
              </p>
              <Show when={downloads}>
                {(sizes) => (
                  <p class="sw-lp-engines__size">
                    <b>{kib(sizes().defaultEngineBrotliBytes)}</b> WASM, Brotli
                  </p>
                )}
              </Show>
              <pre class="sw-lp-engines__code">
                <code>
                  <span class="sw-code-keyword">await</span>{" "}
                  <span class="sw-code-function">initSheetwrite</span>();
                </code>
              </pre>
            </article>
            <article data-variant="full">
              <span>Full</span>
              <strong>@sheetwrite/formulas</strong>
              <p>
                The same engine with the analysis families: grouping, pivots, LAMBDA, statistics,
                regression, finance, regex, and matrices.
              </p>
              <Show when={downloads}>
                {(sizes) => (
                  <p class="sw-lp-engines__size">
                    <b>{kib(sizes().fullEngineBrotliBytes)}</b> WASM, Brotli
                  </p>
                )}
              </Show>
              <pre class="sw-lp-engines__code">
                <code>
                  <span class="sw-code-keyword">await</span>{" "}
                  <span class="sw-code-function">initSheetwrite</span>
                  {"({ engine: formulas });"}
                </code>
              </pre>
            </article>
          </div>
          <Show when={highlighted}>
            {(release) => (
              <aside aria-labelledby="landing-new" class="sw-lp-new">
                <h3 id="landing-new">New in {release().minor}</h3>
                <ul>
                  <For each={release().highlights}>{(highlight) => <li>{highlight}</li>}</For>
                </ul>
                <MoreLink href={release().href}>
                  Read what is new and the upgrade checklist
                </MoreLink>
              </aside>
            )}
          </Show>
        </section>

        <section aria-labelledby="landing-bench" class="sw-lp-section" id="benchmarks">
          <header class="sw-lp-head">
            <p class="sw-lp-eyebrow">Results you can check</p>
            <h2 id="landing-bench">Measured, not promised.</h2>
            <p>
              How many times faster Sheetwrite is than Handsontable
              {evidence ? ` ${evidence.capture.engineVersions.handsontable}` : ""} in saved browser
              captures, on each machine. Every interaction must return the correct result; failed
              runs stay failed.
            </p>
          </header>
          <Show
            fallback={
              <p class="sw-lp-note">
                No saved benchmark results are available yet. Run{" "}
                <code>bun run --filter @sheetwrite/bench bench:render:scale</code> and then{" "}
                <code>bun run docs:generate</code> to publish measured numbers here.
              </p>
            }
            when={evidence}
          >
            {/* Built at docs generation from committed captures; every text value is escaped. */}
            <div class="speed-story-host" id="speed-story" innerHTML={speedStory} />
          </Show>
          <MoreLink class="sw-lp-more" href="/docs/performance/">
            See the full method and every result
          </MoreLink>
        </section>

        <section aria-labelledby="landing-close" class="sw-lp-close">
          <div>
            <h2 id="landing-close">Put a real spreadsheet in your product.</h2>
            <p>
              Start with the core package. Add the full formula engine or XLSX exchange when you
              need them.
            </p>
          </div>
          <div class="sw-lp-actions">
            <a class="sw-lp-button" href="/docs/start/installation/">
              Read the docs
            </a>
            <a class="sw-lp-button sw-lp-button--ghost" href="https://github.com/chh-ay/sheetwrite">
              View on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer class="sw-landing-footer">
        <div class="sw-landing-footer__inner">
          <div class="sw-landing-footer__brand">
            <strong>Sheetwrite</strong>
            <p>A spreadsheet engine for the browser. Rust and WebAssembly, any framework.</p>
            <span class="sw-landing-footer__meta">v{corePackage.version} · MIT licensed</span>
          </div>
          <nav aria-label="Footer" class="sw-landing-footer__nav">
            <div>
              <p class="sw-landing-footer__title">Start</p>
              <a href="/docs/start/installation/">Installation</a>
              <a href="/docs/start/first-grid/">First grid</a>
              <a href={releaseFacts.latest.href}>What's new</a>
            </div>
            <div>
              <p class="sw-landing-footer__title">Frameworks</p>
              <a href="/vanilla/">Vanilla</a>
              <a href="/react/">React</a>
              <a href="/vue/">Vue</a>
              <a href="/svelte/">Svelte</a>
            </div>
            <div>
              <p class="sw-landing-footer__title">Explore</p>
              <a href="/showcases/">Showcases</a>
              <a href="/docs/reference/formula-functions/">Formula functions</a>
              <a href="/docs/performance/">Benchmarks</a>
            </div>
            <div>
              <p class="sw-landing-footer__title">Project</p>
              <a href="https://github.com/chh-ay/sheetwrite">GitHub</a>
              <a href="https://github.com/chh-ay/sheetwrite/issues">Issues</a>
              <a href="https://www.npmjs.com/package/@sheetwrite/core">npm</a>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
