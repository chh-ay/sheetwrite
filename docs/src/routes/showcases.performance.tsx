import speedStory from "@docs/generated/landing-story.html?raw";
import { formatBytes } from "@docs/lib/format.js";
import { pageMeta } from "@docs/lib/seo.js";
import {
  COMPARISON_EVIDENCE,
  INTERACTION_EVIDENCE,
  PAGE_LATENCY_MS,
  PAGED_EVIDENCE,
  SCALE_COLUMNS,
  SCALE_LOGICAL_CELLS,
  SCALE_ROWS,
} from "@docs/showcases/scenarios/scale.js";
import { createFileRoute } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { NoHydration } from "solid-js/web";

import { PagingDiagram } from "../art/diagrams.js";
import { Island } from "../islands/Island.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { ShowcasePage } from "../showcases/layout/ShowcasePage.js";
import { PerformanceDiagnostics } from "../showcases/performance/PerformanceDiagnostics.js";
import { PerformanceStage } from "../showcases/performance/PerformanceStage.js";
import PerformanceSnippet from "../showcases/snippets/performance.mdx";
import PerformanceSnippetSource from "../showcases/snippets/performance.mdx?source";

import artStylesheet from "../art/art.css?url";
import stylesheet from "../styles/showcases/performance.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

const description =
  "A live grid over 1,000,000 rows by 1,000 columns: windowed loading, a bounded cache, sparse edits and measured runtime evidence, in your browser.";

export const Route = createFileRoute("/showcases/performance")({
  head: () => ({
    meta: pageMeta("One-billion-address Grid — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: stylesheet },
    ],
  }),
  component: PerformanceShowcase,
});

const formatSize = (bytes: number): string => formatBytes(bytes, { kib: 1, mib: 1, gib: 2 });

/** Below this change, the current value reads as unchanged rather than improved. */
const DELTA_FLAT_PERCENT = 0.5;
const DELTA_COARSE_PERCENT = 10;

interface InteractionWin {
  label: string;
  value: string;
  testId?: string;
  delta: { direction: "better" | "worse" | "flat"; text: string } | null;
  note: string;
}

/** Percentage change against the previous release. All four metrics are lower-is-better. */
function interactionDelta(current: number, previous: number | undefined) {
  if (previous === undefined || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }
  if (previous === 0) {
    return current === 0
      ? { direction: "flat" as const, text: "unchanged from the previous release" }
      : null;
  }
  const percent = ((current - previous) / previous) * 100;
  const magnitude = Math.abs(percent);
  if (magnitude < DELTA_FLAT_PERCENT) {
    return { direction: "flat" as const, text: "unchanged from the previous release" };
  }
  const shown = magnitude >= DELTA_COARSE_PERCENT ? magnitude.toFixed(0) : magnitude.toFixed(1);
  return {
    direction: percent < 0 ? ("better" as const) : ("worse" as const),
    text: `${shown}% ${percent < 0 ? "lower" : "higher"} than the previous release`,
  };
}

/**
 * The four decision-record cards. Each states the current capture; a change
 * line appears only when the evidence file records a previous capture of the
 * same schema.
 */
