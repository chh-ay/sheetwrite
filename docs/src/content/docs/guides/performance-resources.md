---
title: "Performance and delivery evidence"
description: "Freshness-gated benchmark and package-size evidence for Sheetwrite."
---
Every number on this page comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.

## Release retained engine memory

WebAssembly linear memory grows but does not shrink after cells or stores are cleared. When your application is idle after a large import, clear, or workbook disposal, call [`releaseEngineMemory`](/docs/api/core/release-engine-memory/) explicitly. Sheetwrite never schedules a release automatically.

```ts prelude="core" partial="requires an initialized application at an idle point" title="Explicit idle memory release"
import { releaseEngineMemory } from "@sheetwrite/core";

const report = await releaseEngineMemory();
```

The call waits for synchronous transactions and active datasource page loads, then moves all live stores together into a fresh instance of the selected engine. Cell sources, styles, cached formula results (including volatile results), resident datasource pages, unsaved dirty edits, and compact undo/redo history survive. Unloaded clean pages remain unloaded and can be fetched again from the datasource. Worker renderers rebuild their frames without document-change events.

The main-thread pause scales with resident cells and compact history, so do not invoke it on an interaction-critical path. Migration temporarily needs both instances and packed transfer buffers; it can increase peak memory before garbage collection reclaims the retired instance. If preparation fails, every live store stays on the original instance. Concurrent calls share the same release.

`report.wasmBytesBefore` and `report.wasmBytesAfter` are committed linear-memory bytes, not live-cell bytes or process memory. `report.pauseMs` measures migration, excluding the idle wait. A release is not guaranteed to reduce committed bytes: surviving data, compact history, and migration scratch can still require substantial memory. Actual process-memory reclamation depends on garbage collection.

## Capture

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 05:18 → 2026-10-17 08:11 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Artifacts</dt><dd>7 validated captures from that one commit; each section states its own environment (browser or runtime) and protocol</dd></div>
</dl>

`bench:release` captures render-scale, the performance showcase's paged storage at `bench/results/paged-results.json`, the interaction evidence at `bench/results/interaction-results.json`, data, core paths, formula, formula engines, matched engines, and XLSX, then re-records the render regression baseline last. Its smoke rehearsal writes only to `bench/results/smoke/`.

The interaction capture (`bench:interaction`, schema `interaction-current-v2`) measures the current build, not a comparison: packed inverse-index lookup latency in nanoseconds, inverse-index backing bytes, retained bytes after 100 distant edits, and the cold-route long task owned by Sheetwrite. It records the raw samples, the summary derived from them, the runner, and the method, and it holds those four metrics to absolute release ceilings. Version 1 recorded a one-off before/after pair whose baseline build cannot be re-measured at a later release, so no old sample is carried forward into the current capture.

## Matched local regression check

Timing comparisons run deliberately on a controlled local machine, not as a required CI job. Capture ten fresh matched rounds, retain every raw sample, and compare the fresh artifact with the committed baseline. Any unapproved slowdown fails the local command.

```sh verify title="Zero-regression benchmark"
bun run --filter @sheetwrite/bench bench:render:prepare
cd bench
bun run src/render-driver.ts --rounds 10 --output results/render-fresh.json --markdown-output results/render-fresh.md
bun run src/check.ts --baseline results/render-baseline.json --fresh results/render-fresh.json --power-mode balanced --concurrency 1
```

A result is a regression decision only when that final baseline check passes on the declared power mode and concurrency. `bench:verify` remains a smoke and safety-ceiling check.

The committed baseline at `bench/results/render-baseline.json` pins the harness source hashes, the declared sampling, and the runner (OS, CPU, Bun, Node, Chromium, power mode, concurrency). It is therefore machine- and harness-pinned: it must be re-recorded whenever a harness file, the sampling flags, the protocol version, or the runner changes, and the release capture does that as its last step by re-recording ten controlled rounds into `bench/results/render-baseline-raw.json` and promoting that artifact over the committed baseline. Until the re-recorded baseline is committed, `bench:check` fails closed on the fingerprint mismatch instead of comparing unrelated measurements.

## Render benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 1120/1120 engine/scenario/round runs completed across 4 workbook sizes; every completed run passed its correctness checkpoints.</div>

Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 05:18 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.0 release candidate · Handsontable 18.1.2</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.3 · Node compatibility 26.3.0 · Chromium 153.0.8010.12 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Protocol</dt><dd>10 rounds · raw artifact <code>bench/results/render-scale.json</code></dd></div>
</dl>

