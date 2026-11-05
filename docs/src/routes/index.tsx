import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import corePackage from "../../../packages/core/package.json" with { type: "json" };
import { BrandMark } from "../components/BrandMark.js";
import { Icon, type IconName } from "../components/Icon.js";
import { ArchitectureScene } from "../components/landing/ArchitectureScene.js";
import { CodeTabs } from "../components/landing/CodeTabs.js";
import { LiveGrid } from "../components/landing/LiveGrid.js";
import EngineDefaultSnippet from "../components/landing/snippets/engine-default.mdx";
import EngineFullSnippet from "../components/landing/snippets/engine-full.mdx";
import { useScenePlayback } from "../components/landing/useScenePlayback.js";
import { PackageCommand } from "../components/PackageCommand.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import {
  count,
  kib,
  LANDING_EVIDENCE,
  type LandingBenchmarks,
  MILLION_ROWS,
} from "../lib/landing-evidence.js";
import { opensFreshDocument } from "../lib/navigation.js";
import {
  LATEST_HIGHLIGHTED_RELEASE,
  LATEST_RELEASE,
  minorVersion,
  releaseHref,
} from "../lib/releases.js";
import { pageMeta } from "../lib/seo.js";
import type { CapabilityOwnerId } from "../showcases/capabilities.js";

import landingStylesheet from "../styles/landing.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite — Spreadsheet, data grid & workbook engine · XLSX/CSV",
      "Spreadsheet and data-grid engine for multi-sheet workbooks, with XLSX/CSV exchange, Rust/WASM core, and React/Vue/Svelte framework adapters.",
    ),
    links: [{ rel: "stylesheet", href: landingStylesheet }],
  }),
  component: Landing,
});

const REPOSITORY_URL = "https://github.com/chh-ay/sheetwrite";

/** One showcase the landing previews, with the capability it proves. */
interface Feature {
  readonly owner: CapabilityOwnerId;
  readonly icon: IconName;
  readonly eyebrow: string;
  readonly label: string;
  readonly href: string;
  readonly summary: string;
}

const FEATURES: readonly Feature[] = [
  {
    owner: "spreadsheet",
    icon: "sheet",
    eyebrow: "Workbook",
    label: "Spreadsheet app",
    href: "/showcases/spreadsheet/",
    summary:
      "An Excel-style ribbon, name box, formula bar and sheet tabs around the Grid. Every command is a public API call.",
  },
  {
    owner: "formulas",
    icon: "formula",
    eyebrow: "Formulas",
    label: "Formula analysis",
    href: "/showcases/formulas/",
    summary:
      "GROUPBY, PIVOTBY, FILTER, LAMBDA, statistics and finance. Results spill, and other formulas read the spill with A2#.",
  },
  {
    owner: "analysis",
    icon: "pivot",
    eyebrow: "Analysis",
    label: "Charts & pivot tables",
    href: "/showcases/analysis/",
    summary:
      "Pivot your data and chart any range. Edit a source cell and the pivot and its chart update in place.",
  },
  {
    owner: "performance",
    icon: "bolt",
    eyebrow: "Data & scale",
    label: "Performance & scale",
    href: "/showcases/performance/",
    summary:
      "A million rows by a thousand columns. The Grid requests only the tiles on screen and keeps memory inside a fixed cache.",
  },
  {
    owner: "collaboration",
    icon: "users",
    eyebrow: "Collaboration",
    label: "Collaboration",
    href: "/showcases/collaboration/",
    summary:
      "Clients commit in order through your server. Duplicates, gaps, and conflicts recover with explicit protocol steps.",
  },
  {
    owner: "interoperability",
    icon: "file",
    eyebrow: "Import & export",
    label: "XLSX & CSV",
    href: "/showcases/interoperability/",
    summary:
      "Import and export workbooks with formulas and styles. Every lossy case returns a named warning, not a silent change.",
  },
];

/** Benchmark sizes shown as rows, in thousands or millions. */
function rowsLabel(rows: number): string {
  return rows >= MILLION_ROWS ? `${rows / MILLION_ROWS}M` : `${rows / 1_000}k`;
}

/** Shared log scale across every ratio bar: ×1 is parity (zero width). */
function ratioWidth(ratio: number, scaleMax: number): string {
  const domain = Math.log10(scaleMax);
  const percent = (Math.log10(Math.max(ratio, 1)) / domain) * 100;
  return `${Math.min(100, Math.max(percent, 3)).toFixed(1)}%`;
}

/** Headroom above the largest ratio, so the longest bar does not touch the edge. */
const BAR_SCALE_HEADROOM = 1.25;