function interactionWinList(): InteractionWin[] {
  const { current, previous, ceilings } = INTERACTION_EVIDENCE;
  return [
    {
      label: "Lookup latency",
      value: `${current.lookupMedianNs.toFixed(2)} ns`,
      delta: interactionDelta(current.lookupMedianNs, previous?.lookupMedianNs),
      note: `Median address lookup. p95 ${current.lookupP95Ns.toFixed(0)} ns, release ceiling ${ceilings.lookupP95Ns.toLocaleString("en-US")} ns.`,
    },
    {
      label: "Inverse index",
      value: formatSize(current.viewIndexBytes),
      delta: interactionDelta(current.viewIndexBytes, previous?.viewIndexBytes),
      note: `Retained inverse row index for 1,000,000 rows. Ceiling ${formatSize(ceilings.inverseIndexBytes)}.`,
    },
    {
      label: "100 distant edits",
      value: formatSize(current.dirty100Bytes),
      delta: interactionDelta(current.dirty100Bytes, previous?.dirty100Bytes),
      note: `Retained dirty-cell memory: sparse edits stay sparse. Ceiling ${formatSize(ceilings.dirty100Bytes)}.`,
    },
    {
      label: "Owned cold long task",
      value: `${current.coldOwnedLongTaskMs.toFixed(1)} ms`,
      testId: "scale-evidence-cold",
      delta: interactionDelta(current.coldOwnedLongTaskMs, previous?.coldOwnedLongTaskMs),
      note: `Longest Sheetwrite-owned task during a cold page load. Ceiling ${ceilings.ownedColdLongTaskMs} ms.`,
    },
  ];
}

/** The disclosure summary the performance sections share. */
function DisclosureSummary(props: Readonly<{ title: string; note: string }>) {
  return (
    <summary>
      <span class="sw-sp-disclosure-copy">
        <strong>{props.title}</strong>
        <small>{props.note}</small>
      </span>
      <span aria-hidden="true" class="sw-sp-disclosure-chevron">
        ›
      </span>
    </summary>
  );
}

/** Recorded evidence: the speed comparison, the decision-record cards and their sources. */
function EvidenceSection() {
  return (
    <section aria-labelledby="evidence-title" class="sw-sp-section sw-sp-proof" id="evidence">
      <div class="sw-sp-proof-heading">
        <div>
          <h2 class="sw-showcase__section-title" id="evidence-title">
            The working set stays bounded as the address space grows
          </h2>
        </div>
        <p>
          Repeated measured runs, recorded by the benchmark suite: the Grid never needs a resident
          billion-cell matrix.
        </p>
      </div>

      <div class="sw-sp-proof-layout">
        <Show when={COMPARISON_EVIDENCE.available && speedStory !== ""}>
          <article class="sw-sp-scale-curve" data-testid="scale-evidence-compare">
            {/* Built at docs generation from committed captures; every text value is escaped. */}
            <div class="speed-story-host" id="speed-story" innerHTML={speedStory} />
          </article>
        </Show>

        <div class="sw-sp-proof-wins" data-testid="scale-evidence-interaction">
          <For each={interactionWinList()}>
            {(win) => (
              <article>
                <span>{win.label}</span>
                <div class="sw-sp-proof-wins__value">
                  <strong data-testid={win.testId}>{win.value}</strong>
                  <Show when={win.delta}>
                    {(delta) => (
                      <span class="sw-sp-evidence-delta" data-direction={delta().direction}>
                        {delta().text}
                      </span>
                    )}
                  </Show>
                </div>
                <p>{win.note}</p>
              </article>
            )}
          </For>
        </div>
      </div>

      <details class="sw-sp-proof-sources">
        <DisclosureSummary
          note="3 committed evidence files"
          title="Inspect sources and methodology"
        />
        <div class="sw-sp-proof-sources__body">
          <section>
            <p class="sw-sp-provenance" data-testid="scale-evidence-paged-provenance">
              <code>{PAGED_EVIDENCE.source}</code>
              <span>
                {PAGED_EVIDENCE.protocol} · {PAGED_EVIDENCE.rows.toLocaleString("en")} rows ×{" "}
                {PAGED_EVIDENCE.columns} columns · {PAGED_EVIDENCE.pageRows}-row pages
              </span>
            </p>
            <dl class="sw-sp-proof-distribution" data-testid="scale-evidence-paged">
              <div>
                <dt>Startup</dt>
                <dd>{PAGED_EVIDENCE.startup.medianMs.toFixed(2)} ms median</dd>
                <dd>{PAGED_EVIDENCE.startup.p95Ms.toFixed(2)} ms p95</dd>
              </div>
              <div>
                <dt>First page</dt>
                <dd>{PAGED_EVIDENCE.firstPage.medianMs.toFixed(2)} ms median</dd>
                <dd>{PAGED_EVIDENCE.firstPage.p95Ms.toFixed(2)} ms p95</dd>
              </div>
              <div>
                <dt>Distant page</dt>
                <dd>{PAGED_EVIDENCE.distantPage.medianMs.toFixed(2)} ms median</dd>
                <dd>{PAGED_EVIDENCE.distantPage.p95Ms.toFixed(2)} ms p95</dd>
              </div>
              <div>
                <dt>Peak allocated</dt>
                <dd>{formatSize(PAGED_EVIDENCE.peakAllocatedBytes)}</dd>
              </div>
            </dl>
          </section>
          <section>
            <p class="sw-sp-provenance" data-testid="scale-evidence-interaction-provenance">
              <code>{INTERACTION_EVIDENCE.source}</code>
              <span>
                {INTERACTION_EVIDENCE.protocol} · {INTERACTION_EVIDENCE.capture.samples} samples ·{" "}
                {INTERACTION_EVIDENCE.capture.browser} · commit{" "}
                {INTERACTION_EVIDENCE.capture.commit.slice(0, 10)}
              </span>
            </p>
          </section>
          <Show when={COMPARISON_EVIDENCE.available}>
            <section>
              <p class="sw-sp-provenance" data-testid="scale-evidence-compare-provenance">
                <code>{COMPARISON_EVIDENCE.source}</code>
                <span>
                  {COMPARISON_EVIDENCE.capture.browser} · {COMPARISON_EVIDENCE.capture.rounds}{" "}
                  rounds · commit {COMPARISON_EVIDENCE.capture.commit.slice(0, 10)}
                </span>
              </p>
            </section>
          </Show>
        </div>
      </details>

      <p class="sw-sp-note sw-sp-note--rule">
        The live source adds a measured {PAGE_LATENCY_MS} ms delay after its first request so
        loading remains observable. Live diagnostics and checked captures stay separate.
      </p>
    </section>
  );
}

function PerformanceShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{
          title: "The code behind it",
          Snippet: PerformanceSnippet,
          source: PerformanceSnippetSource,
        }}
        explain={
          <ShowcaseSection
            figure={<PagingDiagram />}
            id="performance-paging"
            title="What stays loaded"
          >
            <p>
              Rows load in pages. The pages in view and the ones near them stay in memory, within a
              budget for unedited pages. Pages further away are evicted, and your page provider
              fetches them again when you scroll back.
            </p>
          </ShowcaseSection>
        }
        eyebrow="Data and scale"
        facts={[
          { label: "Rows", value: SCALE_ROWS.toLocaleString("en") },
          { label: "Columns", value: SCALE_COLUMNS.toLocaleString("en") },
          { label: "Addresses", value: SCALE_LOGICAL_CELLS.toLocaleString("en") },
        ]}
        guide={{ href: "/docs/features/data/datasources/", label: "Read the datasource guide" }}
        id="performance"
        stage={
          <Island
            component={PerformanceStage}
            name="showcase-performance"
            props={{
              demoTitle: `Financial operations · ${SCALE_ROWS.toLocaleString("en")} × ${SCALE_COLUMNS.toLocaleString("en")}`,
            }}
          />
        }
        task={
          <>
            Fly through {SCALE_ROWS.toLocaleString("en")} rows ×{" "}
            {SCALE_COLUMNS.toLocaleString("en")} columns of financial operations, or go to any cell.
            Only the tiles you visit load.
          </>
        }
        title="A billion cells. Within reach."
      >
        <div class="sw-sp-page">
          <Island
            component={PerformanceDiagnostics}
            name="showcase-performance-diagnostics"
            props={{}}
          />
          <EvidenceSection />
        </div>
      </ShowcasePage>
    </NoHydration>
  );
}
