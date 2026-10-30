---
title: "Data engine performance"
description: "Ingest, window read, edit, sort, filter, and aggregate timings of the data store."
---

## Data engine benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> Head-to-head store operations at the sizes both engines complete headlessly; Sheetwrite additionally scales to 1M rows below.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:40 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.4 · Handsontable 18.1.2</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.4</dd></div>
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
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span><span class="bench-viz__ratio"><strong>559×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.20%"></i><i class="bench-bar__fill" style="width:47.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.73 ms</b><b class="bench-num" data-stat="p95">1.36 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.09%"></i><i class="bench-bar__fill" style="width:93.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">410 ms</b><b class="bench-num" data-stat="p95">507 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span><span class="bench-viz__ratio"><strong>17.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:21.83%"></i><i class="bench-bar__fill" style="width:16.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.45%"></i><i class="bench-bar__fill" style="width:37.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.17 ms</b><b class="bench-num" data-stat="p95">0.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span><span class="bench-viz__ratio"><strong>11.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.04%"></i><i class="bench-bar__fill" style="width:69.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.5 ms</b><b class="bench-num" data-stat="p95">27.7 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.00%"></i><i class="bench-bar__fill" style="width:87.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">172 ms</b><b class="bench-num" data-stat="p95">251 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span><span class="bench-viz__ratio"><strong>872×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.86%"></i><i class="bench-bar__fill" style="width:38.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.20 ms</b><b class="bench-num" data-stat="p95">0.65 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.22%"></i><i class="bench-bar__fill" style="width:87.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">171 ms</b><b class="bench-num" data-stat="p95">196 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span><span class="bench-viz__ratio"><strong>619×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.37%"></i><i class="bench-bar__fill" style="width:34.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.35%"></i><i class="bench-bar__fill" style="width:80.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">68.7 ms</b><b class="bench-num" data-stat="p95">87.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span><span class="bench-viz__ratio"><strong>61.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:6.28%"></i><i class="bench-bar__fill" style="width:5.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2 µs</b><b class="bench-num" data-stat="p95">2 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:37.69%"></i><i class="bench-bar__fill" style="width:35.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.13 ms</b><b class="bench-num" data-stat="p95">0.18 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">10 µs</span><span class="bench-ruler__tick" style="left:16.67%">100 µs</span><span class="bench-ruler__tick" style="left:33.33%">1 ms</span><span class="bench-ruler__tick" style="left:50.00%">10 ms</span><span class="bench-ruler__tick" style="left:66.67%">100 ms</span><span class="bench-ruler__tick" style="left:83.33%">1 s</span><span class="bench-ruler__tick" style="left:100.00%">10 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span><span class="bench-viz__ratio"><strong>792×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.20%"></i><i class="bench-bar__fill" style="width:44.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.90 ms</b><b class="bench-num" data-stat="p95">5.15 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:93.65%"></i><i class="bench-bar__fill" style="width:93.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.88 s</b><b class="bench-num" data-stat="p95">4.16 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span><span class="bench-viz__ratio"><strong>18.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:1.36%"></i><i class="bench-bar__fill" style="width:0.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:23.29%"></i><i class="bench-bar__fill" style="width:21.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.18 ms</b><b class="bench-num" data-stat="p95">0.25 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span><span class="bench-viz__ratio"><strong>47.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.09%"></i><i class="bench-bar__fill" style="width:48.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.96 ms</b><b class="bench-num" data-stat="p95">17.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.51%"></i><i class="bench-bar__fill" style="width:76.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">380 ms</b><b class="bench-num" data-stat="p95">447 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span><span class="bench-viz__ratio"><strong>5,586×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:29.24%"></i><i class="bench-bar__fill" style="width:23.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.57 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.53%"></i><i class="bench-bar__fill" style="width:85.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 s</b><b class="bench-num" data-stat="p95">1.55 s</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span><span class="bench-viz__ratio"><strong>4,666×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.09%"></i><i class="bench-bar__fill" style="width:18.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.12 ms</b><b class="bench-num" data-stat="p95">0.16 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.84%"></i><i class="bench-bar__fill" style="width:79.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">582 ms</b><b class="bench-num" data-stat="p95">617 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span><span class="bench-viz__ratio"><strong>59.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.29%"></i><i class="bench-bar__fill" style="width:4.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.78%"></i><i class="bench-bar__fill" style="width:33.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.40 ms</b></span></div>
</div>
</section>
</figure>

