---
title: "Render performance"
description: "Scroll, edit, and interaction timings of the live grid, measured against Handsontable."
---

## Render benchmark

<div class="evidence-available"><strong>Validated evidence.</strong> 1120/1120 engine/scenario/round runs completed across 4 workbook sizes; every completed run passed its correctness checkpoints.</div>

Both engines drive identical scripted interactions in a controlled browser. Pick a workbook size and a metric:

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:15 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Engines</dt><dd>Sheetwrite 0.5.4 · Handsontable 18.1.2</dd></div>
<div><dt>Environment</dt><dd>Bun 1.4.4 · Node compatibility 26.3.0 · Chromium 153.0.8010.12 · 12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
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
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.73%"></i><i class="bench-bar__fill" style="width:62.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.26 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.44%"></i><i class="bench-bar__fill" style="width:86.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.2 ms</b><b class="bench-num" data-stat="p95">21.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.26%"></i><i class="bench-bar__fill" style="width:61.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.56%"></i><i class="bench-bar__fill" style="width:76.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.65 ms</b><b class="bench-num" data-stat="p95">7.55 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.45%"></i><i class="bench-bar__fill" style="width:51.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.34%"></i><i class="bench-bar__fill" style="width:80.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 ms</b><b class="bench-num" data-stat="p95">10.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>60.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.07%"></i><i class="bench-bar__fill" style="width:48.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.32 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.89%"></i><i class="bench-bar__fill" style="width:84.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.3 ms</b><b class="bench-num" data-stat="p95">17.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.82%"></i><i class="bench-bar__fill" style="width:55.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.15%"></i><i class="bench-bar__fill" style="width:60.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.14 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.13%"></i><i class="bench-bar__fill" style="width:56.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.72 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.97%"></i><i class="bench-bar__fill" style="width:60.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.02 ms</b><b class="bench-num" data-stat="p95">1.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.53%"></i><i class="bench-bar__fill" style="width:54.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.74%"></i><i class="bench-bar__fill" style="width:62.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.39 ms</b><b class="bench-num" data-stat="p95">1.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>8.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.75%"></i><i class="bench-bar__fill" style="width:59.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.94 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.15%"></i><i class="bench-bar__fill" style="width:77.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.50 ms</b><b class="bench-num" data-stat="p95">8.08 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.33%"></i><i class="bench-bar__fill" style="width:60.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.17 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.12%"></i><i class="bench-bar__fill" style="width:78.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.40 ms</b><b class="bench-num" data-stat="p95">9.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.43%"></i><i class="bench-bar__fill" style="width:60.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.06 ms</b><b class="bench-num" data-stat="p95">1.18 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.12%"></i><i class="bench-bar__fill" style="width:78.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.12 ms</b><b class="bench-num" data-stat="p95">9.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.49%"></i><i class="bench-bar__fill" style="width:56.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.69 ms</b><b class="bench-num" data-stat="p95">0.75 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.97%"></i><i class="bench-bar__fill" style="width:63.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.42 ms</b><b class="bench-num" data-stat="p95">1.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.32%"></i><i class="bench-bar__fill" style="width:56.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.73 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.21%"></i><i class="bench-bar__fill" style="width:62.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.32 ms</b><b class="bench-num" data-stat="p95">1.62 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,627×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.82%"></i><i class="bench-bar__fill" style="width:11.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.22%"></i><i class="bench-bar__fill" style="width:75.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.00 ms</b><b class="bench-num" data-stat="p95">6.47 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>2,019×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.99%"></i><i class="bench-bar__fill" style="width:10.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.71%"></i><i class="bench-bar__fill" style="width:76.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.40 ms</b><b class="bench-num" data-stat="p95">6.85 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">7.8 MB</span><span class="bench-ruler__tick" style="left:50.00%">15.5 MB</span><span class="bench-ruler__tick" style="left:75.00%">23.3 MB</span><span class="bench-ruler__tick" style="left:100.00%">31.0 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.8 MB</b><b class="bench-num" data-stat="p95">3.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.1 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.9 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:46.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.4 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.6 MB</b><b class="bench-num" data-stat="p95">1.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:52.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.2 MB</b><b class="bench-num" data-stat="p95">3.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:61.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.1 MB</b><b class="bench-num" data-stat="p95">3.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.5 MB</b><b class="bench-num" data-stat="p95">1.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:58.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.2 MB</b><b class="bench-num" data-stat="p95">1.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.6 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:62.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:59.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.6 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:82.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.6 MB</b><b class="bench-num" data-stat="p95">5.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:80.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.1 MB</b><b class="bench-num" data-stat="p95">3.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.3 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:70.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.0 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:82.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.2×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">31.0 MB</b><b class="bench-num" data-stat="p95">19.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:82.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.6 MB</b><b class="bench-num" data-stat="p95">2.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1.1×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:91.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">28.3 MB</b><b class="bench-num" data-stat="p95">11.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:86.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.7 MB</b><b class="bench-num" data-stat="p95">7.5 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.62%"></i><i class="bench-bar__fill" style="width:61.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.24 ms</b><b class="bench-num" data-stat="p95">1.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.43%"></i><i class="bench-bar__fill" style="width:86.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.2 ms</b><b class="bench-num" data-stat="p95">21.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.23%"></i><i class="bench-bar__fill" style="width:61.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.20 ms</b><b class="bench-num" data-stat="p95">1.29 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.74%"></i><i class="bench-bar__fill" style="width:76.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.73 ms</b><b class="bench-num" data-stat="p95">7.71 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>25.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.44%"></i><i class="bench-bar__fill" style="width:51.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.31%"></i><i class="bench-bar__fill" style="width:80.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 ms</b><b class="bench-num" data-stat="p95">10.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>60.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.32%"></i><i class="bench-bar__fill" style="width:48.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.33 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.31%"></i><i class="bench-bar__fill" style="width:84.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.0 ms</b><b class="bench-num" data-stat="p95">18.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.20%"></i><i class="bench-bar__fill" style="width:55.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.57 ms</b><b class="bench-num" data-stat="p95">0.65 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.25%"></i><i class="bench-bar__fill" style="width:60.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.05 ms</b><b class="bench-num" data-stat="p95">1.15 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.07%"></i><i class="bench-bar__fill" style="width:56.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.66 ms</b><b class="bench-num" data-stat="p95">0.71 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.10%"></i><i class="bench-bar__fill" style="width:60.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.01 ms</b><b class="bench-num" data-stat="p95">1.13 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.97%"></i><i class="bench-bar__fill" style="width:54.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.54 ms</b><b class="bench-num" data-stat="p95">0.63 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.05%"></i><i class="bench-bar__fill" style="width:62.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>7.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.80%"></i><i class="bench-bar__fill" style="width:59.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.10 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.01%"></i><i class="bench-bar__fill" style="width:77.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.53 ms</b><b class="bench-num" data-stat="p95">7.95 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.73%"></i><i class="bench-bar__fill" style="width:60.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.06 ms</b><b class="bench-num" data-stat="p95">1.22 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.30%"></i><i class="bench-bar__fill" style="width:79.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.98 ms</b><b class="bench-num" data-stat="p95">10.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.77%"></i><i class="bench-bar__fill" style="width:60.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.11 ms</b><b class="bench-num" data-stat="p95">1.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.13%"></i><i class="bench-bar__fill" style="width:78.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.69 ms</b><b class="bench-num" data-stat="p95">10.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.95%"></i><i class="bench-bar__fill" style="width:56.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.70 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.25%"></i><i class="bench-bar__fill" style="width:63.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.46 ms</b><b class="bench-num" data-stat="p95">1.83 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.39%"></i><i class="bench-bar__fill" style="width:56.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.66 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.30%"></i><i class="bench-bar__fill" style="width:62.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.30 ms</b><b class="bench-num" data-stat="p95">1.84 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,612×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.71%"></i><i class="bench-bar__fill" style="width:11.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.84%"></i><i class="bench-bar__fill" style="width:75.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.97 ms</b><b class="bench-num" data-stat="p95">6.19 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,930×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:13.21%"></i><i class="bench-bar__fill" style="width:10.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.25%"></i><i class="bench-bar__fill" style="width:75.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.16 ms</b><b class="bench-num" data-stat="p95">6.49 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">11.7 MB</span><span class="bench-ruler__tick" style="left:50.00%">23.5 MB</span><span class="bench-ruler__tick" style="left:75.00%">35.2 MB</span><span class="bench-ruler__tick" style="left:100.00%">47.0 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.8 MB</b><b class="bench-num" data-stat="p95">2.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.2 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">1.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.0×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.8 MB</b><b class="bench-num" data-stat="p95">2.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.7 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.6 MB</b><b class="bench-num" data-stat="p95">3.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.5 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.0 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:47.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.2 MB</b><b class="bench-num" data-stat="p95">3.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">2.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:51.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.3 MB</b><b class="bench-num" data-stat="p95">3.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">0.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.0 MB</b><b class="bench-num" data-stat="p95">3.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:86.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.5 MB</b><b class="bench-num" data-stat="p95">16.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">47.0 MB</b><b class="bench-num" data-stat="p95">21.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>3.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.7 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:81.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.4 MB</b><b class="bench-num" data-stat="p95">5.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:73.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">34.4 MB</b><b class="bench-num" data-stat="p95">22.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:90.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.6 MB</b><b class="bench-num" data-stat="p95">3.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:65.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">30.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:77.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">36.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.43%"></i><i class="bench-bar__fill" style="width:61.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.23 ms</b><b class="bench-num" data-stat="p95">1.48 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.40%"></i><i class="bench-bar__fill" style="width:86.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.4 ms</b><b class="bench-num" data-stat="p95">20.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.57%"></i><i class="bench-bar__fill" style="width:61.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.21 ms</b><b class="bench-num" data-stat="p95">1.34 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.81%"></i><i class="bench-bar__fill" style="width:76.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.85 ms</b><b class="bench-num" data-stat="p95">7.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.37%"></i><i class="bench-bar__fill" style="width:51.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.40%"></i><i class="bench-bar__fill" style="width:80.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 ms</b><b class="bench-num" data-stat="p95">10.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>62.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.85%"></i><i class="bench-bar__fill" style="width:48.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.25 ms</b><b class="bench-num" data-stat="p95">0.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.54%"></i><i class="bench-bar__fill" style="width:84.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.9 ms</b><b class="bench-num" data-stat="p95">16.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.84%"></i><i class="bench-bar__fill" style="width:55.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.44%"></i><i class="bench-bar__fill" style="width:60.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.05 ms</b><b class="bench-num" data-stat="p95">1.18 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.37%"></i><i class="bench-bar__fill" style="width:56.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.04%"></i><i class="bench-bar__fill" style="width:60.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.59%"></i><i class="bench-bar__fill" style="width:54.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.92%"></i><i class="bench-bar__fill" style="width:63.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.43 ms</b><b class="bench-num" data-stat="p95">1.76 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>7.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.22%"></i><i class="bench-bar__fill" style="width:59.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.15 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.91%"></i><i class="bench-bar__fill" style="width:77.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.60 ms</b><b class="bench-num" data-stat="p95">7.86 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:66.37%"></i><i class="bench-bar__fill" style="width:65.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.87 ms</b><b class="bench-num" data-stat="p95">2.08 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.84%"></i><i class="bench-bar__fill" style="width:84.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.9 ms</b><b class="bench-num" data-stat="p95">19.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>8.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.10%"></i><i class="bench-bar__fill" style="width:64.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.67 ms</b><b class="bench-num" data-stat="p95">1.80 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.67%"></i><i class="bench-bar__fill" style="width:83.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.7 ms</b><b class="bench-num" data-stat="p95">15.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.62%"></i><i class="bench-bar__fill" style="width:56.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.76 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.84%"></i><i class="bench-bar__fill" style="width:62.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.75 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.59%"></i><i class="bench-bar__fill" style="width:56.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.76 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.10%"></i><i class="bench-bar__fill" style="width:62.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.43 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,668×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.78%"></i><i class="bench-bar__fill" style="width:11.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.31%"></i><i class="bench-bar__fill" style="width:75.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.03 ms</b><b class="bench-num" data-stat="p95">6.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,952×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:14.10%"></i><i class="bench-bar__fill" style="width:10.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.31%"></i><i class="bench-bar__fill" style="width:75.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.25 ms</b><b class="bench-num" data-stat="p95">6.54 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">36.6 MB</span><span class="bench-ruler__tick" style="left:50.00%">73.1 MB</span><span class="bench-ruler__tick" style="left:75.00%">109.7 MB</span><span class="bench-ruler__tick" style="left:100.00%">146.2 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">46.2 MB</b><b class="bench-num" data-stat="p95">4.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.4 MB</b><b class="bench-num" data-stat="p95">3.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:16.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.5 MB</b><b class="bench-num" data-stat="p95">6.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">36.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:14.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.0 MB</b><b class="bench-num" data-stat="p95">2.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.6 MB</b><b class="bench-num" data-stat="p95">7.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.4 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.9 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">34.5 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.6 MB</b><b class="bench-num" data-stat="p95">3.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:14.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.2 MB</b><b class="bench-num" data-stat="p95">3.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:28.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.1 MB</b><b class="bench-num" data-stat="p95">5.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>6.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:85.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">125.6 MB</b><b class="bench-num" data-stat="p95">87.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.1 MB</b><b class="bench-num" data-stat="p95">1.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">146.2 MB</b><b class="bench-num" data-stat="p95">25.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>4.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:64.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">93.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>5.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.7 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:64.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">94.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">43.9 MB</b><b class="bench-num" data-stat="p95">24.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">84.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.8 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:62.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">91.0 MB</b><b class="bench-num" data-stat="p95">10.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:16.67%">10 µs</span><span class="bench-ruler__tick" style="left:33.33%">100 µs</span><span class="bench-ruler__tick" style="left:50.00%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:83.33%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>17.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.67%"></i><i class="bench-bar__fill" style="width:51.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.16 ms</b><b class="bench-num" data-stat="p95">1.26 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.03%"></i><i class="bench-bar__fill" style="width:71.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.3 ms</b><b class="bench-num" data-stat="p95">21.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>6.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.73%"></i><i class="bench-bar__fill" style="width:50.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.12 ms</b><b class="bench-num" data-stat="p95">1.67 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.35%"></i><i class="bench-bar__fill" style="width:63.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.75 ms</b><b class="bench-num" data-stat="p95">7.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.43%"></i><i class="bench-bar__fill" style="width:43.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.05%"></i><i class="bench-bar__fill" style="width:66.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.3 ms</b><b class="bench-num" data-stat="p95">10.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>60.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.32%"></i><i class="bench-bar__fill" style="width:40.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.26 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:70.34%"></i><i class="bench-bar__fill" style="width:70.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.0 ms</b><b class="bench-num" data-stat="p95">16.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.28%"></i><i class="bench-bar__fill" style="width:46.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.64%"></i><i class="bench-bar__fill" style="width:50.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.02 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.91%"></i><i class="bench-bar__fill" style="width:45.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.56%"></i><i class="bench-bar__fill" style="width:50.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.08 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>3.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.96%"></i><i class="bench-bar__fill" style="width:44.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.46 ms</b><b class="bench-num" data-stat="p95">1.51 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.89%"></i><i class="bench-bar__fill" style="width:52.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 ms</b><b class="bench-num" data-stat="p95">1.71 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>8.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.28%"></i><i class="bench-bar__fill" style="width:49.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.87 ms</b><b class="bench-num" data-stat="p95">1.57 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.94%"></i><i class="bench-bar__fill" style="width:64.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.59 ms</b><b class="bench-num" data-stat="p95">7.88 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>7.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.32%"></i><i class="bench-bar__fill" style="width:68.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.5 ms</b><b class="bench-num" data-stat="p95">12.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.94%"></i><i class="bench-bar__fill" style="width:82.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">95.2 ms</b><b class="bench-num" data-stat="p95">165 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>6.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.47%"></i><i class="bench-bar__fill" style="width:68.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.4 ms</b><b class="bench-num" data-stat="p95">12.8 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.87%"></i><i class="bench-bar__fill" style="width:81.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.7 ms</b><b class="bench-num" data-stat="p95">124 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.48%"></i><i class="bench-bar__fill" style="width:46.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">1.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.78%"></i><i class="bench-bar__fill" style="width:52.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.38 ms</b><b class="bench-num" data-stat="p95">1.47 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.60%"></i><i class="bench-bar__fill" style="width:46.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.60 ms</b><b class="bench-num" data-stat="p95">1.43 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.25%"></i><i class="bench-bar__fill" style="width:51.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.36 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,640×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.94%"></i><i class="bench-bar__fill" style="width:9.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.08%"></i><i class="bench-bar__fill" style="width:62.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.95 ms</b><b class="bench-num" data-stat="p95">6.10 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,972×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.45%"></i><i class="bench-bar__fill" style="width:8.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">3 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.37%"></i><i class="bench-bar__fill" style="width:63.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.28 ms</b><b class="bench-num" data-stat="p95">6.34 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">220.8 MB</span><span class="bench-ruler__tick" style="left:50.00%">441.6 MB</span><span class="bench-ruler__tick" style="left:75.00%">662.5 MB</span><span class="bench-ruler__tick" style="left:100.00%">883.3 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:14.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">123.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">226.5 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>2.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">83.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">232.6 MB</b><b class="bench-num" data-stat="p95">5.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">97.4 MB</b><b class="bench-num" data-stat="p95">18.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">191.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">83.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">195.3 MB</b><b class="bench-num" data-stat="p95">9.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">77.7 MB</b><b class="bench-num" data-stat="p95">3.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">192.8 MB</b><b class="bench-num" data-stat="p95">11.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">78.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">197.0 MB</b><b class="bench-num" data-stat="p95">4.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">200.1 MB</b><b class="bench-num" data-stat="p95">2.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>2.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.5 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">208.1 MB</b><b class="bench-num" data-stat="p95">9.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>5.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">87.5 MB</b><b class="bench-num" data-stat="p95">8.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">436.6 MB</b><b class="bench-num" data-stat="p95">237.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>9.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">90.3 MB</b><b class="bench-num" data-stat="p95">6.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">883.3 MB</b><b class="bench-num" data-stat="p95">467.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>10.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">82.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:99.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">877.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>4.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">76.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">361.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">109.6 MB</b><b class="bench-num" data-stat="p95">33.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">319.9 MB</b><b class="bench-num" data-stat="p95">17.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>4.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">102.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:50.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">447.1 MB</b><b class="bench-num" data-stat="p95">2.6 MB</b></span></div>
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