function Landing() {
  return (
    <div className="sw-landing">
      <SiteTopbar />
      <main id="main-content">
        <Hero />
        <EvidenceStrip />
        <StartSection />
        <FeatureSection />
        <ArchitectureSection />
        <EnginesSection />
        <BenchmarkSection />
        <ClosingBand />
      </main>
      <LandingFooter />
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="landing-title" className="sw-lp-hero sw-inverse">
      <div className="sw-lp-hero__copy">
        <p className="sw-lp-hero__eyebrow">
          <span className="sw-badge" data-tone="accent">
            v{corePackage.version}
          </span>
          Open source · MIT · Rust/WASM engine
        </p>
        <h1 id="landing-title">The spreadsheet engine for your web app.</h1>
        <p className="sw-lp-hero__lead">
          A real calculation engine and a canvas Grid in your page, with the ribbon, charts and
          pivot tables of a spreadsheet app. Your application keeps the data, the UI, and the
          server.
        </p>
        <div className="sw-lp-actions">
          <Link
            className="sw-button"
            data-size="lg"
            data-variant="primary"
            params={{ _splat: "start/installation" }}
            to="/docs/$/"
          >
            Get started
            <Icon name="arrow-right" />
          </Link>
          <Link className="sw-button" data-size="lg" to="/showcases/">
            Explore showcases
          </Link>
        </div>
        <PackageCommand packages="@sheetwrite/core" />
      </div>
      <LiveGrid />
    </section>
  );
}

/** One measured fact: a number, what it means, and where it comes from. */
function Fact({
  icon,
  value,
  children,
  href,
  source,
}: {
  readonly icon: IconName;
  readonly value: string;
  readonly children: ReactNode;
  readonly href: string;
  readonly source: string;
}) {
  return (
    <div className="sw-lp-fact">
      <dt>
        <Icon name={icon} size="md" />
        <span className="sw-lp-fact__value">{value}</span>
      </dt>
      <dd>
        {children}
        <a className="sw-lp-fact__source" href={href}>
          {source}
        </a>
      </dd>
    </div>
  );
}

function EvidenceStrip() {
  const { benchmarks, downloads, compatibility } = LANDING_EVIDENCE;
  const millionRow = benchmarks?.sizes.find((entry) => entry.size === MILLION_ROWS);
  return (
    <section aria-label="Measured results" className="sw-lp-evidence">
      <dl>
        {benchmarks ? (
          <Fact
            href="#benchmarks"
            icon="bolt"
            source="Saved browser capture"
            value={`${benchmarks.heroStats.millionRowMedianMs} ms`}
          >
            median interaction at {count(MILLION_ROWS)} rows
          </Fact>
        ) : null}
        {benchmarks && millionRow ? (
          <Fact
            href="#benchmarks"
            icon="gauge"
            source="Same capture"
            value={`${millionRow.medianRatio}×`}
          >
            median speed against Handsontable {benchmarks.capture.engineVersions.handsontable}
          </Fact>
        ) : null}
        <Fact
          href="/docs/reference/compatibility-results/"
          icon="shield"
          source="Compatibility results"
          value={`${count(compatibility.localPassed)} / ${count(compatibility.totalTests)}`}
        >
          Excel compatibility checks pass, {count(compatibility.regressions)} regressions
        </Fact>
        {downloads ? (
          <Fact
            href="/docs/performance/delivery-size/"
            icon="download"
            source="Size report"
            value={kib(downloads.coreFirstLoadBrotliBytes)}
          >
            first load with the default engine, Brotli, in a Vite app
          </Fact>
        ) : null}
      </dl>
    </section>
  );
}

/** A section heading block: eyebrow, title and a short introduction. */
function SectionHead({
  id,
  eyebrow,
  title,
  children,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="sw-lp-head">
      <p className="sw-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {children}
    </header>
  );
}

function StartSection() {
  return (
    <section aria-labelledby="landing-start" className="sw-lp-section sw-lp-start">
      <SectionHead
        eyebrow="Start in minutes"
        id="landing-start"
        title="Mount a Grid in the framework you already use."
      >
        <p>
          One engine, four entry points. The adapters share one lifecycle: create on mount, apply
          live option changes, and destroy on unmount.
        </p>
        <ol className="sw-lp-steps">
          <li>
            <Icon name="download" />
            Install <code>@sheetwrite/core</code>
          </li>
          <li>
            <Icon name="sheet" />
            Create a Grid with a workbook and its rows
          </li>
          <li>
            <Icon name="live" />
            Listen to committed changes and save them your way
          </li>
        </ol>
        <Link className="sw-link-arrow" params={{ _splat: "start/first-grid" }} to="/docs/$/">
          Build your first grid
          <Icon name="arrow-right" />
        </Link>
      </SectionHead>
      <CodeTabs />
    </section>
  );
}