Sheetwrite alone at scale — Handsontable cannot complete these sizes headlessly:

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">10 µs</span><span class="bench-ruler__tick" style="left:20.00%">100 µs</span><span class="bench-ruler__tick" style="left:40.00%">1 ms</span><span class="bench-ruler__tick" style="left:60.00%">10 ms</span><span class="bench-ruler__tick" style="left:80.00%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="ingest">Ingest</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.50%"></i><i class="bench-bar__fill" style="width:75.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">56.3 ms</b><b class="bench-num" data-stat="p95">66.8 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:89.44%"></i><i class="bench-bar__fill" style="width:89.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">291 ms</b><b class="bench-num" data-stat="p95">297 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.50%"></i><i class="bench-bar__fill" style="width:95.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">595 ms</b><b class="bench-num" data-stat="p95">595 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="windowRead">Window read</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:2.28%"></i><i class="bench-bar__fill" style="width:1.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.53%"></i><i class="bench-bar__fill" style="width:3.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:4.60%"></i><i class="bench-bar__fill" style="width:3.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit">Edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.54%"></i><i class="bench-bar__fill" style="width:55.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.80 ms</b><b class="bench-num" data-stat="p95">9.48 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.14%"></i><i class="bench-bar__fill" style="width:55.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.63 ms</b><b class="bench-num" data-stat="p95">5.72 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.92%"></i><i class="bench-bar__fill" style="width:56.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.75 ms</b><b class="bench-num" data-stat="p95">24.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sort">Sort</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:46.59%"></i><i class="bench-bar__fill" style="width:45.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.97 ms</b><b class="bench-num" data-stat="p95">2.14 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.12%"></i><i class="bench-bar__fill" style="width:60.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.0 ms</b><b class="bench-num" data-stat="p95">10.1 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.40%"></i><i class="bench-bar__fill" style="width:67.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.4 ms</b><b class="bench-num" data-stat="p95">23.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="filter">Filter</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.69%"></i><i class="bench-bar__fill" style="width:32.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.14%"></i><i class="bench-bar__fill" style="width:43.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.56 ms</b><b class="bench-num" data-stat="p95">1.61 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.25%"></i><i class="bench-bar__fill" style="width:50.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.20 ms</b><b class="bench-num" data-stat="p95">3.25 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="aggregate">Aggregate</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:27.24%"></i><i class="bench-bar__fill" style="width:25.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.19 ms</b><b class="bench-num" data-stat="p95">0.23 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">500k rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:39.31%"></i><i class="bench-bar__fill" style="width:38.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.88 ms</b><b class="bench-num" data-stat="p95">0.92 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1M rows</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.15%"></i><i class="bench-bar__fill" style="width:44.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.74 ms</b><b class="bench-num" data-stat="p95">1.81 ms</b></span></div>
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

## Incremental pivot engine

Over 100,000 source rows, the SUM/AVERAGE build takes 28.873 ms median (30.493 ms p95), versus 0.0017 ms median (0.0116 ms p95) for an incremental value edit. The matrix has 3 row fields, 1 column field, and 2 value fields. Build and incremental edit timings describe different operations on the same engine, not a 0.5-versus-0.6 speedup.

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:42 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>CPU</dt><dd>12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Machine</dt><dd>hypr-zephyrus</dd></div>
<div><dt>Capture memory cap</dt><dd>8G</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/pivot-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled bench-viz--unlabelled" data-pagefind-ignore style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">operation</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:16.67%">10 µs</span><span class="bench-ruler__tick" style="left:33.33%">100 µs</span><span class="bench-ruler__tick" style="left:50.00%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:83.33%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="SUM / AVERAGE build">Sum / average build</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.74%"></i><i class="bench-bar__fill" style="width:74.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.9 ms</b><b class="bench-num" data-stat="p95">30.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="Value edit">Value edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.73%"></i><i class="bench-bar__fill" style="width:3.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="Donor-key edit">Donor key edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:18.41%"></i><i class="bench-bar__fill" style="width:7.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="MAX build">Max build</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.95%"></i><i class="bench-bar__fill" style="width:81.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">81.8 ms</b><b class="bench-num" data-stat="p95">109 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="MAX extreme-value edit">Max extreme value edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:17.39%"></i><i class="bench-bar__fill" style="width:6.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
</figure>

### Retained pivot memory

| Measurement | Bytes |
| --- | ---: |
| Before pivot | 9.0 MiB |
| With pivot | 13.6 MiB |
| Pivot increment | 4.6 MiB |

Retained engine allocation is not process peak RSS. Each edit sample is normalized per edit by the capture harness. The harness checks pivot status and edited aggregates before accepting its measurements.

Reproduce with:

```sh verify title="Incremental pivot evidence"
bun run --filter @sheetwrite/bench bench:pivot -- --output results/pivot-results.json
```