## Chart source tracking

With 2,000 literal-source charts, an outside-source edit takes 6.28 µs median / 10.27 µs p95, versus 6.74 / 16.51 µs with no charts. No chart is reported or resolved. Median cost does not rise proportionally across 200, 2,000 and 20,000 charts in this capture. This is not an asymptotic guarantee: the 20,000-chart p95 is 26.76 µs versus 11.13 µs without charts.

These are transaction-tracking costs, not SVG drawing or browser frame times. The no-chart control belongs to the same 0.6 capture, not an older release. Formula-backed sources refresh conservatively on value commits; their full costs and event counts remain visible below.

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:42 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>CPU</dt><dd>12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Machine</dt><dd>hypr-zephyrus</dd></div>
<div><dt>Capture memory cap</dt><dd>8G</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/chart-tracking-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">commit</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:25.00%">10 µs</span><span class="bench-ruler__tick" style="left:50.00%">100 µs</span><span class="bench-ruler__tick" style="left:75.00%">1 ms</span><span class="bench-ruler__tick" style="left:100.00%">10 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="No-chart baseline">No chart baseline</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine"></span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.44%"></i><i class="bench-bar__fill" style="width:20.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="200 charts · literal · outside source">200 charts · literal · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.20%"></i><i class="bench-bar__fill" style="width:24.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.01%"></i><i class="bench-bar__fill" style="width:26.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="200 charts · literal · inside source">200 charts · literal · inside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.17%"></i><i class="bench-bar__fill" style="width:26.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.01%"></i><i class="bench-bar__fill" style="width:26.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:34.79%"></i><i class="bench-bar__fill" style="width:25.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="200 charts · formula · outside source">200 charts · formula · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.04%"></i><i class="bench-bar__fill" style="width:43.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.05 ms</b><b class="bench-num" data-stat="p95">0.21 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.01%"></i><i class="bench-bar__fill" style="width:26.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.93%"></i><i class="bench-bar__fill" style="width:42.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.05 ms</b><b class="bench-num" data-stat="p95">0.21 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="200 charts · formula · literal-dependency-edit source">200 charts · formula · literal dependency edit source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.35%"></i><i class="bench-bar__fill" style="width:38.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.07 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.01%"></i><i class="bench-bar__fill" style="width:26.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.18%"></i><i class="bench-bar__fill" style="width:38.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.06 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="2000 charts · literal · outside source">2000 charts · literal · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.29%"></i><i class="bench-bar__fill" style="width:19.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.44%"></i><i class="bench-bar__fill" style="width:20.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="2000 charts · literal · inside source">2000 charts · literal · inside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.79%"></i><i class="bench-bar__fill" style="width:20.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.44%"></i><i class="bench-bar__fill" style="width:20.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.60%"></i><i class="bench-bar__fill" style="width:20.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="2000 charts · formula · outside source">2000 charts · formula · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.29%"></i><i class="bench-bar__fill" style="width:56.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.18 ms</b><b class="bench-num" data-stat="p95">0.24 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.44%"></i><i class="bench-bar__fill" style="width:20.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.18%"></i><i class="bench-bar__fill" style="width:56.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.18 ms</b><b class="bench-num" data-stat="p95">0.23 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="2000 charts · formula · literal-dependency-edit source">2000 charts · formula · literal dependency edit source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.46%"></i><i class="bench-bar__fill" style="width:55.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.17 ms</b><b class="bench-num" data-stat="p95">0.29 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.44%"></i><i class="bench-bar__fill" style="width:20.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.34%"></i><i class="bench-bar__fill" style="width:55.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.16 ms</b><b class="bench-num" data-stat="p95">0.28 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="20000 charts · literal · outside source">20000 charts · literal · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.69%"></i><i class="bench-bar__fill" style="width:21.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.17%"></i><i class="bench-bar__fill" style="width:19.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="20000 charts · literal · inside source">20000 charts · literal · inside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.86%"></i><i class="bench-bar__fill" style="width:20.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.17%"></i><i class="bench-bar__fill" style="width:19.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.65%"></i><i class="bench-bar__fill" style="width:20.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="20000 charts · formula · outside source">20000 charts · formula · outside source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.52%"></i><i class="bench-bar__fill" style="width:84.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.35 ms</b><b class="bench-num" data-stat="p95">4.18 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.17%"></i><i class="bench-bar__fill" style="width:19.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.50%"></i><i class="bench-bar__fill" style="width:84.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.35 ms</b><b class="bench-num" data-stat="p95">4.17 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="20000 charts · formula · literal-dependency-edit source">20000 charts · formula · literal dependency edit source</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Commit</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:90.01%"></i><i class="bench-bar__fill" style="width:84.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.38 ms</b><b class="bench-num" data-stat="p95">3.98 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">No charts</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:26.17%"></i><i class="bench-bar__fill" style="width:19.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Event</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:89.99%"></i><i class="bench-bar__fill" style="width:84.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.38 ms</b><b class="bench-num" data-stat="p95">3.98 ms</b></span></div>
</div>
</figure>