<figure class="bench-viz bench-widget" data-pagefind-ignore>
<input type="radio" name="bench-size" id="bench-size-1000">
<input type="radio" name="bench-size" id="bench-size-10000">
<input type="radio" name="bench-size" id="bench-size-100000">
<input type="radio" name="bench-size" id="bench-size-1000000">
<input type="radio" name="bench-metric" id="bench-metric-speed">
<input type="radio" name="bench-metric" id="bench-metric-memory">
<div class="bench-widget__tabs">
<div class="bench-tabs" aria-label="Workbook size">
<label for="bench-size-1000">1k rows</label>
<label for="bench-size-10000">10k rows</label>
<label for="bench-size-100000">100k rows</label>
<label for="bench-size-1000000">1M rows</label>
</div>
<div class="bench-tabs bench-tabs--metric" aria-label="Metric">
<label for="bench-metric-speed">Speed</label>
<label for="bench-metric-memory">Memory</label>
</div>
</div>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:20.00%">0.01</span><span class="bench-ruler__tick" style="left:40.00%">0.1</span><span class="bench-ruler__tick" style="left:60.00%">1</span><span class="bench-ruler__tick" style="left:80.00%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>14.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.21%"></i><i class="bench-bar__fill" style="width:60.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.07 ms</b><b class="bench-num" data-stat="p95">1.15 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.99%"></i><i class="bench-bar__fill" style="width:83.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.6 ms</b><b class="bench-num" data-stat="p95">15.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>4.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.71%"></i><i class="bench-bar__fill" style="width:60.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.02 ms</b><b class="bench-num" data-stat="p95">1.08 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.32%"></i><i class="bench-bar__fill" style="width:72.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.02 ms</b><b class="bench-num" data-stat="p95">4.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>21.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.47%"></i><i class="bench-bar__fill" style="width:51.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.43%"></i><i class="bench-bar__fill" style="width:78.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.28 ms</b><b class="bench-num" data-stat="p95">8.34 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>43.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.62%"></i><i class="bench-bar__fill" style="width:48.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:81.22%"></i><i class="bench-bar__fill" style="width:81.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.3 ms</b><b class="bench-num" data-stat="p95">11.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.34%"></i><i class="bench-bar__fill" style="width:53.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.45 ms</b><b class="bench-num" data-stat="p95">0.46 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.90%"></i><i class="bench-bar__fill" style="width:59.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.95 ms</b><b class="bench-num" data-stat="p95">0.99 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.45%"></i><i class="bench-bar__fill" style="width:53.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.53 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.12%"></i><i class="bench-bar__fill" style="width:59.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.99 ms</b><b class="bench-num" data-stat="p95">1.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.97%"></i><i class="bench-bar__fill" style="width:52.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.45 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.07%"></i><i class="bench-bar__fill" style="width:62.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.42 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>6.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.47%"></i><i class="bench-bar__fill" style="width:56.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.70 ms</b><b class="bench-num" data-stat="p95">0.75 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.75%"></i><i class="bench-bar__fill" style="width:73.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.60 ms</b><b class="bench-num" data-stat="p95">4.87 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>6.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.22%"></i><i class="bench-bar__fill" style="width:58.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.83 ms</b><b class="bench-num" data-stat="p95">0.91 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.12%"></i><i class="bench-bar__fill" style="width:74.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.40 ms</b><b class="bench-num" data-stat="p95">5.70 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>6.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.07%"></i><i class="bench-bar__fill" style="width:58.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.89 ms</b><b class="bench-num" data-stat="p95">1.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.40%"></i><i class="bench-bar__fill" style="width:75.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.74 ms</b><b class="bench-num" data-stat="p95">5.89 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.21%"></i><i class="bench-bar__fill" style="width:54.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.54 ms</b><b class="bench-num" data-stat="p95">0.58 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.18%"></i><i class="bench-bar__fill" style="width:62.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.38 ms</b><b class="bench-num" data-stat="p95">1.44 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.24%"></i><i class="bench-bar__fill" style="width:54.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">0.58 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.40%"></i><i class="bench-bar__fill" style="width:61.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.25 ms</b><b class="bench-num" data-stat="p95">1.32 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>9.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.82%"></i><i class="bench-bar__fill" style="width:51.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.37 ms</b><b class="bench-num" data-stat="p95">0.39 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.05%"></i><i class="bench-bar__fill" style="width:70.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.38 ms</b><b class="bench-num" data-stat="p95">3.57 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>1112.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.42%"></i><i class="bench-bar__fill" style="width:11.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.24%"></i><i class="bench-bar__fill" style="width:72.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.02 ms</b><b class="bench-num" data-stat="p95">4.09 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">8.1 MB</span><span class="bench-ruler__tick" style="left:50.00%">16.2 MB</span><span class="bench-ruler__tick" style="left:75.00%">24.3 MB</span><span class="bench-ruler__tick" style="left:100.00%">32.4 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.9 MB</b><b class="bench-num" data-stat="p95">2.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.5 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.0 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:50.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.4 MB</b><b class="bench-num" data-stat="p95">3.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.4 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:58.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.8 MB</b><b class="bench-num" data-stat="p95">3.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.1 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:52.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.0 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.0 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:63.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.7 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.5 MB</b><b class="bench-num" data-stat="p95">2.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:72.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.6 MB</b><b class="bench-num" data-stat="p95">7.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.4 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:71.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.1 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:71.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.3 MB</b><b class="bench-num" data-stat="p95">8.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:76.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.7 MB</b><b class="bench-num" data-stat="p95">4.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:66.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.4 MB</b><b class="bench-num" data-stat="p95">2.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.2 MB</b><b class="bench-num" data-stat="p95">1.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">32.4 MB</b><b class="bench-num" data-stat="p95">11.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.3 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:68.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:20.00%">0.01</span><span class="bench-ruler__tick" style="left:40.00%">0.1</span><span class="bench-ruler__tick" style="left:60.00%">1</span><span class="bench-ruler__tick" style="left:80.00%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>14.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.14%"></i><i class="bench-bar__fill" style="width:60.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.10 ms</b><b class="bench-num" data-stat="p95">1.14 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.86%"></i><i class="bench-bar__fill" style="width:83.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.6 ms</b><b class="bench-num" data-stat="p95">15.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.73%"></i><i class="bench-bar__fill" style="width:60.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.03%"></i><i class="bench-bar__fill" style="width:71.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.68 ms</b><b class="bench-num" data-stat="p95">4.00 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>20.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.31%"></i><i class="bench-bar__fill" style="width:51.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.41 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.41%"></i><i class="bench-bar__fill" style="width:78.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.28 ms</b><b class="bench-num" data-stat="p95">8.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>42.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.78%"></i><i class="bench-bar__fill" style="width:48.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:81.28%"></i><i class="bench-bar__fill" style="width:81.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.5 ms</b><b class="bench-num" data-stat="p95">11.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.03%"></i><i class="bench-bar__fill" style="width:52.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.42 ms</b><b class="bench-num" data-stat="p95">0.45 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.12%"></i><i class="bench-bar__fill" style="width:59.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.99 ms</b><b class="bench-num" data-stat="p95">1.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.71%"></i><i class="bench-bar__fill" style="width:54.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.51 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.84%"></i><i class="bench-bar__fill" style="width:59.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.92 ms</b><b class="bench-num" data-stat="p95">0.98 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.96%"></i><i class="bench-bar__fill" style="width:52.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.41 ms</b><b class="bench-num" data-stat="p95">0.44 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.93%"></i><i class="bench-bar__fill" style="width:62.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.34 ms</b><b class="bench-num" data-stat="p95">1.40 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>6.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.49%"></i><i class="bench-bar__fill" style="width:57.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.72 ms</b><b class="bench-num" data-stat="p95">0.75 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.13%"></i><i class="bench-bar__fill" style="width:73.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.60 ms</b><b class="bench-num" data-stat="p95">5.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>6.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.81%"></i><i class="bench-bar__fill" style="width:59.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.90 ms</b><b class="bench-num" data-stat="p95">1.10 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.74%"></i><i class="bench-bar__fill" style="width:75.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.83 ms</b><b class="bench-num" data-stat="p95">6.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>6.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.19%"></i><i class="bench-bar__fill" style="width:59.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.92 ms</b><b class="bench-num" data-stat="p95">1.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.61%"></i><i class="bench-bar__fill" style="width:75.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.83 ms</b><b class="bench-num" data-stat="p95">6.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.35%"></i><i class="bench-bar__fill" style="width:54.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">0.59 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.12%"></i><i class="bench-bar__fill" style="width:62.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.39 ms</b><b class="bench-num" data-stat="p95">1.43 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.30%"></i><i class="bench-bar__fill" style="width:54.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.58 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.74%"></i><i class="bench-bar__fill" style="width:62.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.33 ms</b><b class="bench-num" data-stat="p95">1.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>9.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.83%"></i><i class="bench-bar__fill" style="width:51.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.37 ms</b><b class="bench-num" data-stat="p95">0.39 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.02%"></i><i class="bench-bar__fill" style="width:70.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.48 ms</b><b class="bench-num" data-stat="p95">3.56 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>1049.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.32%"></i><i class="bench-bar__fill" style="width:11.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.57%"></i><i class="bench-bar__fill" style="width:71.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.76 ms</b><b class="bench-num" data-stat="p95">3.79 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">12.9 MB</span><span class="bench-ruler__tick" style="left:50.00%">25.9 MB</span><span class="bench-ruler__tick" style="left:75.00%">38.8 MB</span><span class="bench-ruler__tick" style="left:100.00%">51.7 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.8 MB</b><b class="bench-num" data-stat="p95">4.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.3 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.3 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.3 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.8 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.4 MB</b><b class="bench-num" data-stat="p95">2.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.6 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.3 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:20.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.7 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:45.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.7 MB</b><b class="bench-num" data-stat="p95">9.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.6 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.5 MB</b><b class="bench-num" data-stat="p95">5.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.3 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>3.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:81.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.3 MB</b><b class="bench-num" data-stat="p95">22.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>4.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:95.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">49.6 MB</b><b class="bench-num" data-stat="p95">6.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>3.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:73.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.2 MB</b><b class="bench-num" data-stat="p95">7.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:84.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">43.9 MB</b><b class="bench-num" data-stat="p95">5.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>3.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.2 MB</b><b class="bench-num" data-stat="p95">2.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">51.7 MB</b><b class="bench-num" data-stat="p95">5.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.0 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:81.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.0 MB</b><b class="bench-num" data-stat="p95">7.5 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:20.00%">0.01</span><span class="bench-ruler__tick" style="left:40.00%">0.1</span><span class="bench-ruler__tick" style="left:60.00%">1</span><span class="bench-ruler__tick" style="left:80.00%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>13.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.42%"></i><i class="bench-bar__fill" style="width:60.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.12 ms</b><b class="bench-num" data-stat="p95">1.18 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.97%"></i><i class="bench-bar__fill" style="width:83.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.5 ms</b><b class="bench-num" data-stat="p95">15.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>3.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.92%"></i><i class="bench-bar__fill" style="width:60.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.11 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.62%"></i><i class="bench-bar__fill" style="width:72.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.06 ms</b><b class="bench-num" data-stat="p95">4.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>20.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.28%"></i><i class="bench-bar__fill" style="width:52.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.41 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.41%"></i><i class="bench-bar__fill" style="width:78.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.28 ms</b><b class="bench-num" data-stat="p95">8.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>41.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.89%"></i><i class="bench-bar__fill" style="width:48.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.28 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:81.19%"></i><i class="bench-bar__fill" style="width:81.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.4 ms</b><b class="bench-num" data-stat="p95">11.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.62%"></i><i class="bench-bar__fill" style="width:52.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.44 ms</b><b class="bench-num" data-stat="p95">0.48 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.12%"></i><i class="bench-bar__fill" style="width:59.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.97 ms</b><b class="bench-num" data-stat="p95">1.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.29%"></i><i class="bench-bar__fill" style="width:54.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.52 ms</b><b class="bench-num" data-stat="p95">0.58 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.32%"></i><i class="bench-bar__fill" style="width:60.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.01 ms</b><b class="bench-num" data-stat="p95">1.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.42%"></i><i class="bench-bar__fill" style="width:52.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.42 ms</b><b class="bench-num" data-stat="p95">0.47 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.26%"></i><i class="bench-bar__fill" style="width:63.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.43 ms</b><b class="bench-num" data-stat="p95">1.46 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>7.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.01%"></i><i class="bench-bar__fill" style="width:57.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.73 ms</b><b class="bench-num" data-stat="p95">0.80 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.30%"></i><i class="bench-bar__fill" style="width:74.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.08 ms</b><b class="bench-num" data-stat="p95">5.19 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>8.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.03%"></i><i class="bench-bar__fill" style="width:64.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.70 ms</b><b class="bench-num" data-stat="p95">1.79 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.87%"></i><i class="bench-bar__fill" style="width:82.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 ms</b><b class="bench-num" data-stat="p95">15.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>8.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.57%"></i><i class="bench-bar__fill" style="width:63.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.42 ms</b><b class="bench-num" data-stat="p95">1.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.68%"></i><i class="bench-bar__fill" style="width:82.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.7 ms</b><b class="bench-num" data-stat="p95">13.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.91%"></i><i class="bench-bar__fill" style="width:55.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.24%"></i><i class="bench-bar__fill" style="width:62.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.45 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.78%"></i><i class="bench-bar__fill" style="width:55.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.73%"></i><i class="bench-bar__fill" style="width:62.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.32 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>8.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.71%"></i><i class="bench-bar__fill" style="width:52.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.43 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.14%"></i><i class="bench-bar__fill" style="width:70.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.52 ms</b><b class="bench-num" data-stat="p95">3.61 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>931.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.79%"></i><i class="bench-bar__fill" style="width:11.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.29%"></i><i class="bench-bar__fill" style="width:70.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.39 ms</b><b class="bench-num" data-stat="p95">3.67 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">43.8 MB</span><span class="bench-ruler__tick" style="left:50.00%">87.7 MB</span><span class="bench-ruler__tick" style="left:75.00%">131.5 MB</span><span class="bench-ruler__tick" style="left:100.00%">175.3 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.4 MB</b><b class="bench-num" data-stat="p95">2.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.3 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">31.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.2 MB</b><b class="bench-num" data-stat="p95">5.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">37.3 MB</b><b class="bench-num" data-stat="p95">9.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.3 MB</b><b class="bench-num" data-stat="p95">5.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:18.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">32.0 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.8 MB</b><b class="bench-num" data-stat="p95">6.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.7 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.2 MB</b><b class="bench-num" data-stat="p95">4.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.4 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">41.4 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.6 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.6 MB</b><b class="bench-num" data-stat="p95">4.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>7.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.7 MB</b><b class="bench-num" data-stat="p95">2.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:82.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">145.3 MB</b><b class="bench-num" data-stat="p95">103.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>8.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.8 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">175.3 MB</b><b class="bench-num" data-stat="p95">27.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>5.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.4 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:61.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">108.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>5.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.2 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:59.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>4.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.0 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:50.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">88.7 MB</b><b class="bench-num" data-stat="p95">4.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>3.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">99.1 MB</b><b class="bench-num" data-stat="p95">7.7 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>12.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.53%"></i><i class="bench-bar__fill" style="width:51.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.22 ms</b><b class="bench-num" data-stat="p95">1.24 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:69.93%"></i><i class="bench-bar__fill" style="width:69.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.4 ms</b><b class="bench-num" data-stat="p95">15.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>4.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.64%"></i><i class="bench-bar__fill" style="width:50.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.02 ms</b><b class="bench-num" data-stat="p95">1.44 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.06%"></i><i class="bench-bar__fill" style="width:60.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.14 ms</b><b class="bench-num" data-stat="p95">4.61 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>20.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.38%"></i><i class="bench-bar__fill" style="width:43.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.30%"></i><i class="bench-bar__fill" style="width:65.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.11 ms</b><b class="bench-num" data-stat="p95">8.28 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>42.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.16%"></i><i class="bench-bar__fill" style="width:40.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.39 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.69%"></i><i class="bench-bar__fill" style="width:67.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.4 ms</b><b class="bench-num" data-stat="p95">11.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.41%"></i><i class="bench-bar__fill" style="width:43.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.43 ms</b><b class="bench-num" data-stat="p95">0.61 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.26%"></i><i class="bench-bar__fill" style="width:50.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.01 ms</b><b class="bench-num" data-stat="p95">1.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>1.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.54%"></i><i class="bench-bar__fill" style="width:46.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.65 ms</b><b class="bench-num" data-stat="p95">0.94 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.94%"></i><i class="bench-bar__fill" style="width:50.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.01 ms</b><b class="bench-num" data-stat="p95">1.14 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>3.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.49%"></i><i class="bench-bar__fill" style="width:43.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.41 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.32%"></i><i class="bench-bar__fill" style="width:51.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.26 ms</b><b class="bench-num" data-stat="p95">1.38 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>5.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.89%"></i><i class="bench-bar__fill" style="width:48.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.82 ms</b><b class="bench-num" data-stat="p95">0.99 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.36%"></i><i class="bench-bar__fill" style="width:61.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.75 ms</b><b class="bench-num" data-stat="p95">4.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>8.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.98%"></i><i class="bench-bar__fill" style="width:67.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 ms</b><b class="bench-num" data-stat="p95">12.0 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.57%"></i><i class="bench-bar__fill" style="width:83.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">97.2 ms</b><b class="bench-num" data-stat="p95">103.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>7.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.97%"></i><i class="bench-bar__fill" style="width:67.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 ms</b><b class="bench-num" data-stat="p95">12.0 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.54%"></i><i class="bench-bar__fill" style="width:82.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">84.5 ms</b><b class="bench-num" data-stat="p95">89.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:47.95%"></i><i class="bench-bar__fill" style="width:45.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.75 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.06%"></i><i class="bench-bar__fill" style="width:51.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.30 ms</b><b class="bench-num" data-stat="p95">1.53 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>2.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.26%"></i><i class="bench-bar__fill" style="width:45.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.79 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.04%"></i><i class="bench-bar__fill" style="width:51.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>7.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.74%"></i><i class="bench-bar__fill" style="width:44.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.48 ms</b><b class="bench-num" data-stat="p95">0.55 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.98%"></i><i class="bench-bar__fill" style="width:58.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.40 ms</b><b class="bench-num" data-stat="p95">3.46 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>949.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.37%"></i><i class="bench-bar__fill" style="width:9.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.96%"></i><i class="bench-bar__fill" style="width:58.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.40 ms</b><b class="bench-num" data-stat="p95">3.45 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">236.4 MB</span><span class="bench-ruler__tick" style="left:50.00%">472.8 MB</span><span class="bench-ruler__tick" style="left:75.00%">709.1 MB</span><span class="bench-ruler__tick" style="left:100.00%">945.5 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.top-left</code><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">105.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">240.7 MB</b><b class="bench-num" data-stat="p95">20.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-down.middle</code><span class="bench-viz__ratio"><strong>2.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:7.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">75.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">207.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-smooth.same-window</code><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">98.7 MB</b><b class="bench-num" data-stat="p95">23.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">206.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scroll-right.top-left</code><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">93.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">205.1 MB</b><b class="bench-num" data-stat="p95">10.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.top-left</code><span class="bench-viz__ratio"><strong>2.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">212.4 MB</b><b class="bench-num" data-stat="p95">12.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.middle</code><span class="bench-viz__ratio"><strong>2.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:7.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">73.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">201.0 MB</b><b class="bench-num" data-stat="p95">5.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-open.bottom-right</code><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">77.8 MB</b><b class="bench-num" data-stat="p95">4.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">202.7 MB</b><b class="bench-num" data-stat="p95">8.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit-commit.middle</code><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">80.8 MB</b><b class="bench-num" data-stat="p95">3.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">204.4 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.insert-5-rows-top</code><span class="bench-viz__ratio"><strong>11.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">84.0 MB</b><b class="bench-num" data-stat="p95">8.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">945.5 MB</b><b class="bench-num" data-stat="p95">745.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>altering.remove-5-rows-top</code><span class="bench-viz__ratio"><strong>6.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">89.8 MB</b><b class="bench-num" data-stat="p95">6.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:65.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">622.5 MB</b><b class="bench-num" data-stat="p95">32.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-down.top-left</code><span class="bench-viz__ratio"><strong>7.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">76.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:58.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">553.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>arrow-right.middle</code><span class="bench-viz__ratio"><strong>7.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">77.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">537.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formatted-paint.top-left</code><span class="bench-viz__ratio"><strong>7.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.5 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:58.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">557.7 MB</b><b class="bench-num" data-stat="p95">17.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>merge-heavy.paint</code><span class="bench-viz__ratio"><strong>4.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">90.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:44.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">418.7 MB</b><b class="bench-num" data-stat="p95">2.9 MB</b></span></div>
</div>
</section>
<figcaption>Every bar in a panel shares the ruler's scale (speed is logarithmic - each tick is 10x), so lengths compare across rows as well as within them. Bright numbers are the median run; faded numbers are the p95 run (speed) or the interaction's heap delta (memory). Rows marked as not completed are runs the engine could not finish - the recorded failure (crash, timeout, or failed correctness checkpoint) lives in the raw artifact.</figcaption>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each scenario does</summary>
<div class="bench-method__body">
<p>Live grid in controlled headless Chromium. Ten counterbalanced rounds; all fourteen scenarios run warm per mount, and the fixture is rebuilt after any failure so crashes cannot leak state. Every scenario must prove its effect (scroll really moved, editor really opened, rows really changed) or it fails.</p>
<p>Each measured sample repeats one logical action until it covers at least 100 ms of measured time, so timer resolution and scheduler jitter cannot decide a sample. Every raw sample is retained in the artifact.</p>
<p>Bright = median round, faded = p95 round. <strong>Did not complete</strong> = recorded crash, timeout, or failed checkpoint - never a timing. The failure table names the stage and the recorded error behind every missing cell.</p>
<dl>
<div><dt><code>scroll-down.top-left</code></dt><dd>From the origin, jump-scroll 50 px down: a fresh row band enters the viewport and must paint.</dd></div>
<div><dt><code>scroll-down.middle</code></dt><dd>The same 50 px jump starting from the vertical middle of the scroll range.</dd></div>
<div><dt><code>scroll-smooth.same-window</code></dt><dd>Scroll 1 px without changing the visible row window: pure repaint cost, zero new data.</dd></div>
<div><dt><code>scroll-right.top-left</code></dt><dd>Jump-scroll 50 px right: a fresh column band paints.</dd></div>
<div><dt><code>edit-open.top-left</code></dt><dd>Select a cell near the origin and open its editor.</dd></div>
<div><dt><code>edit-open.middle</code></dt><dd>Open the editor on the center cell of the workbook.</dd></div>
<div><dt><code>edit-open.bottom-right</code></dt><dd>Open the editor on the last row and column - the far end of every index.</dd></div>
<div><dt><code>edit-commit.middle</code></dt><dd>Commit a typed value into the center cell and paint the result.</dd></div>
<div><dt><code>altering.insert-5-rows-top</code></dt><dd>Insert five rows at the top: every following row reindexes.</dd></div>
<div><dt><code>altering.remove-5-rows-top</code></dt><dd>Remove those five rows again - the inverse reindex.</dd></div>
<div><dt><code>arrow-down.top-left</code></dt><dd>Move the selection one cell down with the arrow key, including the selection overlay repaint.</dd></div>
<div><dt><code>arrow-right.middle</code></dt><dd>Arrow-key selection move at the workbook center.</dd></div>
<div><dt><code>formatted-paint.top-left</code></dt><dd>Repaint a viewport dense with per-cell formatting.</dd></div>
<div><dt><code>merge-heavy.paint</code></dt><dd>Repaint a viewport dense with merged ranges; Sheetwrite additionally proves it builds exactly one merge revision index.</dd></div>
</dl>
</div>
</details>

