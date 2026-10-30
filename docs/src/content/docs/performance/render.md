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
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.74%"></i><i class="bench-bar__fill" style="width:62.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.27 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.44%"></i><i class="bench-bar__fill" style="width:86.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.2 ms</b><b class="bench-num" data-stat="p95">21.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.27%"></i><i class="bench-bar__fill" style="width:61.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.20 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.61%"></i><i class="bench-bar__fill" style="width:76.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.67 ms</b><b class="bench-num" data-stat="p95">7.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.59%"></i><i class="bench-bar__fill" style="width:51.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.43 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.35%"></i><i class="bench-bar__fill" style="width:80.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 ms</b><b class="bench-num" data-stat="p95">10.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>60.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.14%"></i><i class="bench-bar__fill" style="width:48.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.32 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.09%"></i><i class="bench-bar__fill" style="width:84.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.3 ms</b><b class="bench-num" data-stat="p95">18.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.35%"></i><i class="bench-bar__fill" style="width:55.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.20%"></i><i class="bench-bar__fill" style="width:60.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.15 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.16%"></i><i class="bench-bar__fill" style="width:56.54%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.72 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.00%"></i><i class="bench-bar__fill" style="width:60.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.02 ms</b><b class="bench-num" data-stat="p95">1.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.60%"></i><i class="bench-bar__fill" style="width:54.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.19%"></i><i class="bench-bar__fill" style="width:62.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.62 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>7.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.75%"></i><i class="bench-bar__fill" style="width:59.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.15%"></i><i class="bench-bar__fill" style="width:77.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.51 ms</b><b class="bench-num" data-stat="p95">8.08 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.38%"></i><i class="bench-bar__fill" style="width:60.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.17 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.16%"></i><i class="bench-bar__fill" style="width:78.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.41 ms</b><b class="bench-num" data-stat="p95">9.08 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.85%"></i><i class="bench-bar__fill" style="width:60.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.06 ms</b><b class="bench-num" data-stat="p95">1.24 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.24%"></i><i class="bench-bar__fill" style="width:78.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.13 ms</b><b class="bench-num" data-stat="p95">9.17 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.70%"></i><i class="bench-bar__fill" style="width:56.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.70 ms</b><b class="bench-num" data-stat="p95">0.77 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.19%"></i><i class="bench-bar__fill" style="width:63.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 ms</b><b class="bench-num" data-stat="p95">1.82 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.44%"></i><i class="bench-bar__fill" style="width:56.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.38%"></i><i class="bench-bar__fill" style="width:62.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.33 ms</b><b class="bench-num" data-stat="p95">1.66 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,605×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.84%"></i><i class="bench-bar__fill" style="width:11.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.31%"></i><i class="bench-bar__fill" style="width:75.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.01 ms</b><b class="bench-num" data-stat="p95">6.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>2,020×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:12.99%"></i><i class="bench-bar__fill" style="width:10.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.73%"></i><i class="bench-bar__fill" style="width:76.13%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.41 ms</b><b class="bench-num" data-stat="p95">6.86 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">7.8 MB</span><span class="bench-ruler__tick" style="left:50.00%">15.6 MB</span><span class="bench-ruler__tick" style="left:75.00%">23.5 MB</span><span class="bench-ruler__tick" style="left:100.00%">31.3 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.3 MB</b><b class="bench-num" data-stat="p95">4.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.2 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.9 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:46.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.4 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:40.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.8 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:53.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.7 MB</b><b class="bench-num" data-stat="p95">3.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:32.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:64.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.1 MB</b><b class="bench-num" data-stat="p95">3.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.6 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:59.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.6 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.6 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:63.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.0 MB</b><b class="bench-num" data-stat="p95">2.1 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:37.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.9 MB</b><b class="bench-num" data-stat="p95">1.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:62.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.6 MB</b><b class="bench-num" data-stat="p95">4.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:38.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:83.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.2 MB</b><b class="bench-num" data-stat="p95">7.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:42.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.3 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:83.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.1 MB</b><b class="bench-num" data-stat="p95">4.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.5 MB</b><b class="bench-num" data-stat="p95">0.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:75.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.6 MB</b><b class="bench-num" data-stat="p95">1.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:39.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:82.33%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.1×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">31.3 MB</b><b class="bench-num" data-stat="p95">20.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:88.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.8 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1.1×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:93.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">29.3 MB</b><b class="bench-num" data-stat="p95">12.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:88.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.6 MB</b><b class="bench-num" data-stat="p95">7.8 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.68%"></i><i class="bench-bar__fill" style="width:61.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.24 ms</b><b class="bench-num" data-stat="p95">1.36 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.47%"></i><i class="bench-bar__fill" style="width:86.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.3 ms</b><b class="bench-num" data-stat="p95">21.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.23%"></i><i class="bench-bar__fill" style="width:61.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.20 ms</b><b class="bench-num" data-stat="p95">1.29 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.81%"></i><i class="bench-bar__fill" style="width:76.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.77 ms</b><b class="bench-num" data-stat="p95">7.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>25.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.49%"></i><i class="bench-bar__fill" style="width:51.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.40 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.32%"></i><i class="bench-bar__fill" style="width:80.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.2 ms</b><b class="bench-num" data-stat="p95">10.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>60.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.72%"></i><i class="bench-bar__fill" style="width:48.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.34 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.33%"></i><i class="bench-bar__fill" style="width:84.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.0 ms</b><b class="bench-num" data-stat="p95">18.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.37%"></i><i class="bench-bar__fill" style="width:55.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.58 ms</b><b class="bench-num" data-stat="p95">0.66 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.31%"></i><i class="bench-bar__fill" style="width:60.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.07 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.5×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.13%"></i><i class="bench-bar__fill" style="width:56.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.66 ms</b><b class="bench-num" data-stat="p95">0.72 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.25%"></i><i class="bench-bar__fill" style="width:60.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.01 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.16%"></i><i class="bench-bar__fill" style="width:54.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.64 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.08%"></i><i class="bench-bar__fill" style="width:62.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.40 ms</b><b class="bench-num" data-stat="p95">1.60 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>7.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.84%"></i><i class="bench-bar__fill" style="width:59.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.97 ms</b><b class="bench-num" data-stat="p95">1.10 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.01%"></i><i class="bench-bar__fill" style="width:77.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.53 ms</b><b class="bench-num" data-stat="p95">7.95 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.83%"></i><i class="bench-bar__fill" style="width:60.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.08 ms</b><b class="bench-num" data-stat="p95">1.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.31%"></i><i class="bench-bar__fill" style="width:79.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.98 ms</b><b class="bench-num" data-stat="p95">10.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.79%"></i><i class="bench-bar__fill" style="width:60.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.11 ms</b><b class="bench-num" data-stat="p95">1.23 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.23%"></i><i class="bench-bar__fill" style="width:78.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">8.73 ms</b><b class="bench-num" data-stat="p95">10.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.2×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.06%"></i><i class="bench-bar__fill" style="width:56.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.71 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.44%"></i><i class="bench-bar__fill" style="width:63.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.48 ms</b><b class="bench-num" data-stat="p95">1.87 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.40%"></i><i class="bench-bar__fill" style="width:56.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.45%"></i><i class="bench-bar__fill" style="width:62.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.30 ms</b><b class="bench-num" data-stat="p95">1.87 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,608×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.76%"></i><i class="bench-bar__fill" style="width:11.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.86%"></i><i class="bench-bar__fill" style="width:75.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.98 ms</b><b class="bench-num" data-stat="p95">6.21 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,932×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:13.22%"></i><i class="bench-bar__fill" style="width:10.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.27%"></i><i class="bench-bar__fill" style="width:75.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.16 ms</b><b class="bench-num" data-stat="p95">6.51 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="10000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">11.9 MB</span><span class="bench-ruler__tick" style="left:50.00%">23.8 MB</span><span class="bench-ruler__tick" style="left:75.00%">35.7 MB</span><span class="bench-ruler__tick" style="left:100.00%">47.6 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:33.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.9 MB</b><b class="bench-num" data-stat="p95">2.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:34.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.2 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.9 MB</b><b class="bench-num" data-stat="p95">1.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:36.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="slower">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.0×</strong> heavier</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.29%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.9 MB</b><b class="bench-num" data-stat="p95">3.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.8 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.56%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.8 MB</b><b class="bench-num" data-stat="p95">3.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:41.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.6 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.2 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.5 MB</b><b class="bench-num" data-stat="p95">4.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>1.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.2 MB</b><b class="bench-num" data-stat="p95">3.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:51.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">24.3 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.3 MB</b><b class="bench-num" data-stat="p95">0.6 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:56.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">27.1 MB</b><b class="bench-num" data-stat="p95">6.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:29.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.9 MB</b><b class="bench-num" data-stat="p95">0.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:85.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.7 MB</b><b class="bench-num" data-stat="p95">17.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>3.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">47.6 MB</b><b class="bench-num" data-stat="p95">21.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>3.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.7 MB</b><b class="bench-num" data-stat="p95">0.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:86.23%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">41.0 MB</b><b class="bench-num" data-stat="p95">6.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:85.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.5 MB</b><b class="bench-num" data-stat="p95">28.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:93.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">44.6 MB</b><b class="bench-num" data-stat="p95">4.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:67.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">32.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:83.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">39.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="speed" style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>16.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.45%"></i><i class="bench-bar__fill" style="width:61.79%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.23 ms</b><b class="bench-num" data-stat="p95">1.49 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.42%"></i><i class="bench-bar__fill" style="width:86.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.5 ms</b><b class="bench-num" data-stat="p95">20.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>5.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.61%"></i><i class="bench-bar__fill" style="width:61.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.21 ms</b><b class="bench-num" data-stat="p95">1.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.81%"></i><i class="bench-bar__fill" style="width:76.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.88 ms</b><b class="bench-num" data-stat="p95">7.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.40%"></i><i class="bench-bar__fill" style="width:51.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.42 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:80.40%"></i><i class="bench-bar__fill" style="width:80.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.3 ms</b><b class="bench-num" data-stat="p95">10.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>62.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.89%"></i><i class="bench-bar__fill" style="width:48.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.25 ms</b><b class="bench-num" data-stat="p95">0.35 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:84.58%"></i><i class="bench-bar__fill" style="width:84.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">15.9 ms</b><b class="bench-num" data-stat="p95">16.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.91%"></i><i class="bench-bar__fill" style="width:55.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">0.62 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.59%"></i><i class="bench-bar__fill" style="width:60.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.05 ms</b><b class="bench-num" data-stat="p95">1.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.38%"></i><i class="bench-bar__fill" style="width:56.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.74 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.05%"></i><i class="bench-bar__fill" style="width:60.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.04 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.63%"></i><i class="bench-bar__fill" style="width:54.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.60 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.19%"></i><i class="bench-bar__fill" style="width:63.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 ms</b><b class="bench-num" data-stat="p95">1.82 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>7.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.31%"></i><i class="bench-bar__fill" style="width:59.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.98%"></i><i class="bench-bar__fill" style="width:77.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.61 ms</b><b class="bench-num" data-stat="p95">7.93 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>8.6×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:66.37%"></i><i class="bench-bar__fill" style="width:65.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.87 ms</b><b class="bench-num" data-stat="p95">2.08 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.53%"></i><i class="bench-bar__fill" style="width:84.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.1 ms</b><b class="bench-num" data-stat="p95">21.2 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>8.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.18%"></i><i class="bench-bar__fill" style="width:64.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.68 ms</b><b class="bench-num" data-stat="p95">1.81 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:83.72%"></i><i class="bench-bar__fill" style="width:83.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">14.7 ms</b><b class="bench-num" data-stat="p95">15.4 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.79%"></i><i class="bench-bar__fill" style="width:56.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.78 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.10%"></i><i class="bench-bar__fill" style="width:62.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.41 ms</b><b class="bench-num" data-stat="p95">1.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>1.9×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.65%"></i><i class="bench-bar__fill" style="width:56.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.68 ms</b><b class="bench-num" data-stat="p95">0.76 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.14%"></i><i class="bench-bar__fill" style="width:62.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.43 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,665×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:11.92%"></i><i class="bench-bar__fill" style="width:11.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.64%"></i><i class="bench-bar__fill" style="width:75.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.03 ms</b><b class="bench-num" data-stat="p95">6.79 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,957×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:14.18%"></i><i class="bench-bar__fill" style="width:10.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">5 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.33%"></i><i class="bench-bar__fill" style="width:75.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.26 ms</b><b class="bench-num" data-stat="p95">6.56 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="100000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">37.0 MB</span><span class="bench-ruler__tick" style="left:50.00%">74.0 MB</span><span class="bench-ruler__tick" style="left:75.00%">111.0 MB</span><span class="bench-ruler__tick" style="left:100.00%">148.0 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>2.1×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:31.53%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">46.7 MB</b><b class="bench-num" data-stat="p95">4.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.89%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.6 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:26.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">38.9 MB</b><b class="bench-num" data-stat="p95">3.9 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>1.6×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:15.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">23.6 MB</b><b class="bench-num" data-stat="p95">7.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">36.9 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:14.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.0 MB</b><b class="bench-num" data-stat="p95">3.2 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.8 MB</b><b class="bench-num" data-stat="p95">7.7 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.2 MB</b><b class="bench-num" data-stat="p95">3.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.16%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.0 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:23.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">35.4 MB</b><b class="bench-num" data-stat="p95">1.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">17.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.9 MB</b><b class="bench-num" data-stat="p95">4.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:14.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.4 MB</b><b class="bench-num" data-stat="p95">4.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:28.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">42.3 MB</b><b class="bench-num" data-stat="p95">5.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>6.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.76%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.4 MB</b><b class="bench-num" data-stat="p95">1.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:84.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">125.7 MB</b><b class="bench-num" data-stat="p95">88.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>7.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.7 MB</b><b class="bench-num" data-stat="p95">1.9 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">148.0 MB</b><b class="bench-num" data-stat="p95">27.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>4.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">19.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:64.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">95.2 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>5.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">18.9 MB</b><b class="bench-num" data-stat="p95">0.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:63.59%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">94.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:30.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">44.5 MB</b><b class="bench-num" data-stat="p95">25.1 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:57.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">85.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>2.3×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:27.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">40.4 MB</b><b class="bench-num" data-stat="p95">0.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:62.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">92.1 MB</b><b class="bench-num" data-stat="p95">10.2 MB</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="speed" style="--bench-segs:6">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:16.67%">10 µs</span><span class="bench-ruler__tick" style="left:33.33%">100 µs</span><span class="bench-ruler__tick" style="left:50.00%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:83.33%">100 ms</span><span class="bench-ruler__tick" style="left:100.00%">1 s</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>17.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.72%"></i><i class="bench-bar__fill" style="width:51.11%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.04%"></i><i class="bench-bar__fill" style="width:71.80%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">20.3 ms</b><b class="bench-num" data-stat="p95">21.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>6.0×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.80%"></i><i class="bench-bar__fill" style="width:50.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.69 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.43%"></i><i class="bench-bar__fill" style="width:63.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.75 ms</b><b class="bench-num" data-stat="p95">7.34 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>26.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.43%"></i><i class="bench-bar__fill" style="width:43.17%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.39 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.05%"></i><i class="bench-bar__fill" style="width:66.87%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">10.3 ms</b><b class="bench-num" data-stat="p95">10.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>59.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.45%"></i><i class="bench-bar__fill" style="width:40.46%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.27 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:70.36%"></i><i class="bench-bar__fill" style="width:70.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">16.0 ms</b><b class="bench-num" data-stat="p95">16.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>1.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.32%"></i><i class="bench-bar__fill" style="width:46.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.60 ms</b><b class="bench-num" data-stat="p95">1.38 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.71%"></i><i class="bench-bar__fill" style="width:50.18%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.10 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>1.8×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.36%"></i><i class="bench-bar__fill" style="width:45.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.56 ms</b><b class="bench-num" data-stat="p95">1.39 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.60%"></i><i class="bench-bar__fill" style="width:50.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>3.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.99%"></i><i class="bench-bar__fill" style="width:44.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.46 ms</b><b class="bench-num" data-stat="p95">1.51 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.00%"></i><i class="bench-bar__fill" style="width:52.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.44 ms</b><b class="bench-num" data-stat="p95">1.74 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>8.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.62%"></i><i class="bench-bar__fill" style="width:49.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.88 ms</b><b class="bench-num" data-stat="p95">1.65 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.94%"></i><i class="bench-bar__fill" style="width:64.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.61 ms</b><b class="bench-num" data-stat="p95">7.88 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>7.7×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.32%"></i><i class="bench-bar__fill" style="width:68.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.5 ms</b><b class="bench-num" data-stat="p95">12.6 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:87.14%"></i><i class="bench-bar__fill" style="width:83.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">95.8 ms</b><b class="bench-num" data-stat="p95">169 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>6.4×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.51%"></i><i class="bench-bar__fill" style="width:68.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">12.4 ms</b><b class="bench-num" data-stat="p95">12.9 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:85.75%"></i><i class="bench-bar__fill" style="width:81.71%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.9 ms</b><b class="bench-num" data-stat="p95">140 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>2.3×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:51.67%"></i><i class="bench-bar__fill" style="width:46.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.59 ms</b><b class="bench-num" data-stat="p95">1.26 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.82%"></i><i class="bench-bar__fill" style="width:52.34%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.38 ms</b><b class="bench-num" data-stat="p95">1.48 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>2.1×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.70%"></i><i class="bench-bar__fill" style="width:46.43%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.61 ms</b><b class="bench-num" data-stat="p95">1.45 ms</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.29%"></i><i class="bench-bar__fill" style="width:51.94%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.37 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>1,628×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.97%"></i><i class="bench-bar__fill" style="width:9.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4 µs</b><b class="bench-num" data-stat="p95">4 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.09%"></i><i class="bench-bar__fill" style="width:62.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.96 ms</b><b class="bench-num" data-stat="p95">6.10 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>1,988×</strong> faster</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:8.46%"></i><i class="bench-bar__fill" style="width:8.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">3 µs</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.43%"></i><i class="bench-bar__fill" style="width:63.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.34 ms</b><b class="bench-num" data-stat="p95">6.39 ms</b></span></div>
</div>
</section>
<section class="bench-panel bench-ruled" data-size="1000000" data-metric="memory" style="--bench-segs:4">
<div class="bench-viz__scale"><span class="bench-viz__lead">interaction</span><span class="bench-viz__axis-note">renderer heap after interaction — linear — shorter is leaner</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i><span>footprint</span><span class="bench-viz__legend-note">faded = change</span></span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">0</span><span class="bench-ruler__tick" style="left:25.00%">227.4 MB</span><span class="bench-ruler__tick" style="left:50.00%">454.7 MB</span><span class="bench-ruler__tick" style="left:75.00%">682.1 MB</span><span class="bench-ruler__tick" style="left:100.00%">909.4 MB</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.top-left">Scroll down · top left</span><span class="bench-viz__ratio"><strong>1.8×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:13.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">125.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:24.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">226.6 MB</b><b class="bench-num" data-stat="p95">6.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-down.middle">Scroll down · middle</span><span class="bench-viz__ratio"><strong>2.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.32%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">84.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:25.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">233.0 MB</b><b class="bench-num" data-stat="p95">6.3 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-smooth.same-window">Scroll smooth · same window</span><span class="bench-viz__ratio"><strong>2.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.72%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">97.5 MB</b><b class="bench-num" data-stat="p95">24.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">192.7 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scroll-right.top-left">Scroll right · top left</span><span class="bench-viz__ratio"><strong>2.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:10.31%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">93.8 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">205.2 MB</b><b class="bench-num" data-stat="p95">19.6 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.top-left">Edit open · top left</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">78.3 MB</b><b class="bench-num" data-stat="p95">3.8 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.24%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">193.1 MB</b><b class="bench-num" data-stat="p95">11.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.middle">Edit open · middle</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">79.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:21.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">197.3 MB</b><b class="bench-num" data-stat="p95">4.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-open.bottom-right">Edit open · bottom right</span><span class="bench-viz__ratio"><strong>2.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.01%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">82.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">200.6 MB</b><b class="bench-num" data-stat="p95">3.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="edit-commit.middle">Edit commit · middle</span><span class="bench-viz__ratio"><strong>2.5×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">82.5 MB</b><b class="bench-num" data-stat="p95">0.7 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:22.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">209.0 MB</b><b class="bench-num" data-stat="p95">9.2 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.insert-5-rows-top">Altering · insert 5 rows top</span><span class="bench-viz__ratio"><strong>4.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">90.7 MB</b><b class="bench-num" data-stat="p95">8.3 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:48.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">442.0 MB</b><b class="bench-num" data-stat="p95">247.4 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="altering.remove-5-rows-top">Altering · remove 5 rows top</span><span class="bench-viz__ratio"><strong>10.0×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">90.8 MB</b><b class="bench-num" data-stat="p95">6.5 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:100.00%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">909.4 MB</b><b class="bench-num" data-stat="p95">534.8 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-down.top-left">Arrow down · top left</span><span class="bench-viz__ratio"><strong>10.7×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:9.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">82.4 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:96.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">878.3 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="arrow-right.middle">Arrow right · middle</span><span class="bench-viz__ratio"><strong>5.2×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:8.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">77.0 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:44.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">402.1 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formatted-paint.top-left">Formatted paint · top left</span><span class="bench-viz__ratio"><strong>2.9×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:12.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">111.4 MB</b><b class="bench-num" data-stat="p95">33.4 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:35.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">322.6 MB</b><b class="bench-num" data-stat="p95">22.5 MB</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="merge-heavy.paint">Merge heavy · paint</span><span class="bench-viz__ratio"><strong>4.4×</strong> leaner</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">Sheetwrite</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:11.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">103.5 MB</b><b class="bench-num" data-stat="p95">0.0 MB</b></span></div>
<div class="bench-bar" data-engine="handsontable"><span class="bench-bar__engine">Handsontable</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__fill" style="width:49.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">450.9 MB</b><b class="bench-num" data-stat="p95">2.7 MB</b></span></div>
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
