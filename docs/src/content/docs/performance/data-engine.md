---
title: "Data engine performance"
description: "Ingest, window read, edit, sort, filter, and aggregate timings of the data store."
---

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 05:24 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="49e05e298c3f39a8cede038fe8d0062343abc21f">49e05e298c3f</code> clean worktree</dd></div>
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
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:16.67%">10 µs</span><span class="bench-ruler__tick" style="left:33.33%">100 µs</span><span class="bench-ruler__tick" style="left:50.00%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:83.33%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span><span class="bench-viz__ratio"><strong>440×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.49%"></i><i class="bench-bar__fill" style="width:45.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.46%"></i><i class="bench-bar__fill" style="width:89.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">248 ms</b><b class="bench-num" data-stat="p95">268 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span><span class="bench-viz__ratio"><strong>17.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.03%"></i><i class="bench-bar__fill" style="width:12.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.43%"></i><i class="bench-bar__fill" style="width:33.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span><span class="bench-viz__ratio"><strong>32.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.76%"></i><i class="bench-bar__fill" style="width:60.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.46 ms</b><b class="bench-num" data-stat="p95">5.83 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.94%"></i><i class="bench-bar__fill" style="width:86.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">146 ms</b><b class="bench-num" data-stat="p95">217 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span><span class="bench-viz__ratio"><strong>728×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.54%"></i><i class="bench-bar__fill" style="width:36.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.16 ms</b><b class="bench-num" data-stat="p95">0.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.17%"></i><i class="bench-bar__fill" style="width:84.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">114 ms</b><b class="bench-num" data-stat="p95">129 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span><span class="bench-viz__ratio"><strong>2,258×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.83%"></i><i class="bench-bar__fill" style="width:21.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.43%"></i><i class="bench-bar__fill" style="width:77.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">45.4 ms</b><b class="bench-num" data-stat="p95">50.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span><span class="bench-viz__ratio"><strong>17.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.26%"></i><i class="bench-bar__fill" style="width:11.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.81%"></i><i class="bench-bar__fill" style="width:32.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.09 ms</b><b class="bench-num" data-stat="p95">0.11 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">10 µs</span><span class="bench-ruler__tick" style="left:16.67%">100 µs</span><span class="bench-ruler__tick" style="left:33.33%">1 ms</span><span class="bench-ruler__tick" style="left:50.00%">10 ms</span><span class="bench-ruler__tick" style="left:66.67%">100 ms</span><span class="bench-ruler__tick" style="left:83.33%">1 s</span><span class="bench-ruler__tick" style="left:100.00%">10 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span><span class="bench-viz__ratio"><strong>479×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.34%"></i><i class="bench-bar__fill" style="width:44.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.87 ms</b><b class="bench-num" data-stat="p95">6.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:93.82%"></i><i class="bench-bar__fill" style="width:89.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.33 s</b><b class="bench-num" data-stat="p95">4.26 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span><span class="bench-viz__ratio"><strong>16.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:0.60%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.39%"></i><i class="bench-bar__fill" style="width:17.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.12 ms</b><b class="bench-num" data-stat="p95">0.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span><span class="bench-viz__ratio"><strong>150×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.75%"></i><i class="bench-bar__fill" style="width:42.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.57 ms</b><b class="bench-num" data-stat="p95">4.84 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.54%"></i><i class="bench-bar__fill" style="width:78.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">535 ms</b><b class="bench-num" data-stat="p95">1.18 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span><span class="bench-viz__ratio"><strong>11,379×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.34%"></i><i class="bench-bar__fill" style="width:22.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.22 ms</b><b class="bench-num" data-stat="p95">0.25 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.17%"></i><i class="bench-bar__fill" style="width:89.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.48 s</b><b class="bench-num" data-stat="p95">2.57 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span><span class="bench-viz__ratio"><strong>25,557×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.67%"></i><i class="bench-bar__fill" style="width:9.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.16%"></i><i class="bench-bar__fill" style="width:82.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">908 ms</b><b class="bench-num" data-stat="p95">1.48 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span><span class="bench-viz__ratio"><strong>20.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.77%"></i><i class="bench-bar__fill" style="width:9.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.36%"></i><i class="bench-bar__fill" style="width:31.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.77 ms</b><b class="bench-num" data-stat="p95">0.87 ms</b></span></div>
</div>
</section>
</figure>

Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:16.67%">10 µs</span><span class="bench-ruler__tick" style="left:33.33%">100 µs</span><span class="bench-ruler__tick" style="left:50.00%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:83.33%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.94%"></i><i class="bench-bar__fill" style="width:78.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">53.6 ms</b><b class="bench-num" data-stat="p95">54.5 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.90%"></i><i class="bench-bar__fill" style="width:90.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">284 ms</b><b class="bench-num" data-stat="p95">285 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.91%"></i><i class="bench-bar__fill" style="width:95.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">565 ms</b><b class="bench-num" data-stat="p95">568 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:16.33%"></i><i class="bench-bar__fill" style="width:15.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.42%"></i><i class="bench-bar__fill" style="width:16.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.07%"></i><i class="bench-bar__fill" style="width:17.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.68%"></i><i class="bench-bar__fill" style="width:60.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.19 ms</b><b class="bench-num" data-stat="p95">5.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.35%"></i><i class="bench-bar__fill" style="width:59.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.84 ms</b><b class="bench-num" data-stat="p95">4.18 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.62%"></i><i class="bench-bar__fill" style="width:59.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.94 ms</b><b class="bench-num" data-stat="p95">4.34 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.53%"></i><i class="bench-bar__fill" style="width:56.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.59 ms</b><b class="bench-num" data-stat="p95">2.83 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.61%"></i><i class="bench-bar__fill" style="width:68.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.6 ms</b><b class="bench-num" data-stat="p95">13.1 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.83%"></i><i class="bench-bar__fill" style="width:73.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.9 ms</b><b class="bench-num" data-stat="p95">26.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.69%"></i><i class="bench-bar__fill" style="width:43.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.71%"></i><i class="bench-bar__fill" style="width:54.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.88 ms</b><b class="bench-num" data-stat="p95">1.92 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.51%"></i><i class="bench-bar__fill" style="width:59.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.59 ms</b><b class="bench-num" data-stat="p95">3.72 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span></div>
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