Reproduce and validate with:

```sh verify title="Controlled render evidence"
bun run --filter @sheetwrite/bench bench:render:prepare
bun run --filter @sheetwrite/bench bench:render:scale
```

## Runtime resource ownership

The performance showcase at `/showcases/performance#resource-ownership` renders the public [`RuntimeResourceSnapshot`](/docs/api/core/runtime-resource-snapshot/) protocol directly. It keeps exclusive-owner logical bytes, allocated capacity, WASM committed pages, and independent browser runtime observations in separate buckets; committed pages are never summed into live payload. Bulk-edit before/settled deltas use [`diffRuntimeResourcePhases`](/docs/api/core/diff-runtime-resource-phases/) and omit unchanged owners.

The UI and this reference share [`RUNTIME_RESOURCE_SCHEMA_VERSION`](/docs/api/core/runtime-resource-schema-version/). Detailed peak phases remain in the validated benchmark artifact rather than being presented as measurements from the visitor's browser.

String collection reclaims obsolete pool text and densely remaps surviving IDs. Automatic collection runs only at committed edit transaction barriers, never during painting or page loading, when dead arena/span storage exceeds 256 KiB and the surviving arena/span storage. Growth-based backoff avoids repeatedly scanning unchanged live data. Bulk clears and sheet removal request a new threshold check at the next commit.

