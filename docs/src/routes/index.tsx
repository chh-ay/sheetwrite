import { createFileRoute, Link } from "@tanstack/react-router";

import corePackage from "../../../packages/core/package.json" with { type: "json" };
import { ArchitectureScene } from "../components/landing/ArchitectureScene.js";
import { CodeTabs } from "../components/landing/CodeTabs.js";
import { FeatureGlyph, type FeatureGlyphKind } from "../components/landing/FeatureGlyph.js";
import { GridGlow } from "../components/landing/GridGlow.js";
import { HeroApp } from "../components/landing/HeroApp.js";
import { StoryReel } from "../components/landing/StoryReel.js";
import { useScenePlayback } from "../components/landing/useScenePlayback.js";
import { PackageCommand } from "../components/PackageCommand.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
import { opensFreshDocument } from "../lib/navigation.js";
import {
  LATEST_HIGHLIGHTED_RELEASE,
  LATEST_RELEASE,
  minorVersion,
  releaseHref,
} from "../lib/releases.js";
import { pageMeta } from "../lib/seo.js";

import landingStylesheet from "../styles/landing.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite — Spreadsheet, data grid & multi-sheet workbook engine · XLSX/CSV",
      "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.",
    ),
    links: [{ rel: "stylesheet", href: landingStylesheet }],
  }),
  component: Landing,
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

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

/** Shared log scale across every ratio bar: ×1 is parity (zero width). */
function ratioWidth(ratio: number, scaleMax: number): string {
  const domain = Math.log10(scaleMax);
  const pct = (Math.log10(Math.max(ratio, 1)) / domain) * 100;
  return `${Math.min(100, Math.max(pct, 3)).toFixed(1)}%`;
}

