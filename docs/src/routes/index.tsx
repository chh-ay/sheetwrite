import { createFileRoute, Link } from "@tanstack/react-router";
import corePackage from "../../../packages/core/package.json" with { type: "json" };
import { InstallCommand } from "../components/InstallCommand.js";
import { ArchitectureScene } from "../components/landing/ArchitectureScene.js";
import { CodeTabs } from "../components/landing/CodeTabs.js";
import { FeatureGlyph, type FeatureGlyphKind } from "../components/landing/FeatureGlyph.js";
import { GridGlow } from "../components/landing/GridGlow.js";
import { HeroScene } from "../components/landing/HeroScene.js";
import { StoryReel } from "../components/landing/StoryReel.js";
import { useScenePlayback } from "../components/landing/useScenePlayback.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import landingBench from "../generated/landing-bench.json";
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

interface LandingBenchData {
  available: boolean;
  capture?: { commit: string; timestamp: string; browser: string; rounds: number };
  heroStats?: {
    millionRowScenarios: number;
    millionRowMedianMs: number;
    millionRowHeapMb: number;
  };
  sizes?: LandingBenchSize[];
}

interface Feature {
  kind: FeatureGlyphKind;
  label: string;
  href: string;
  summary: string;
}

const FEATURES: readonly Feature[] = [
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

const RELEASE_NOTES = [
  "Array arithmetic and spill references in both engines",
  "Large undo through compressed restores and atomic sync batches",
  "Host-owned rows with stable IDs and per-record deltas",
  "Faster formula kernels, bulk loading, and streamed CSV and XLSX imports",
] as const;

function fmtRows(rows: number): string {
  return rows >= 1_000_000 ? `${rows / 1_000_000}M` : `${rows / 1_000}k`;
}

/** Shared log scale across every ratio bar: ×1 is parity (zero width). */
function ratioWidth(ratio: number, maxRatio: number): string {
  const domain = Math.log10(maxRatio * 1.25);
  const pct = (Math.log10(Math.max(ratio, 1)) / domain) * 100;
  return `${Math.min(100, Math.max(pct, 3)).toFixed(1)}%`;
}

function BenchmarkBars({ evidence }: Readonly<{ evidence: Required<LandingBenchData> }>) {
  const { ref } = useScenePlayback<HTMLDivElement>();
  const maxRatio = Math.max(...evidence.sizes.map((entry) => entry.medianRatio));
  return (
    <div className="sw-bench" ref={ref}>
      <ul className="sw-bench__bars">
        {evidence.sizes.map((entry) => (
          <li key={entry.size}>
            <span className="sw-bench__size">{fmtRows(entry.size)} rows</span>
            <span aria-hidden="true" className="sw-bench__track">
              <i style={{ width: ratioWidth(entry.medianRatio, maxRatio) }} />
            </span>
            <strong>{entry.medianRatio}×</strong>
            <span className="sw-bench__detail">
              median of {entry.comparedScenarios} interactions · best {entry.bestRatio}×
              {entry.handsontableIncomplete > 0
                ? ` · Handsontable did not finish ${entry.handsontableIncomplete}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
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
            // The formula page selects the full engine, so it opens as a fresh page.
            reloadDocument={feature.kind === "formulas"}
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
  const evidence =
    bench.available && bench.sizes && bench.heroStats && bench.capture
      ? { available: true, sizes: bench.sizes, heroStats: bench.heroStats, capture: bench.capture }
      : undefined;
  const millionRow = evidence?.sizes.find((entry) => entry.size === 1_000_000);
  return (
    <div className="sw-landing">
      <GridGlow />
      <SiteTopbar />

      <main id="main-content">
        <section aria-labelledby="landing-title" className="sw-lp-hero">
          <div className="sw-lp-hero__copy">
            <p className="sw-lp-eyebrow">
              Open source · MIT · v{corePackage.version} · Rust/WASM engine
            </p>
            <h1 id="landing-title">The spreadsheet engine for your web app.</h1>
            <p className="sw-lp-hero__lede">
              A real calculation engine and a canvas Grid in your page. Edit, recalculate, and page
              through a billion cells. Your application keeps the data, the UI, and the server.
            </p>
            <div className="sw-lp-actions">
              <a className="sw-lp-button" href="/docs/start/installation/">
                Get started
              </a>
              <a className="sw-lp-button sw-lp-button--ghost" href="/showcases/">
                Explore showcases
              </a>
            </div>
            <div className="sw-lp-hero__install">
              <InstallCommand packageName="@sheetwrite/core" />
            </div>
          </div>
          <HeroScene />
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
              <div>
                <dt>4</dt>
                <dd>adapters: Vanilla, React, Vue, Svelte</dd>
              </div>
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
          <a className="sw-lp-more" href="/docs/concepts/runtime-ownership/">
            Read the runtime-ownership model →
          </a>
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
            <a className="sw-lp-more" href="/docs/start/first-grid/">
              Build your first grid →
            </a>
          </header>
          <CodeTabs />
        </section>

        <section aria-labelledby="landing-engine" className="sw-lp-section sw-lp-engines">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">New in {corePackage.version.replace(/\.\d+$/, "")}</p>
            <h2 id="landing-engine">Pick the formula engine that fits your download budget.</h2>
          </header>
          <div className="sw-lp-engines__choices">
            <article>
              <span>Default</span>
              <strong>@sheetwrite/wasm</strong>
              <p>
                Included by the core package. The standard function set and the smaller download.
              </p>
              <code>await initSheetwrite();</code>
            </article>
            <article data-variant="full">
              <span>Full</span>
              <strong>@sheetwrite/formulas</strong>
              <p>
                The same engine with the analysis families: grouping, pivots, LAMBDA, statistics,
                regression, finance, regex, and matrices.
              </p>
              <code>await initSheetwrite(undefined, formulas);</code>
            </article>
            <ul aria-label="Also in this release">
              {RELEASE_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
              <li>
                <a href="/docs/start/whats-new/">Read what is new and the upgrade checklist →</a>
              </li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="landing-bench" className="sw-lp-section" id="benchmarks">
          <header className="sw-lp-head">
            <p className="sw-lp-eyebrow">Results you can check</p>
            <h2 id="landing-bench">Measured, not promised.</h2>
            <p>
              Median interaction ratios against Handsontable in one saved browser capture. Every
              interaction must return the correct result; failed runs stay failed.
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
          <a className="sw-lp-more" href="/docs/guides/performance-resources/">
            See the full method and every result →
          </a>
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
            <a className="sw-lp-button" href="/docs/start/installation/">
              Read the docs
            </a>
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
              <a href="/docs/start/installation/">Installation</a>
              <a href="/docs/start/first-grid/">First grid</a>
              <a href="/docs/start/whats-new/">What's new</a>
            </div>
            <div>
              <p className="sw-landing-footer__title">Frameworks</p>
              <a href="/vanilla/">Vanilla</a>
              <a href="/react/">React</a>
              <a href="/vue/">Vue</a>
              <a href="/svelte/">Svelte</a>
            </div>
            <div>
              <p className="sw-landing-footer__title">Explore</p>
              <a href="/showcases/">Showcases</a>
              <a href="/docs/reference/formula-functions/">Formula functions</a>
              <a href="/docs/guides/performance-resources/">Benchmarks</a>
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