`compactStringStorage()` explicitly collects unreachable text and trims growth slack outside an active mutation/page load. Raw IDs are valid only within `stringPoolEpoch()`; retain the epoch with projections and invalidate caches on a change, as described in the [worker rendering guide](/docs/guides/worker-rendering/#raw-string-ids-and-epochs). History snapshots own captured text. Persist resolved values, not pool IDs. Reclaimed Rust ownership does not imply that WebAssembly committed linear memory shrinks.

Reproduce and validate the full owner/operation matrix with:

```sh verify title="Runtime resource evidence"
bun run --filter @sheetwrite/bench bench:resource
```

## Data engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 05:24 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.0 release candidate · Handsontable 18.1.2</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.3</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/data-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-widget bench-widget--data" data-pagefind-ignore>
<input type="radio" name="bench-data-size" id="bench-data-1000">
<input type="radio" name="bench-data-size" id="bench-data-10000">
<div class="bench-widget__tabs">
<div class="bench-tabs" aria-label="Workbook size">
<label for="bench-data-1000">1k rows</label>
<label for="bench-data-10000">10k rows</label>
</div>
</div>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>440.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.49%"></i><i class="bench-bar__fill" style="width:45.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.46%"></i><i class="bench-bar__fill" style="width:89.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">248.2 ms</b><b class="bench-num" data-stat="p95">267.7 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>17.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.03%"></i><i class="bench-bar__fill" style="width:12.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.43%"></i><i class="bench-bar__fill" style="width:33.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>32.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.76%"></i><i class="bench-bar__fill" style="width:60.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.46 ms</b><b class="bench-num" data-stat="p95">5.83 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.94%"></i><i class="bench-bar__fill" style="width:86.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">146.3 ms</b><b class="bench-num" data-stat="p95">217.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>728.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.54%"></i><i class="bench-bar__fill" style="width:36.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.16 ms</b><b class="bench-num" data-stat="p95">0.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.17%"></i><i class="bench-bar__fill" style="width:84.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">113.8 ms</b><b class="bench-num" data-stat="p95">128.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>2258.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.83%"></i><i class="bench-bar__fill" style="width:21.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.43%"></i><i class="bench-bar__fill" style="width:77.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.4 ms</b><b class="bench-num" data-stat="p95">50.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>17.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.26%"></i><i class="bench-bar__fill" style="width:11.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.81%"></i><i class="bench-bar__fill" style="width:32.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.09 ms</b><b class="bench-num" data-stat="p95">0.11 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.01</span><span class="bench-ruler__tick" style="left:16.67%">0.1</span><span class="bench-ruler__tick" style="left:33.33%">1</span><span class="bench-ruler__tick" style="left:50.00%">10</span><span class="bench-ruler__tick" style="left:66.67%">100</span><span class="bench-ruler__tick" style="left:83.33%">1k</span><span class="bench-ruler__tick" style="left:100.00%">10 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code><span class="bench-viz__ratio"><strong>478.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.34%"></i><i class="bench-bar__fill" style="width:44.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.87 ms</b><b class="bench-num" data-stat="p95">6.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:93.82%"></i><i class="bench-bar__fill" style="width:89.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2330.4 ms</b><b class="bench-num" data-stat="p95">4259.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code><span class="bench-viz__ratio"><strong>16.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.39%"></i><i class="bench-bar__fill" style="width:17.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.12 ms</b><b class="bench-num" data-stat="p95">0.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code><span class="bench-viz__ratio"><strong>150.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.75%"></i><i class="bench-bar__fill" style="width:42.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.57 ms</b><b class="bench-num" data-stat="p95">4.84 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.54%"></i><i class="bench-bar__fill" style="width:78.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">535.3 ms</b><b class="bench-num" data-stat="p95">1181.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code><span class="bench-viz__ratio"><strong>11379.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.34%"></i><i class="bench-bar__fill" style="width:22.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.22 ms</b><b class="bench-num" data-stat="p95">0.25 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.17%"></i><i class="bench-bar__fill" style="width:89.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2484.8 ms</b><b class="bench-num" data-stat="p95">2571.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code><span class="bench-viz__ratio"><strong>25557.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.67%"></i><i class="bench-bar__fill" style="width:9.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.16%"></i><i class="bench-bar__fill" style="width:82.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">907.5 ms</b><b class="bench-num" data-stat="p95">1477.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code><span class="bench-viz__ratio"><strong>20.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.77%"></i><i class="bench-bar__fill" style="width:9.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.36%"></i><i class="bench-bar__fill" style="width:31.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.77 ms</b><b class="bench-num" data-stat="p95">0.87 ms</b></span></div>
</div>
</section>
</figure>

Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:16.67%">0.01</span><span class="bench-ruler__tick" style="left:33.33%">0.1</span><span class="bench-ruler__tick" style="left:50.00%">1</span><span class="bench-ruler__tick" style="left:66.67%">10</span><span class="bench-ruler__tick" style="left:83.33%">100</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>ingest</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.94%"></i><i class="bench-bar__fill" style="width:78.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">53.6 ms</b><b class="bench-num" data-stat="p95">54.5 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.90%"></i><i class="bench-bar__fill" style="width:90.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">284.4 ms</b><b class="bench-num" data-stat="p95">284.6 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.91%"></i><i class="bench-bar__fill" style="width:95.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">565.1 ms</b><b class="bench-num" data-stat="p95">568.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>windowRead</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.33%"></i><i class="bench-bar__fill" style="width:15.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.42%"></i><i class="bench-bar__fill" style="width:16.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.07%"></i><i class="bench-bar__fill" style="width:17.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.68%"></i><i class="bench-bar__fill" style="width:60.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.19 ms</b><b class="bench-num" data-stat="p95">5.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.35%"></i><i class="bench-bar__fill" style="width:59.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.84 ms</b><b class="bench-num" data-stat="p95">4.18 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.62%"></i><i class="bench-bar__fill" style="width:59.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.94 ms</b><b class="bench-num" data-stat="p95">4.34 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sort</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.53%"></i><i class="bench-bar__fill" style="width:56.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.59 ms</b><b class="bench-num" data-stat="p95">2.83 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.61%"></i><i class="bench-bar__fill" style="width:68.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.6 ms</b><b class="bench-num" data-stat="p95">13.1 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.83%"></i><i class="bench-bar__fill" style="width:73.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.9 ms</b><b class="bench-num" data-stat="p95">26.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>filter</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.69%"></i><i class="bench-bar__fill" style="width:43.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.71%"></i><i class="bench-bar__fill" style="width:54.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.88 ms</b><b class="bench-num" data-stat="p95">1.92 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.51%"></i><i class="bench-bar__fill" style="width:59.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.59 ms</b><b class="bench-num" data-stat="p95">3.72 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>aggregate</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.22%"></i><i class="bench-bar__fill" style="width:43.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.42 ms</b><b class="bench-num" data-stat="p95">0.45 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.89%"></i><i class="bench-bar__fill" style="width:54.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.90 ms</b><b class="bench-num" data-stat="p95">1.97 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.71%"></i><i class="bench-bar__fill" style="width:60.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.28 ms</b><b class="bench-num" data-stat="p95">4.39 ms</b></span></div>
</div>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each operation does</summary>
<div class="bench-method__body">
<p>Identical columnar datasets, per-operation warmup and iteration plans. Fresh instance per ingest; window reads rotate offsets to defeat caches; sort and filter reset between runs; Handsontable edits run with rendering suspended so only its data path is timed.</p>
<p>Memory = JS-heap delta around one ingest in an isolated subprocess, plus Sheetwrite's WASM linear-memory delta.</p>
<dl>
<div><dt><code>ingest</code></dt><dd>Load the full dataset into a fresh engine instance.</dd></div>
<div><dt><code>windowRead</code></dt><dd>Read a 50x5 cell window at a rotating offset that sweeps the whole sheet.</dd></div>
<div><dt><code>edit</code></dt><dd>1,000 single-cell edits.</dd></div>
<div><dt><code>sort</code></dt><dd>Sort by the numeric amount column.</dd></div>
<div><dt><code>filter</code></dt><dd>Substring filter over the city column.</dd></div>
<div><dt><code>aggregate</code></dt><dd>Numeric aggregation over the amount column.</dd></div>
</dl>
</div>
</details>

Reproduce with:

```sh verify title="Data engine evidence"
bun run --filter @sheetwrite/bench bench:data
```

## Core write path

<div class="evidence-available"><strong>Validated evidence.</strong> 12 store and document scenarios at production sizes; every scenario passed its own correctness checkpoint before its timing was accepted.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 05:24 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.3 · Node compatibility v26.3.0 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/core-paths-results.json</code></dd></div>
</dl>

Scale: bridgeRows=1,000,000, bridgeInsertRows=10,000, selectionRows=64, selectionColumns=64, blockRows=1,000, blockColumns=1,000, offlineCommits=5,000, rebaseBlockRows=1,000, rebaseBlockColumns=100, rebaseInsertOperations=50, sparseCells=100,000, validationRules=100, csvRows=200,000, csvColumns=10, clearRows=1,000, clearColumns=1,000, pagedRows=200,000.

| Scenario | One timed iteration | Median | p95 | Samples |
| --- | --- | ---: | ---: | ---: |
| `row-bridge-insert` | one addRows projection of 10,000 rows into a 1,000,000-row bridge | 5.95 ms | 6.30 ms | 2 |
| `command-state-select` | one 4,096-cell range selection on a framework-style grid | 6.71 ms | 8.84 ms | 10 |
| `command-state-select:with-command-state-handler` | variant measured in the same run | 6.71 ms | 8.84 ms | 10 |
| `command-state-select:without-command-state-handler` | variant measured in the same run | 5.07 ms | 5.75 ms | 10 |
| `setblock-admission` | one Grid.applyTransaction of a 1,000,000-cell setBlock | 488.7 ms | 503.5 ms | 3 |
| `setblock-detailed-capture` | one Grid.applyTransaction of a 1,000,000-cell setBlock observed through a change listener with detailed capture | 564.4 ms | 568.2 ms | 3 |
| `sync-offline-queue` | one grid commit admitted into an offline sync queue with no listeners | 0.67 ms | 0.80 ms | 5000 |
| `rebase-large` | one rebase of a 100,000-cell block across 50 single-row inserts | 1.54 ms | 1.54 ms | 3 |
| `validation-sparse` | one 100,000-cell sparse setRange with 100 rules outside the range | 168.9 ms | 169.4 ms | 3 |
| `csv-import` | one fromCsv import of 200,000 rows by 10 columns | 234.6 ms | 235.3 ms | 2 |
| `undo-large-clear` | one undo of a 1,000,000-cell clearRange | 1609.1 ms | 1621.4 ms | 3 |
| `restore-near-ceiling` | one restoreBlock with 60000044 decoded bytes | 1060.1 ms | 1069.8 ms | 3 |
| `paged-evicted-revisit` | one revisit of an evicted paged band: scroll back plus a fixed async settle floor (wall time is not the accept metric) | 5.86 ms | 6.97 ms | 3 |
| `node-cold-init` | one cold initSheetwrite() through first store in a fresh Node process (7 processes) | 4.24 ms | 4.58 ms | 6 |

Counters recorded by the same runs (non-time evidence):

- `row-bridge-insert` — bridgeRows=1,000,000, insertedRows=10,000
- `command-state-select` — selectedCells=4,096, commandStateEvents=13, withoutHandlerMedianMs=5.073
- `setblock-admission` — blockCells=1,000,000, transactions=4
- `setblock-detailed-capture` — blockCells=1,000,000, transactions=4, capturedChanges=1,000,000, validatedCapturedChanges=1,000,000
- `sync-offline-queue` — queuedCommits=5,005, admittedOperations=5,005
- `rebase-large` — blockCells=100,000, insertOperations=50, verifiedValues=100,000
- `validation-sparse` — writtenCells=100,000, logicalRangeCells=1,000,000, validationRules=100
- `csv-import` — importedRows=200,000, importedColumns=10, verifiedCells=2,000,000, inputChars=20,888,985
- `undo-large-clear` — clearedCells=1,000,000, clears=4, restoredCells=1,000,000, compactRestores=5, peakRssBytes=1,143,246,848
- `restore-near-ceiling` — restoredCells=4,000,000, decodedBytes=60,000,044, peakRssBytes=1,509,625,856
- `paged-evicted-revisit` — revisitedRows=3, areColumnsFullyLoadedCalls=108, evictionVisits=3, pagedRows=200,000
- `node-cold-init` — largestHeartbeatGapMs=3.73, minimalHeartbeatTicks=1, freshProcesses=7

<details><summary>Per-scenario correctness checkpoint</summary>

- `row-bridge-insert` — projected delta is one row-structure insert with every created identity present in the bridge in order
- `command-state-select` — selection covers 4096 cells and the command-state handler observes one event per selection
- `setblock-admission` — every setBlock is applied and every cell of the block holds the last written value
- `setblock-detailed-capture` — every setBlock is applied and every cell of the block holds the last written value, and its change capture reports every cell's address, previous value, and new value exactly once
- `sync-offline-queue` — every commit is applied, the queue holds every commit at server version 0, and capacity stays available
- `rebase-large` — the block rebases without conflict, shifts down by exactly the inserted row count, keeps every source value, and leaves the caller's operations untouched
- `validation-sparse` — every write is applied, probe cells hold the last written values, every rule is retained, and a rule violation is still rejected
- `csv-import` — row count matches and every imported cell equals the source value for its row and column, including declared number/text types
- `undo-large-clear` — the clear empties the block and the undos restore every original cell value
- `restore-near-ceiling` — a valid near-ceiling compressed restore applies its complete block
- `paged-evicted-revisit` — the band is unloaded before each revisit, the revisit reloads it with the source values, and the revisit asks areColumnsFullyLoaded at least once; areColumnsFullyLoadedCalls per revisit is the accept metric
- `node-cold-init` — every fresh process loads the module, produces the expected engine result, and reports a plausible heartbeat gap

</details>

Reproduce with:

```sh verify title="Core write-path evidence"
bun run --filter @sheetwrite/bench bench:core-paths
```

## Formula engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 53 recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 06:43 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/formula-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0.001</span><span class="bench-ruler__tick" style="left:20.00%">0.01</span><span class="bench-ruler__tick" style="left:40.00%">0.1</span><span class="bench-ruler__tick" style="left:60.00%">1</span><span class="bench-ruler__tick" style="left:80.00%">10</span><span class="bench-ruler__tick" style="left:100.00%">100.0 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>countif-100k</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.30%"></i><i class="bench-bar__fill" style="width:61.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>criteria-multi-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.20%"></i><i class="bench-bar__fill" style="width:74.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.61 ms</b><b class="bench-num" data-stat="p95">5.76 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>criteria-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.46%"></i><i class="bench-bar__fill" style="width:64.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.65 ms</b><b class="bench-num" data-stat="p95">1.67 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cross-sheet-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.58%"></i><i class="bench-bar__fill" style="width:54.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.52 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>cycles</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.98%"></i><i class="bench-bar__fill" style="width:63.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.54 ms</b><b class="bench-num" data-stat="p95">1.58 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>diamond-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.72%"></i><i class="bench-bar__fill" style="width:40.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>distinct-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.84%"></i><i class="bench-bar__fill" style="width:22.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>error-propagation</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.26%"></i><i class="bench-bar__fill" style="width:58.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.81 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>formula-constant-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.35%"></i><i class="bench-bar__fill" style="width:29.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>incremental-dependency-closure-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.03%"></i><i class="bench-bar__fill" style="width:26.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-first-recompute</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.37%"></i><i class="bench-bar__fill" style="width:61.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.15 ms</b><b class="bench-num" data-stat="p95">1.17 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.76%"></i><i class="bench-bar__fill" style="width:74.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.18 ms</b><b class="bench-num" data-stat="p95">5.47 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:99.09%"></i><i class="bench-bar__fill" style="width:98.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">88.6 ms</b><b class="bench-num" data-stat="p95">90.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>independent-parse-load</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.06%"></i><i class="bench-bar__fill" style="width:60.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.07 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.87%"></i><i class="bench-bar__fill" style="width:75.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.24 ms</b><b class="bench-num" data-stat="p95">6.98 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:96.23%"></i><i class="bench-bar__fill" style="width:95.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">62.8 ms</b><b class="bench-num" data-stat="p95">64.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>iterative-finance</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.73%"></i><i class="bench-bar__fill" style="width:71.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.72 ms</b><b class="bench-num" data-stat="p95">3.86 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>let-repeat</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:66.09%"></i><i class="bench-bar__fill" style="width:65.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.97 ms</b><b class="bench-num" data-stat="p95">2.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>let-reuse-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.68%"></i><i class="bench-bar__fill" style="width:56.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.68 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>linear-chain</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">8 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.79%"></i><i class="bench-bar__fill" style="width:24.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">16 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.42%"></i><i class="bench-bar__fill" style="width:28.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.97%"></i><i class="bench-bar__fill" style="width:33.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.05 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">64 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.82%"></i><i class="bench-bar__fill" style="width:37.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.08 ms</b><b class="bench-num" data-stat="p95">0.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>lookup-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.09%"></i><i class="bench-bar__fill" style="width:64.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.70 ms</b><b class="bench-num" data-stat="p95">1.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>percentile-covariance</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.58%"></i><i class="bench-bar__fill" style="width:71.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.71 ms</b><b class="bench-num" data-stat="p95">3.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>removed-sheet-ref</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.87%"></i><i class="bench-bar__fill" style="width:53.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.50 ms</b><b class="bench-num" data-stat="p95">0.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>shared-range-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.44%"></i><i class="bench-bar__fill" style="width:54.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>spill-filter-resize</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.39%"></i><i class="bench-bar__fill" style="width:88.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.3 ms</b><b class="bench-num" data-stat="p95">26.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>spill-sequence-admission</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.68%"></i><i class="bench-bar__fill" style="width:82.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.4 ms</b><b class="bench-num" data-stat="p95">13.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sum-multi-range</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.93%"></i><i class="bench-bar__fill" style="width:72.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.45 ms</b><b class="bench-num" data-stat="p95">4.97 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sumifs-3-criteria</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.99%"></i><i class="bench-bar__fill" style="width:77.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.59 ms</b><b class="bench-num" data-stat="p95">7.94 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sumproduct-matrix-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.89%"></i><i class="bench-bar__fill" style="width:65.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.95 ms</b><b class="bench-num" data-stat="p95">1.97 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>sumproduct-vector-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.00%"></i><i class="bench-bar__fill" style="width:66.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.11 ms</b><b class="bench-num" data-stat="p95">2.24 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>text-lookup-many</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.25%"></i><i class="bench-bar__fill" style="width:67.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.43 ms</b><b class="bench-num" data-stat="p95">4.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>text-lookup-many-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.55%"></i><i class="bench-bar__fill" style="width:67.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.26 ms</b><b class="bench-num" data-stat="p95">2.39 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>text-lookup-many-sorted</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.78%"></i><i class="bench-bar__fill" style="width:71.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.83 ms</b><b class="bench-num" data-stat="p95">3.88 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>text-lookup-many-sorted-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.56%"></i><i class="bench-bar__fill" style="width:71.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.71 ms</b><b class="bench-num" data-stat="p95">3.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>topology-remove-add</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.73%"></i><i class="bench-bar__fill" style="width:79.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.50 ms</b><b class="bench-num" data-stat="p95">9.70 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>unicode-text-date-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.28%"></i><i class="bench-bar__fill" style="width:61.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>vlookup-many</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.62%"></i><i class="bench-bar__fill" style="width:62.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.28 ms</b><b class="bench-num" data-stat="p95">1.35 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>vlookup-many-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.30%"></i><i class="bench-bar__fill" style="width:61.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>vlookup-many-sorted</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.38%"></i><i class="bench-bar__fill" style="width:64.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.65 ms</b><b class="bench-num" data-stat="p95">1.66 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>vlookup-many-sorted-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.74%"></i><i class="bench-bar__fill" style="width:63.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.52 ms</b><b class="bench-num" data-stat="p95">1.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>wide-fan-out-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.09%"></i><i class="bench-bar__fill" style="width:51.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.38 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.86%"></i><i class="bench-bar__fill" style="width:95.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">60.4 ms</b><b class="bench-num" data-stat="p95">62.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>xlookup-many</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.48%"></i><i class="bench-bar__fill" style="width:62.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.28 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>xlookup-many-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.61%"></i><i class="bench-bar__fill" style="width:61.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>xlookup-many-sorted</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.91%"></i><i class="bench-bar__fill" style="width:65.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.83 ms</b><b class="bench-num" data-stat="p95">1.98 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>xlookup-many-sorted-edit</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.02%"></i><i class="bench-bar__fill" style="width:64.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.76 ms</b><b class="bench-num" data-stat="p95">1.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><code>scalar-edit-affects</code></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">0 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.10%"></i><i class="bench-bar__fill" style="width:8.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.72%"></i><i class="bench-bar__fill" style="width:12.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">9 µs</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.59%"></i><i class="bench-bar__fill" style="width:51.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.37 ms</b><b class="bench-num" data-stat="p95">0.38 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:96.07%"></i><i class="bench-bar__fill" style="width:95.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">60.4 ms</b><b class="bench-num" data-stat="p95">63.6 ms</b></span></div>
</div>
</figure>

<details class="bench-method" data-pagefind-ignore>
<summary>Methodology - what each workload does</summary>
<div class="bench-method__body">
<p>Each workload builds a fresh WASM cell-store of the named dependency shape and times the recalculation from one action - usually a single edit. Sizes are formula-cell counts; bright = median, faded = p95.</p>
<dl>
<div><dt><code>linear-chain</code></dt><dd>A chain A1 -> A2 -> ... -> AN; editing the head recomputes the full depth.</dd></div>
<div><dt><code>wide-fan-out-edit</code></dt><dd>One scalar feeds N dependent formulas; edit the scalar.</dd></div>
<div><dt><code>diamond-edit</code></dt><dd>Fan-out that reconverges (diamond graph); edit the apex.</dd></div>
<div><dt><code>shared-range-edit</code></dt><dd>N formulas aggregate one shared range; edit one cell inside it.</dd></div>
<div><dt><code>distinct-range-edit</code></dt><dd>Each formula owns its own range; one edit recomputes only its owner.</dd></div>
<div><dt><code>cross-sheet-range-edit</code></dt><dd>Summary-sheet formulas range over another sheet; edit the source.</dd></div>
<div><dt><code>scalar-edit-affects-N</code></dt><dd>One scalar edit invalidating exactly N dependents; N=0 touches an unrelated cell, so it prices pure dependency lookup.</dd></div>
<div><dt><code>topology-remove-add</code></dt><dd>Remove and re-add rows so the dependency graph itself changes shape.</dd></div>
<div><dt><code>cycles</code></dt><dd>Introduce a reference cycle; detection and cycle-error propagation.</dd></div>
<div><dt><code>removed-sheet-ref</code></dt><dd>Formulas referencing a deleted sheet must all degrade to reference errors.</dd></div>
<div><dt><code>error-propagation</code></dt><dd>An error value (=1/0) flows through every dependent.</dd></div>
<div><dt><code>criteria-range-edit</code></dt><dd>Criteria-style aggregation (SUMIF shape) over 100k cells; edit inside the criteria range.</dd></div>
<div><dt><code>lookup-range-edit</code></dt><dd>Lookup-shape formulas over 100k cells; edit inside the looked-up range.</dd></div>
</dl>
</div>
</details>

Reproduce with:

```sh verify title="Formula engine evidence"
bun run --filter @sheetwrite/bench bench:formula
```

### Default and full formula engines

<div class="evidence-available"><strong>Validated evidence.</strong> Eight shared workloads have 25 paired rounds per engine. The full engine also has eight checked analysis workloads.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Matched capture</dt><dd>2026-10-17 06:44 UTC</dd></div>
<div><dt>Matched commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Analysis capture</dt><dd>2026-10-17 06:44 UTC</dd></div>
<div><dt>Analysis commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Machine</dt><dd>12th Gen Intel(R) Core(TM) i9-12900H · Linux 7.2.8-1-cachyos · x64 · Bun 1.4.3</dd></div>
</dl>

The default engine is `@sheetwrite/wasm`. The full engine is `@sheetwrite/formulas`. Select it with `initSheetwrite(undefined, formulas)`. Each app uses one engine.

The first capture ran all 53 shared workloads on each engine in sequence. Eight rows were more than 5% slower with the full engine. Those eight rows were checked with matched rounds. Each pair runs default, then full, in separate Bun processes. A timed sample starts with 3 untimed warm-up fixtures and then repeats the workload until at least 50 ms of measured time; the sample is the per-iteration mean, so a short operation is measured over many repetitions instead of one cold run. The runner used CPU 4 and one concurrent capture.

No shared workload tested in the matched rounds had a median paired ratio more than 5% slower with the full engine. This check covers the eight flagged rows, not a new matched run of all 53 rows.

The ratio is full time divided by default time within each pair. The table shows the median of 25 paired ratios. The spread is the interpolated 10th to 90th percentile of those ratios. It is not a confidence interval. The time columns are the median times for each engine. A ratio below 1 means the full engine took less time.

Identical shared work is the control for this protocol: the widest paired-ratio p10–p90 span across the eight rows is 1.32× (ceiling 1.50×), so each median ratio is supported by its paired samples.

| Shared workload | Size | Default median ms | Full median ms | Paired median ratio | Ratio p10–p90 | Iterations per sample |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| independent-parse-load | 1,000 | 0.6793 | 0.6721 | 1.0053 | 0.8494–1.1206 | 64–84 |
| independent-first-recompute | 1,000 | 0.6387 | 0.5424 | 0.9163 | 0.7724–0.9760 | 70–101 |
| independent-parse-load | 10,000 | 6.7159 | 6.5660 | 0.9397 | 0.8725–1.0909 | 7–9 |
| independent-first-recompute | 10,000 | 6.4404 | 5.2663 | 0.8462 | 0.7637–0.9306 | 7–11 |
| linear-chain | 8 | 0.0107 | 0.0102 | 0.9453 | 0.8399–1.0920 | 4177–5658 |
| wide-fan-out-edit | 1,000 | 0.3847 | 0.3483 | 0.9285 | 0.7855–1.0223 | 117–161 |
| scalar-edit-affects-0 | 1,000 | 0.0006 | 0.0006 | 1.0012 | 0.9513–1.0645 | 81154–96796 |
| vlookup-many | 1,000 | 1.5854 | 1.4372 | 0.9060 | 0.8484–1.0225 | 28–40 |

#### Analysis workloads

Each workload has 1,000 formulas. It has one untimed warmup and five measured samples. Each sample uses a fresh store. The timer measures first recompute. Setup and output reads are outside the timer. Every result is read and summed as a checked checksum. The default engine does not run these analysis functions.

LINEST, SORTBY, and MAP/REDUCE use 100 input rows. DSUM uses 100 database rows, a header, and the criterion `key > 0`. XIRR uses two cash flows one year apart. The text workload uses three fields. MODE.MULT uses five scalar inputs. MMULT uses two 2-by-2 matrices. Array outputs are reduced to scalar results.

| Full-only workload | Median ms | p95 ms |
| --- | ---: | ---: |
| linest | 4.6590 | 7.6987 |
| xirr | 1.5385 | 1.6036 |
| dsum | 2.9761 | 4.1562 |
| textsplit-regexreplace | 3.0747 | 3.2543 |
| sortby | 3.4891 | 7.2286 |
| mode-mult | 1.0305 | 1.3118 |
| map-reduce | 26.7470 | 26.9450 |
| mmult | 1.3608 | 1.4326 |

#### WASM size and Node initialization

| Engine | Node | WASM raw bytes | Brotli q11 bytes | Node cold init median ms | Node cold init p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| default | v26.9.0 | 876,918 | 256,150 | 4.0333 | 4.4418 |
| full | v26.9.0 | 1,160,345 | 344,260 | 5.3348 | 5.9168 |

Raw size is the WASM file size. Brotli size uses quality 11 on that file only. It is not the full package transfer size. Cold initialization uses five fresh Node processes. The timer surrounds `initSheetwrite` only. Imports and process startup are outside the timer. The operating system file cache is not cleared. No network download is measured. These samples do not establish that the full engine initializes faster.

Raw evidence: `bench/results/full-engine-matched-results.json` and `bench/results/full-engine-results.json`. They retain time samples, output checks, allocation samples, source hashes, and WASM hashes. The full workload captures are `bench/results/formula-default-results.json` and `bench/results/formula-full-results.json`. Their baseline gates stay blocked in output mode. A valid capture is not a passed timing regression gate.

Reproduce after `bun run build:packages`:

```sh verify title="Default and full engine evidence"
cd bench
bun run bench:formula:engines
bun run bench:formula:matched
```

The landing-page data comes from a separate browser benchmark. The Delivery size section below records published package sizes. Neither data set has an engine comparison field. They are unchanged by this local engine capture.

## XLSX codec benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 5 compared operations over 5 process-isolated rounds each, from one checked corpus fixture.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 08:11 UTC</dd></div>
<div><dt>Commit</dt><dd><code>49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.0 release candidate · ExcelJS 4.4.0 at baseline <code>87fadb72397947ea8c6ba576682925c7879579b8</code></dd></div>
<div><dt>Fixture</dt><dd><code>bench/fixtures/xlsx-codec-corpus.xlsx</code> · 1,038,346 bytes · <code>2633e51a4a3c</code> · LibreOffice 26.2.4.2 Calc MS Excel 2007 XML</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.3 · Node v26.3.0 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/xlsx-results.json</code></dd></div>
</dl>

The baseline codec is the same operation at commit <code>87fadb723979</code>, built from that commit and measured in the same session. Ratio = current ÷ baseline; below 1 is faster.

| Operation | Scenario | Current median | Baseline median | Ratio | Current peak RSS | Baseline peak RSS | RSS ratio |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| import | combined | 913.0 ms | 5033.7 ms | 0.18× | 329.5 MB | 3642.2 MB | 0.09× |
| export | scalar | 300.9 ms | 384.5 ms | 0.78× | 165.3 MB | 217.2 MB | 0.76× |
| export | rich | 217.8 ms | 316.8 ms | 0.69× | 151.4 MB | 188.4 MB | 0.80× |
| export | shared-style | 534.8 ms | 724.2 ms | 0.74× | 163.0 MB | 307.6 MB | 0.53× |
| export | sparse | 27.5 ms | 102.4 ms | 0.27× | 97.0 MB | 120.1 MB | 0.81× |

Reproduce with a checkout of the baseline commit, built and passed as the comparison root:

```sh verify title="XLSX codec evidence"
git worktree add ../sheetwrite-xlsx-baseline 87fadb72397947ea8c6ba576682925c7879579b8
cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages
cd - && bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root ../sheetwrite-xlsx-baseline
```

## Delivery size

<section class="size-history" aria-label="Published package size history">
<p class="size-history__intro">Registry measurements for every published release. Each delta is measured against the release immediately before it.</p>
<details class="size-history__release" data-current="true" open>
<summary class="size-history__release-head">
<span class="size-history__version-step"><span>v0.4.0</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v0.5.0</strong></span>
<time datetime="2026-10-17T10:11:08.224Z">Measured Oct 17, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>351.1 KiB<small data-direction="increase"><span>+63.2 KiB</span><span>+21.9%</span></small></td>
<td>997.1 KiB<small data-direction="increase"><span>+204.3 KiB</span><span>+25.8%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/formulas</code></th>
<td>470.2 KiB</td>
<td>1.26 MiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>340.5 KiB<small data-direction="increase"><span>+38.3 KiB</span><span>+12.7%</span></small></td>
<td>1.59 MiB<small data-direction="increase"><span>+175.1 KiB</span><span>+12.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>52.4 KiB<small data-direction="decrease"><span>-33.1 KiB</span><span>-38.7%</span></small></td>
<td>228.2 KiB<small data-direction="decrease"><span>-201.0 KiB</span><span>-46.8%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>5.7 KiB<small data-direction="decrease"><span>-3.4 KiB</span><span>-37.5%</span></small></td>
<td>17.2 KiB<small data-direction="decrease"><span>-14.7 KiB</span><span>-46.1%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>6.7 KiB<small data-direction="decrease"><span>-3.5 KiB</span><span>-34.2%</span></small></td>
<td>20.6 KiB<small data-direction="decrease"><span>-15.1 KiB</span><span>-42.4%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>5.6 KiB<small data-direction="decrease"><span>-613 B</span><span>-9.6%</span></small></td>
<td>15.3 KiB<small data-direction="decrease"><span>-3.2 KiB</span><span>-17.2%</span></small></td>
</tr>
</tbody>
</table>
</div>
</details>
<details class="size-history__release">
<summary class="size-history__release-head">
<span class="size-history__version-step"><span>v0.3.1</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v0.4.0</strong></span>
<time datetime="2026-08-14T09:21:51.130Z">Measured Aug 14, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>287.9 KiB<small data-direction="increase"><span>+390 B</span><span>+0.1%</span></small></td>
<td>792.8 KiB<small data-direction="decrease"><span>-2.8 KiB</span><span>-0.3%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>302.1 KiB<small data-direction="decrease"><span>-215.3 KiB</span><span>-41.6%</span></small></td>
<td>1.42 MiB<small data-direction="decrease"><span>-1.29 MiB</span><span>-47.6%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>85.4 KiB<small data-direction="decrease"><span>-60 B</span><span>-0.1%</span></small></td>
<td>429.2 KiB<small data-direction="decrease"><span>-356 B</span><span>-0.1%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>9.2 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>31.9 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>10.1 KiB<small data-direction="decrease"><span>-2 B</span><span>-0.0%</span></small></td>
<td>35.7 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>6.2 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>18.5 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
</tbody>
</table>
</div>
</details>
<details class="size-history__release">
<summary class="size-history__release-head">
<span class="size-history__version-step"><span>v0.3.0</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v0.3.1</strong></span>
<time datetime="2026-07-23T17:11:35.485Z">Measured Jul 23, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>287.6 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>795.6 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>517.4 KiB<small data-direction="increase"><span>+11 B</span><span>+0.0%</span></small></td>
<td>2.71 MiB<small data-direction="increase"><span>+24 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>85.5 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>429.6 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>9.2 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>31.9 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>10.1 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>35.7 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>6.2 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
<td>18.5 KiB<small data-direction="flat"><span>0 B</span><span>+0.0%</span></small></td>
</tr>
</tbody>
</table>
</div>
</details>
<details class="size-history__release">
<summary class="size-history__release-head">
<span class="size-history__version-step"><span>v0.2.0</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v0.3.0</strong></span>
<time datetime="2026-07-23T15:20:59.199Z">Measured Jul 23, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>287.6 KiB<small data-direction="increase"><span>+107.1 KiB</span><span>+59.4%</span></small></td>
<td>795.6 KiB<small data-direction="increase"><span>+305.6 KiB</span><span>+62.4%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>517.4 KiB<small data-direction="increase"><span>+145.0 KiB</span><span>+38.9%</span></small></td>
<td>2.71 MiB<small data-direction="increase"><span>+821.8 KiB</span><span>+42.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>85.5 KiB<small data-direction="increase"><span>+10.5 KiB</span><span>+14.0%</span></small></td>
<td>429.6 KiB<small data-direction="increase"><span>+63.5 KiB</span><span>+17.3%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>9.2 KiB<small data-direction="increase"><span>+2.2 KiB</span><span>+31.2%</span></small></td>
<td>31.9 KiB<small data-direction="increase"><span>+9.9 KiB</span><span>+45.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>10.1 KiB<small data-direction="increase"><span>+1.5 KiB</span><span>+17.7%</span></small></td>
<td>35.7 KiB<small data-direction="increase"><span>+7.2 KiB</span><span>+25.3%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>6.2 KiB<small data-direction="increase"><span>+1,002 B</span><span>+18.7%</span></small></td>
<td>18.5 KiB<small data-direction="increase"><span>+3.9 KiB</span><span>+27.1%</span></small></td>
</tr>
</tbody>
</table>
</div>
</details>
<details class="size-history__release">
<summary class="size-history__release-head">
<span class="size-history__version-step"><span>v0.1.0</span><svg class="size-history__arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5 12.5 8 9 11.5"/></svg><strong>v0.2.0</strong></span>
<time datetime="2026-07-22T20:08:51.366Z">Measured Jul 22, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>180.4 KiB<small data-direction="increase"><span>+8.2 KiB</span><span>+4.7%</span></small></td>
<td>489.9 KiB<small data-direction="increase"><span>+22.3 KiB</span><span>+4.8%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>372.4 KiB<small data-direction="increase"><span>+40.0 KiB</span><span>+12.0%</span></small></td>
<td>1.91 MiB<small data-direction="increase"><span>+209.9 KiB</span><span>+12.0%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>75.0 KiB<small data-direction="increase"><span>+53.7 KiB</span><span>+252.2%</span></small></td>
<td>366.1 KiB<small data-direction="increase"><span>+273.1 KiB</span><span>+293.7%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>7.0 KiB<small data-direction="increase"><span>+30 B</span><span>+0.4%</span></small></td>
<td>22.0 KiB<small data-direction="increase"><span>+134 B</span><span>+0.6%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>8.6 KiB<small data-direction="decrease"><span>-24 B</span><span>-0.3%</span></small></td>
<td>28.5 KiB<small data-direction="decrease"><span>-5.5 KiB</span><span>-16.3%</span></small></td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>5.2 KiB<small data-direction="increase"><span>+66 B</span><span>+1.2%</span></small></td>
<td>14.5 KiB<small data-direction="increase"><span>+296 B</span><span>+2.0%</span></small></td>
</tr>
</tbody>
</table>
</div>
</details>
<details class="size-history__release">
<summary class="size-history__release-head">
<span class="size-history__version-step"><strong>v0.1.0</strong></span>
<time datetime="2026-07-22T20:08:45.607Z">Measured Jul 22, 2026</time>
<svg class="size-history__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
</summary>
<div class="size-history__table-wrap">
<table class="size-history__table">
<thead><tr><th scope="col">Package</th><th scope="col">Tarball</th><th scope="col">Installed</th></tr></thead>
<tbody>
<tr>
<th scope="row"><code>@sheetwrite/wasm</code></th>
<td>172.3 KiB</td>
<td>467.6 KiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/core</code></th>
<td>332.5 KiB</td>
<td>1.71 MiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/xlsx</code></th>
<td>21.3 KiB</td>
<td>93.0 KiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/react</code></th>
<td>7.0 KiB</td>
<td>21.9 KiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/vue</code></th>
<td>8.6 KiB</td>
<td>34.0 KiB</td>
</tr>
<tr>
<th scope="row"><code>@sheetwrite/svelte</code></th>
<td>5.2 KiB</td>
<td>14.2 KiB</td>
</tr>
</tbody>
</table>
</div>
</details>
<footer class="size-history__footer"><span>Increase</span><span>Decrease</span><code>scripts/size-history.json</code></footer>
</section>