function BenchmarkBars({ evidence }: Readonly<{ evidence: LandingEvidence }>) {
  const { ref } = useScenePlayback<HTMLDivElement>();
  const scaleMax = Math.max(...evidence.sizes.map((entry) => entry.medianRatio)) * 1.25;
  return (
    <div
      className="sw-bench"
      ref={ref}
      data-scale="logarithmic"
      data-scale-min={1}
      data-scale-max={scaleMax}
    >
      <ul className="sw-bench__bars">
        {evidence.sizes.map((entry) => (
          <li key={entry.size}>
            <span className="sw-bench__size">{fmtRows(entry.size)} rows</span>
            <span aria-hidden="true" className="sw-bench__track">
              <i style={{ width: ratioWidth(entry.medianRatio, scaleMax) }} />
            </span>
            <strong>{entry.medianRatio}×</strong>
            <span className="sw-bench__detail">
              median of {entry.comparedScenarios} interactions
              {entry.handsontableIncomplete > 0
                ? ` · Handsontable did not finish ${entry.handsontableIncomplete}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="sw-bench__scale">
        Bar length uses a log scale from 1× (as fast as Handsontable) to {scaleMax.toFixed(0)}×.
      </p>
      <dl className="sw-bench__capture">
        <div>
          <dt>Browser</dt>
          <dd>{evidence.capture.browser}</dd>
        </div>
        <div>
          <dt>Rounds</dt>
          <dd>{evidence.capture.rounds} counterbalanced</dd>
        </div>
        <div>
          <dt>Commit</dt>
          <dd>
            <code>{evidence.capture.commit.slice(0, 7)}</code>
          </dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{evidence.capture.timestamp.slice(0, 10)}</dd>
        </div>
      </dl>
    </div>
  );
}

function FeatureCards() {
  const { ref } = useScenePlayback<HTMLOListElement>();
  return (
    <ol className="sw-features" ref={ref}>
      {FEATURES.map((feature) => (
        <li key={feature.kind}>
          <Link
            data-feature={feature.kind}
            reloadDocument={opensFreshDocument(feature.href)}
            to={feature.href}
          >
            <span className="sw-features__art">
              <FeatureGlyph kind={feature.kind} />
            </span>
            <strong>{feature.label}</strong>
            <span className="sw-features__summary">{feature.summary}</span>
            <span className="sw-features__cta">Open the live example →</span>
          </Link>
        </li>
      ))}
    </ol>
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
  return (
    <div className="sw-landing">
      <GridGlow />
      <SiteTopbar />

      <main id="main-content">
        <section aria-labelledby="landing-title" className="sw-lp-hero">
          <div className="sw-lp-hero__copy">
            <p className="sw-lp-eyebrow">
              Open source · MIT · v{corePackage.version}
              <span className="sw-lp-eyebrow__extra"> · Rust/WASM engine</span>
            </p>
            <h1 id="landing-title">The spreadsheet engine for your web app.</h1>
            <p className="sw-lp-hero__lede">
              A real calculation engine and a canvas Grid in your page, with the ribbon, charts and
              pivot tables of a spreadsheet app. Your application keeps the data, the UI, and the
              server.
            </p>
          </div>
          <div className="sw-lp-hero__start">
            <div className="sw-lp-actions">
              <Link
                className="sw-lp-button"
                to="/docs/$/"
                params={{ _splat: "start/installation" }}
              >
                Get started
              </Link>
              <Link className="sw-lp-button sw-lp-button--ghost" to="/showcases/">
                Explore showcases
              </Link>
            </div>
            <div className="sw-lp-hero__install">
              <PackageCommand packages="@sheetwrite/core" />
            </div>
          </div>
          <HeroApp />
        </section>

        {evidence ? (
          <section aria-label="Measured results" className="sw-lp-facts">
            <dl>
              <div>
                <dt>{evidence.heroStats.millionRowMedianMs} ms</dt>
                <dd>median interaction at 1,000,000 rows</dd>
              </div>
              {millionRow ? (
                <div>
                  <dt>{millionRow.medianRatio}×</dt>
                  <dd>median speed against Handsontable, same capture</dd>
                </div>
              ) : null}
              <div>
                <dt>1,000,000,000</dt>
                <dd>addressable cells in the performance example</dd>
              </div>
              {downloads ? (
                <div>
                  <dt>{kib(downloads.coreFirstLoadBrotliBytes)}</dt>
                  <dd>first load with the default engine, Brotli, in a Vite app</dd>
                </div>
              ) : null}
            </dl>
            <a href="#benchmarks">How we measured →</a>
          </section>
        ) : null}

        <section aria-labelledby="landing-how" className="sw-lp-section">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">How it works</p>
            <h2 id="landing-how">Three layers. One clear line of ownership.</h2>
            <p>
              The Grid handles input and painting. The engine stores cells and recalculates. Your
              application decides what to save and where.
            </p>
          </header>
          <ArchitectureScene />
          <Link
            className="sw-lp-more"
            to="/docs/$/"
            params={{ _splat: "concepts/runtime-ownership" }}
          >
            Read the runtime-ownership model →
          </Link>
        </section>

        <section aria-labelledby="landing-features" className="sw-lp-section">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">What you can build</p>
            <h2 id="landing-features">Real workbooks, not a table with formulas on top.</h2>
            <p>
              Every card opens a live example that runs the real engine in your browser.{" "}
              <Link to="/showcases/">See all showcases →</Link>
            </p>
          </header>
          <FeatureCards />
        </section>

        <section aria-labelledby="landing-stories" className="sw-lp-section">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">See it happen</p>
            <h2 id="landing-stories">The hard parts of a spreadsheet, handled.</h2>
            <p>
              Three short stories about work that a table component leaves to you. Each one links to
              the live example that runs it for real.
            </p>
          </header>
          <StoryReel />
        </section>

        <section aria-labelledby="landing-code" className="sw-lp-section sw-lp-split">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">Start in minutes</p>
            <h2 id="landing-code">Mount a Grid in the framework you already use.</h2>
            <p>
              One engine, four entry points. The adapters share one lifecycle: create on mount,
              apply live option changes, and destroy on unmount.
            </p>
            <Link className="sw-lp-more" to="/docs/$/" params={{ _splat: "start/first-grid" }}>
              Build your first grid →
            </Link>
          </header>
          <CodeTabs />
          <figure className="sw-lp-result">
            <table aria-label="The Grid the snippet renders">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  <th scope="col">Product</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ROWS.map(([product, amount], index) => (
                  <tr key={product}>
                    <th scope="row">{index + 1}</th>
                    <td>{product}</td>
                    <td>{amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <figcaption>
              What every tab renders, with these rows. You can edit cells, undo, redo, copy and
              paste.
            </figcaption>
          </figure>
        </section>

        <section aria-labelledby="landing-engine" className="sw-lp-section sw-lp-engines">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">Formula engines</p>
            <h2 id="landing-engine">Pick the formula engine that fits your download budget.</h2>
          </header>
          <div className="sw-lp-engines__choices">
            <article>
              <span>Default</span>
              <strong>@sheetwrite/wasm</strong>
              <p>
                Included by the core package. The standard function set and the smaller download.
              </p>
              {downloads ? (
                <p className="sw-lp-engines__size">
                  <b>{kib(downloads.defaultEngineBrotliBytes)}</b> WASM, Brotli
                </p>
              ) : null}
              <code>await initSheetwrite();</code>
            </article>
            <article data-variant="full">
              <span>Full</span>
              <strong>@sheetwrite/formulas</strong>
              <p>
                The same engine with the analysis families: grouping, pivots, LAMBDA, statistics,
                regression, finance, regex, and matrices.
              </p>
              {downloads ? (
                <p className="sw-lp-engines__size">
                  <b>{kib(downloads.fullEngineBrotliBytes)}</b> WASM, Brotli
                </p>
              ) : null}
              <code>await initSheetwrite(undefined, formulas);</code>
            </article>
          </div>
          {LATEST_HIGHLIGHTED_RELEASE !== undefined ? (
            <aside aria-labelledby="landing-new" className="sw-lp-new">
              <h3 id="landing-new">New in {minorVersion(LATEST_HIGHLIGHTED_RELEASE.version)}</h3>
              <ul>
                {LATEST_HIGHLIGHTED_RELEASE.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              <Link to={releaseHref(LATEST_HIGHLIGHTED_RELEASE.version)}>
                Read what is new and the upgrade checklist →
              </Link>
            </aside>
          ) : null}
        </section>

        <section aria-labelledby="landing-bench" className="sw-lp-section" id="benchmarks">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">Results you can check</p>
            <h2 id="landing-bench">Measured, not promised.</h2>
            <p>
              Median interaction ratios against Handsontable
              {evidence ? ` ${evidence.capture.engineVersions.handsontable}` : ""} in one saved
              browser capture. Every interaction must return the correct result; failed runs stay
              failed.
            </p>
          </header>
          {evidence ? (
            <BenchmarkBars evidence={evidence} />
          ) : (
            <p className="sw-lp-note">
              No saved benchmark results are available yet. Run{" "}
              <code>bun run --filter @sheetwrite/bench bench:render:scale</code> and then{" "}
              <code>bun run docs:generate</code> to publish measured numbers here.
            </p>
          )}
          <Link className="sw-lp-more" to="/docs/$/" params={{ _splat: "performance" }}>
            See the full method and every result →
          </Link>
        </section>

        <section aria-labelledby="landing-close" className="sw-lp-close">
          <div>
            <h2 id="landing-close">Put a real spreadsheet in your product.</h2>
            <p>
              Start with the core package. Add the full formula engine or XLSX exchange when you
              need them.
            </p>
          </div>
          <div className="sw-lp-actions">
            <Link className="sw-lp-button" to="/docs/$/" params={{ _splat: "start/installation" }}>
              Read the docs
            </Link>
            <a
              className="sw-lp-button sw-lp-button--ghost"
              href="https://github.com/chh-ay/sheetwrite"
            >
              View on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="sw-landing-footer">
        <div className="sw-landing-footer__inner">
          <div className="sw-landing-footer__brand">
            <strong>Sheetwrite</strong>
            <p>A spreadsheet engine for the browser. Rust and WebAssembly, any framework.</p>
            <span className="sw-landing-footer__meta">v{corePackage.version} · MIT licensed</span>
          </div>
          <nav aria-label="Footer" className="sw-landing-footer__nav">
            <div>
              <p className="sw-landing-footer__title">Start</p>
              <Link to="/docs/$/" params={{ _splat: "start/installation" }}>
                Installation
              </Link>
              <Link to="/docs/$/" params={{ _splat: "start/first-grid" }}>
                First grid
              </Link>
              <Link to={releaseHref(LATEST_RELEASE.version)}>What's new</Link>
            </div>
            <div>
              <p className="sw-landing-footer__title">Frameworks</p>
              <Link to="/vanilla/">Vanilla</Link>
              <Link to="/react/">React</Link>
              <Link to="/vue/">Vue</Link>
              <Link to="/svelte/">Svelte</Link>
            </div>
            <div>
              <p className="sw-landing-footer__title">Explore</p>
              <Link to="/showcases/">Showcases</Link>
              <Link to="/docs/$/" params={{ _splat: "reference/formula-functions" }}>
                Formula functions
              </Link>
              <Link to="/docs/$/" params={{ _splat: "performance" }}>
                Benchmarks
              </Link>
            </div>
            <div>
              <p className="sw-landing-footer__title">Project</p>
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
