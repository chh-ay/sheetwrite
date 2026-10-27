---
title: "XLSX codec performance"
description: "Import and export time and peak memory for XLSX files."
---

<div class="evidence-available"><strong>Validated evidence.</strong> 5 compared operations over 5 process-isolated rounds each, from one checked corpus fixture.</div>

Current and baseline are the same codec at different commits, measured in the same session. Baseline commit: <code title="87fadb72397947ea8c6ba576682925c7879579b8">87fadb723979</code>.

#### Operation time

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 ms</span><span class="bench-ruler__tick" style="left:25.00%">10 ms</span><span class="bench-ruler__tick" style="left:50.00%">100 ms</span><span class="bench-ruler__tick" style="left:75.00%">1 s</span><span class="bench-ruler__tick" style="left:100.00%">10 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export rich">Export rich</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.79%"></i><i class="bench-bar__fill" style="width:58.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">218 ms</b><b class="bench-num" data-stat="p95">225 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.91%"></i><i class="bench-bar__fill" style="width:62.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">317 ms</b><b class="bench-num" data-stat="p95">328 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export scalar">Export scalar</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.20%"></i><i class="bench-bar__fill" style="width:61.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">301 ms</b><b class="bench-num" data-stat="p95">308 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.90%"></i><i class="bench-bar__fill" style="width:64.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">385 ms</b><b class="bench-num" data-stat="p95">395 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export shared-style">Export shared style</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.30%"></i><i class="bench-bar__fill" style="width:68.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">535 ms</b><b class="bench-num" data-stat="p95">539 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.78%"></i><i class="bench-bar__fill" style="width:71.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">724 ms</b><b class="bench-num" data-stat="p95">743 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export sparse">Export sparse</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:37.14%"></i><i class="bench-bar__fill" style="width:35.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.5 ms</b><b class="bench-num" data-stat="p95">30.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.14%"></i><i class="bench-bar__fill" style="width:50.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">102 ms</b><b class="bench-num" data-stat="p95">111 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="import combined">Import combined</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.34%"></i><i class="bench-bar__fill" style="width:74.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">913 ms</b><b class="bench-num" data-stat="p95">941 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:92.75%"></i><i class="bench-bar__fill" style="width:92.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.03 s</b><b class="bench-num" data-stat="p95">5.13 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject compression-ratio">Reject compression ratio</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.45%"></i><i class="bench-bar__fill" style="width:3.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.38 ms</b><b class="bench-num" data-stat="p95">2.18 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject deep-xml">Reject deep xml</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.05%"></i><i class="bench-bar__fill" style="width:16.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.78 ms</b><b class="bench-num" data-stat="p95">5.27 ms</b></span></div>
</div>
</figure>

#### Peak resident memory

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">linear scale — shorter uses less memory</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">866.0 MiB</span><span class="bench-ruler__tick" style="left:50.00%">1,731.9 MiB</span><span class="bench-ruler__tick" style="left:75.00%">2,597.9 MiB</span><span class="bench-ruler__tick" style="left:100.00%">3,463.9 MiB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export rich">Export rich<span class="bench-viz__detail">Maximum peak RSS: current 151.4 MB · baseline 188.4 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.17%"></i><i class="bench-bar__fill" style="width:4.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">142.2 MiB</b><b class="bench-num" data-stat="p95">144.4 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.18%"></i><i class="bench-bar__fill" style="width:5.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">177.1 MiB</b><b class="bench-num" data-stat="p95">179.5 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export scalar">Export scalar<span class="bench-viz__detail">Maximum peak RSS: current 165.3 MB · baseline 217.2 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.55%"></i><i class="bench-bar__fill" style="width:4.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">157.3 MiB</b><b class="bench-num" data-stat="p95">157.6 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.98%"></i><i class="bench-bar__fill" style="width:5.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">206.4 MiB</b><b class="bench-num" data-stat="p95">207.1 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export shared-style">Export shared style<span class="bench-viz__detail">Maximum peak RSS: current 163.0 MB · baseline 307.6 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.49%"></i><i class="bench-bar__fill" style="width:4.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">154.9 MiB</b><b class="bench-num" data-stat="p95">155.4 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.47%"></i><i class="bench-bar__fill" style="width:8.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">290.7 MiB</b><b class="bench-num" data-stat="p95">293.3 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export sparse">Export sparse<span class="bench-viz__detail">Maximum peak RSS: current 97.0 MB · baseline 120.1 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.67%"></i><i class="bench-bar__fill" style="width:2.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">91.6 MiB</b><b class="bench-num" data-stat="p95">92.5 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:3.30%"></i><i class="bench-bar__fill" style="width:3.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">113.3 MiB</b><b class="bench-num" data-stat="p95">114.5 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="import combined">Import combined<span class="bench-viz__detail">Maximum peak RSS: current 329.5 MB · baseline 3642.2 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.06%"></i><i class="bench-bar__fill" style="width:9.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">311.6 MiB</b><b class="bench-num" data-stat="p95">313.8 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:97.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3,366.1 MiB</b><b class="bench-num" data-stat="p95">3,463.9 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject compression-ratio">Reject compression ratio<span class="bench-viz__detail">Maximum peak RSS: current 49.4 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.36%"></i><i class="bench-bar__fill" style="width:1.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">46.5 MiB</b><b class="bench-num" data-stat="p95">47.0 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject deep-xml">Reject deep xml<span class="bench-viz__detail">Maximum peak RSS: current 52.1 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.43%"></i><i class="bench-bar__fill" style="width:1.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">49.0 MiB</b><b class="bench-num" data-stat="p95">49.5 MiB</b></span></div>
</div>
</figure>

<details class="bench-all"><summary>All measurements</summary>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 08:11 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="49e05e298c3f39a8cede038fe8d0062343abc21f">49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.0 release candidate · ExcelJS 4.4.0 at baseline <code title="87fadb72397947ea8c6ba576682925c7879579b8">87fadb723979</code></dd></div>
<div><dt>Fixture</dt><dd><code>bench/fixtures/xlsx-codec-corpus.xlsx</code> · 1,038,346 bytes · <code title="2633e51a4a3caa8d34b2e2147b997c6ebdd0cf514be6e6c60663a0f7659e6e00">2633e51a4a3c</code> · LibreOffice 26.2.4.2 Calc MS Excel 2007 XML</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.3 · Node v26.3.0 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/xlsx-results.json</code></dd></div>
</dl>


</details>

Reproduce with a checkout of the baseline commit, built and passed as the comparison root:

```sh verify title="XLSX codec evidence"
git worktree add ../sheetwrite-xlsx-baseline 87fadb72397947ea8c6ba576682925c7879579b8
cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages
cd - && bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root ../sheetwrite-xlsx-baseline
```