function FeatureSection() {
  return (
    <section aria-labelledby="landing-features" className="sw-lp-section">
      <SectionHead
        eyebrow="What you can build"
        id="landing-features"
        title="Real workbooks, not a table with formulas on top."
      >
        <p>
          Every card opens a live example that runs the real engine in your browser, with{" "}
          {count(LANDING_EVIDENCE.functionCount)} formula functions behind it.
        </p>
      </SectionHead>
      <ul className="sw-lp-features">
        {FEATURES.map((feature) => (
          <li key={feature.owner}>
            <FeatureCard feature={feature} />
          </li>
        ))}
      </ul>
      <Link className="sw-link-arrow" to="/showcases/">
        See every showcase
        <Icon name="arrow-right" />
      </Link>
    </section>
  );
}

/** A showcase card with a screenshot of the live example in the page's theme. */
function FeatureCard({ feature }: { readonly feature: Feature }) {
  return (
    <Link
      className="sw-card sw-lp-feature"
      data-feature={feature.owner}
      reloadDocument={opensFreshDocument(feature.href)}
      to={feature.href}
    >
      <span className="sw-lp-feature__preview">
        {(["light", "dark"] as const).map((theme) => (
          <img
            alt=""
            data-theme-image={theme}
            decoding="async"
            height={400}
            key={theme}
            loading="lazy"
            src={`/showcase-previews/${feature.owner}-${theme}.jpg`}
            width={640}
          />
        ))}
      </span>
      <span className="sw-lp-feature__eyebrow">
        <Icon name={feature.icon} />
        {feature.eyebrow}
      </span>
      <strong className="sw-card__title">{feature.label}</strong>
      <span className="sw-card__body">{feature.summary}</span>
      <span className="sw-link-arrow">
        Open the live example
        <Icon name="arrow-right" />
      </span>
    </Link>
  );
}

function ArchitectureSection() {
  return (
    <section aria-labelledby="landing-how" className="sw-lp-section">
      <SectionHead
        eyebrow="How it works"
        id="landing-how"
        title="Three layers. One clear line of ownership."
      >
        <p>
          The Grid handles input and painting. The engine stores cells and recalculates. Your
          application decides what to save and where.
        </p>
      </SectionHead>
      <ArchitectureScene />
      <Link
        className="sw-link-arrow"
        params={{ _splat: "concepts/runtime-ownership" }}
        to="/docs/$/"
      >
        Read the runtime-ownership model
        <Icon name="arrow-right" />
      </Link>
    </section>
  );
}

