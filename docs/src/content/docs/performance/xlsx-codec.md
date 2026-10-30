---
title: "XLSX codec performance"
description: "Import and export time and peak memory for XLSX files."
---

<div class="evidence-available"><strong>Validated evidence.</strong> 5 compared operations over 5 process-isolated rounds each, from one checked corpus fixture.</div>

Current and baseline are the same codec at different commits, measured in the same session. Baseline commit: <code title="87fadb72397947ea8c6ba576682925c7879579b8">87fadb723979</code>.

## Operation time

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 ms</span><span class="bench-ruler__tick" style="left:20.00%">10 ms</span><span class="bench-ruler__tick" style="left:40.00%">100 ms</span><span class="bench-ruler__tick" style="left:60.00%">1 s</span><span class="bench-ruler__tick" style="left:80.00%">10 s</span><span class="bench-ruler__tick" style="left:100.00%">100 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export rich">Export rich</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.74%"></i><i class="bench-bar__fill" style="width:51.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">370 ms</b><b class="bench-num" data-stat="p95">387 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.04%"></i><i class="bench-bar__fill" style="width:56.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">697 ms</b><b class="bench-num" data-stat="p95">711 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export scalar">Export scalar</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.22%"></i><i class="bench-bar__fill" style="width:52.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">442 ms</b><b class="bench-num" data-stat="p95">458 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.63%"></i><i class="bench-bar__fill" style="width:55.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">601 ms</b><b class="bench-num" data-stat="p95">605 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export shared-style">Export shared style</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.02%"></i><i class="bench-bar__fill" style="width:56.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">688 ms</b><b class="bench-num" data-stat="p95">709 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.37%"></i><i class="bench-bar__fill" style="width:61.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.25 s</b><b class="bench-num" data-stat="p95">1.31 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export sparse">Export sparse</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:36.62%"></i><i class="bench-bar__fill" style="width:36.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">65.3 ms</b><b class="bench-num" data-stat="p95">67.8 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.48%"></i><i class="bench-bar__fill" style="width:45.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">185 ms</b><b class="bench-num" data-stat="p95">188 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="import combined">Import combined</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.91%"></i><i class="bench-bar__fill" style="width:61.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.23 s</b><b class="bench-num" data-stat="p95">1.25 s</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.69%"></i><i class="bench-bar__fill" style="width:80.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 s</b><b class="bench-num" data-stat="p95">10.8 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject compression-ratio">Reject compression ratio</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.50%"></i><i class="bench-bar__fill" style="width:8.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.69 ms</b><b class="bench-num" data-stat="p95">2.99 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject deep-xml">Reject deep xml</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:19.63%"></i><i class="bench-bar__fill" style="width:18.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.78 ms</b><b class="bench-num" data-stat="p95">9.58 ms</b></span></div>
</div>
</figure>

## Peak resident memory

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">linear scale — shorter uses less memory</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">859.4 MiB</span><span class="bench-ruler__tick" style="left:50.00%">1,718.8 MiB</span><span class="bench-ruler__tick" style="left:75.00%">2,578.1 MiB</span><span class="bench-ruler__tick" style="left:100.00%">3,437.5 MiB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export rich">Export rich<span class="bench-viz__detail">Maximum peak RSS: current 148.2 MB · baseline 182.7 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.10%"></i><i class="bench-bar__fill" style="width:4.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">138.9 MiB</b><b class="bench-num" data-stat="p95">141.0 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.06%"></i><i class="bench-bar__fill" style="width:5.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">171.8 MiB</b><b class="bench-num" data-stat="p95">173.9 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export scalar">Export scalar<span class="bench-viz__detail">Maximum peak RSS: current 167.2 MB · baseline 208.7 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.63%"></i><i class="bench-bar__fill" style="width:4.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">157.4 MiB</b><b class="bench-num" data-stat="p95">159.2 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.78%"></i><i class="bench-bar__fill" style="width:5.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">197.2 MiB</b><b class="bench-num" data-stat="p95">198.7 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export shared-style">Export shared style<span class="bench-viz__detail">Maximum peak RSS: current 174.0 MB · baseline 297.2 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.82%"></i><i class="bench-bar__fill" style="width:4.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">164.0 MiB</b><b class="bench-num" data-stat="p95">165.6 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.23%"></i><i class="bench-bar__fill" style="width:8.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">281.2 MiB</b><b class="bench-num" data-stat="p95">283.1 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="export sparse">Export sparse<span class="bench-viz__detail">Maximum peak RSS: current 96.0 MB · baseline 113.0 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.66%"></i><i class="bench-bar__fill" style="width:2.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">90.5 MiB</b><b class="bench-num" data-stat="p95">91.5 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:3.13%"></i><i class="bench-bar__fill" style="width:3.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">106.9 MiB</b><b class="bench-num" data-stat="p95">107.6 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="import combined">Import combined<span class="bench-viz__detail">Maximum peak RSS: current 218.0 MB · baseline 3612.9 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:6.05%"></i><i class="bench-bar__fill" style="width:6.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">206.7 MiB</b><b class="bench-num" data-stat="p95">207.8 MiB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Baseline</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:100.00%"></i><i class="bench-bar__fill" style="width:98.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3,402.0 MiB</b><b class="bench-num" data-stat="p95">3,437.5 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject compression-ratio">Reject compression ratio<span class="bench-viz__detail">Maximum peak RSS: current 46.7 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.29%"></i><i class="bench-bar__fill" style="width:1.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">43.9 MiB</b><b class="bench-num" data-stat="p95">44.4 MiB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="reject deep-xml">Reject deep xml<span class="bench-viz__detail">Maximum peak RSS: current 49.7 MB</span></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Current</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.38%"></i><i class="bench-bar__fill" style="width:1.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">46.7 MiB</b><b class="bench-num" data-stat="p95">47.4 MiB</b></span></div>
</div>
</figure>

<details class="bench-all"><summary>All measurements</summary>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-29 03:40 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.4 · ExcelJS 4.4.0 at baseline <code title="87fadb72397947ea8c6ba576682925c7879579b8">87fadb723979</code></dd></div>
<div><dt>Fixture</dt><dd><code>bench/fixtures/xlsx-codec-corpus.xlsx</code> · 1,038,346 bytes · <code title="2633e51a4a3caa8d34b2e2147b997c6ebdd0cf514be6e6c60663a0f7659e6e00">2633e51a4a3c</code> · LibreOffice 26.2.4.2 Calc MS Excel 2007 XML</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.4 · Node v26.3.0 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/xlsx-results.json</code></dd></div>
</dl>


</details>

Reproduce with a checkout of the baseline commit, built and passed as the comparison root:

```sh verify title="XLSX codec evidence"
git worktree add ../sheetwrite-xlsx-baseline 87fadb72397947ea8c6ba576682925c7879579b8
cd ../sheetwrite-xlsx-baseline && bun install --frozen-lockfile && bun run build:packages
cd - && bun run --filter @sheetwrite/bench bench:xlsx -- --baseline-root ../sheetwrite-xlsx-baseline
```