### Tracking checkpoints

Event timings are omitted when no event is expected. Counts below are checked for every commit. Chart views are resolved only after the timer stops.

| Charts | Source | Edit | Expected events | Expected charts | Resolutions / commit |
| ---: | --- | --- | ---: | ---: | ---: |
| 200 | literal | outside | 0 | 0 | 0 |
| 200 | literal | inside | 1 | 1 | 1 |
| 200 | formula | outside | 1 | 200 | 200 |
| 200 | formula | literal-dependency-edit | 1 | 200 | 200 |
| 2000 | literal | outside | 0 | 0 | 0 |
| 2000 | literal | inside | 1 | 1 | 1 |
| 2000 | formula | outside | 1 | 2000 | 2000 |
| 2000 | formula | literal-dependency-edit | 1 | 2000 | 2000 |
| 20000 | literal | outside | 0 | 0 | 0 |
| 20000 | literal | inside | 1 | 1 | 1 |
| 20000 | formula | outside | 1 | 20000 | 20000 |
| 20000 | formula | literal-dependency-edit | 1 | 20000 | 20000 |

Each commit series contains 101 measured samples after 20 warmups.

Each chart reads two cells on its own row in one contiguous source region. Owners hold at most 100 charts per sheet. Inside edits change the second cell of chart 0's source and must report exactly that chart for literal sources. For formula sources, the row named literal-dependency-edit changes the literal second cell that chart 0's formula reads. The formula stays in place, so the index is not rebuilt. The conservative policy still reports every computed chart. A formula-replacement edit, which rebuilds the index, is not measured in 0.6. After each commit, an untimed check confirms the dependent formula value changed and the expected charts were reported. Outside edits occur after the source region. They must trigger no event or view resolution for literal sources. Both formula cases report every computed chart, so their cost can grow with chart count. View resolution and value checks run after the timer stops. Event latency ends on entry to the callback. Setup is untimed. Outside edits still query source-index blocks; a silent event stream is not a constant-cost guarantee.

Reproduce with:

```sh verify title="Chart source-tracking evidence"
bun run --filter @sheetwrite/bench bench:charts
```