function EnginesSection() {
  const { downloads } = LANDING_EVIDENCE;
  return (
    <section aria-labelledby="landing-engine" className="sw-lp-section">
      <SectionHead
        eyebrow="Formula engines"
        id="landing-engine"
        title="Pick the formula engine that fits your download budget."
      />
      <div className="sw-lp-engines">
        <article className="sw-card sw-lp-engine">
          <span className="sw-badge">Default</span>
          <h3 className="sw-card__title">@sheetwrite/wasm</h3>
          <p className="sw-card__body">
            Included by the core package. The standard function set and the smaller download.
          </p>
          {downloads ? (
            <p className="sw-lp-engine__size">
              <strong>{kib(downloads.defaultEngineBrotliBytes)}</strong> WASM, Brotli
            </p>
          ) : null}
          <EngineDefaultSnippet />
        </article>
        <article className="sw-card sw-lp-engine" data-variant="full">
          <span className="sw-badge" data-tone="accent">
            Full
          </span>
          <h3 className="sw-card__title">@sheetwrite/formulas</h3>
          <p className="sw-card__body">
            The same engine with the analysis families: grouping, pivots, LAMBDA, statistics,
            regression, finance, regex, and matrices.
          </p>
          {downloads ? (
            <p className="sw-lp-engine__size">
              <strong>{kib(downloads.fullEngineBrotliBytes)}</strong> WASM, Brotli
            </p>
          ) : null}
          <EngineFullSnippet />
        </article>
        {LATEST_HIGHLIGHTED_RELEASE !== undefined ? (
          <aside aria-labelledby="landing-new" className="sw-card sw-lp-new">
            <span className="sw-badge" data-tone="info">
              <Icon name="sparkle" />
              New in {minorVersion(LATEST_HIGHLIGHTED_RELEASE.version)}
            </span>
            <h3 className="sw-card__title" id="landing-new">
              What changed
            </h3>
            <ul>
              {LATEST_HIGHLIGHTED_RELEASE.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            <Link className="sw-link-arrow" to={releaseHref(LATEST_HIGHLIGHTED_RELEASE.version)}>
              Read the release notes
              <Icon name="arrow-right" />
            </Link>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function BenchmarkSection() {
  const { benchmarks } = LANDING_EVIDENCE;
  return (
    <section aria-labelledby="landing-bench" className="sw-lp-section" id="benchmarks">
      <SectionHead
        eyebrow="Results you can check"
        id="landing-bench"
        title="Measured, not promised."
      >
        <p>
          Median interaction ratios against Handsontable
          {benchmarks ? ` ${benchmarks.capture.engineVersions.handsontable}` : ""} in one saved
          browser capture. Every interaction must return the correct result; failed runs stay
          failed.
        </p>
      </SectionHead>
      {benchmarks ? (
        <BenchmarkBars benchmarks={benchmarks} />
      ) : (
        <p className="sw-lp-note">
          No saved benchmark results are available yet. Run{" "}
          <code>bun run --filter @sheetwrite/bench bench:render:scale</code> and then{" "}
          <code>bun run docs:generate</code> to publish measured numbers here.
        </p>
      )}
      <Link className="sw-link-arrow" params={{ _splat: "performance" }} to="/docs/$/">
        See the full method and every result
        <Icon name="arrow-right" />
      </Link>
    </section>
  );
}

function BenchmarkBars({ benchmarks }: { readonly benchmarks: LandingBenchmarks }) {
  const { ref } = useScenePlayback<HTMLDivElement>();
  const scaleMax =
    Math.max(...benchmarks.sizes.map((entry) => entry.medianRatio)) * BAR_SCALE_HEADROOM;
  return (
    <div className="sw-card sw-bench" data-scale="logarithmic" ref={ref}>
      <ul className="sw-bench__bars">
        {benchmarks.sizes.map((entry) => (
          <li key={entry.size}>
            <span className="sw-bench__size">{rowsLabel(entry.size)} rows</span>
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
          <dd>{benchmarks.capture.browser}</dd>
        </div>
        <div>
          <dt>Rounds</dt>
          <dd>{benchmarks.capture.rounds} counterbalanced</dd>
        </div>
        <div>
          <dt>Commit</dt>
          <dd>
            <code>{benchmarks.capture.commit.slice(0, 7)}</code>
          </dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{benchmarks.capture.timestamp.slice(0, 10)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ClosingBand() {
  return (
    <section aria-labelledby="landing-close" className="sw-lp-close sw-inverse">
      <div>
        <h2 id="landing-close">Put a real spreadsheet in your product.</h2>
        <p>
          Start with the core package. Add the full formula engine or XLSX exchange when you need
          them.
        </p>
      </div>
      <div className="sw-lp-actions">
        <Link
          className="sw-button"
          data-size="lg"
          data-variant="primary"
          params={{ _splat: "start/installation" }}
          to="/docs/$/"
        >
          Read the docs
          <Icon name="arrow-right" />
        </Link>
        <a className="sw-button" data-size="lg" href={REPOSITORY_URL}>
          View on GitHub
          <Icon name="external" />
        </a>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="sw-landing-footer">
      <div className="sw-landing-footer__inner">
        <div className="sw-landing-footer__brand">
          <strong>
            <BrandMark />
            Sheetwrite
          </strong>
          <p>A spreadsheet engine for the browser. Rust and WebAssembly, any framework.</p>
          <span className="sw-landing-footer__meta">v{corePackage.version} · MIT licensed</span>
        </div>
        <nav aria-label="Footer" className="sw-landing-footer__nav">
          <div>
            <p className="sw-landing-footer__title">Start</p>
            <Link params={{ _splat: "start/installation" }} to="/docs/$/">
              Installation
            </Link>
            <Link params={{ _splat: "start/first-grid" }} to="/docs/$/">
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
            <Link params={{ _splat: "reference/formula-functions" }} to="/docs/$/">
              Formula functions
            </Link>
            <Link params={{ _splat: "performance" }} to="/docs/$/">
              Benchmarks
            </Link>
          </div>
          <div>
            <p className="sw-landing-footer__title">Project</p>
            <a href={REPOSITORY_URL}>GitHub</a>
            <a href={`${REPOSITORY_URL}/issues`}>Issues</a>
            <a href="https://www.npmjs.com/package/@sheetwrite/core">npm</a>
          </div>
        </nav>
      </div>
    </footer>
  );
}
