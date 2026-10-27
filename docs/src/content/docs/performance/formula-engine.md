---
title: "Formula engine performance"
description: "Recalculation timings by dependency shape, and how the two engine builds compare."
---

<div class="evidence-available"><strong>Validated evidence.</strong> 53 recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-17 06:43 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="49e05e298c3f39a8cede038fe8d0062343abc21f">49e05e298c3f</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/formula-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="countif-100k">Countif 100k</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.30%"></i><i class="bench-bar__fill" style="width:61.09%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="criteria-multi-range-edit">Criteria multi range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.20%"></i><i class="bench-bar__fill" style="width:74.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.61 ms</b><b class="bench-num" data-stat="p95">5.76 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="criteria-range-edit">Criteria range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.46%"></i><i class="bench-bar__fill" style="width:64.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.65 ms</b><b class="bench-num" data-stat="p95">1.67 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="cross-sheet-range-edit">Cross sheet range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.58%"></i><i class="bench-bar__fill" style="width:54.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.52 ms</b><b class="bench-num" data-stat="p95">0.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="cycles">Cycles</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.98%"></i><i class="bench-bar__fill" style="width:63.77%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.54 ms</b><b class="bench-num" data-stat="p95">1.58 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="diamond-edit">Diamond edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:41.72%"></i><i class="bench-bar__fill" style="width:40.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.11 ms</b><b class="bench-num" data-stat="p95">0.12 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="distinct-range-edit">Distinct range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.84%"></i><i class="bench-bar__fill" style="width:22.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="error-propagation">Error propagation</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.26%"></i><i class="bench-bar__fill" style="width:58.15%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.81 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formula-constant-edit">Formula constant edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.35%"></i><i class="bench-bar__fill" style="width:29.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="incremental-dependency-closure-edit">Incremental dependency closure edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.03%"></i><i class="bench-bar__fill" style="width:26.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="independent-first-recompute">Independent first recompute</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.37%"></i><i class="bench-bar__fill" style="width:61.20%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.15 ms</b><b class="bench-num" data-stat="p95">1.17 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.76%"></i><i class="bench-bar__fill" style="width:74.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.18 ms</b><b class="bench-num" data-stat="p95">5.47 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:99.09%"></i><i class="bench-bar__fill" style="width:98.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">88.6 ms</b><b class="bench-num" data-stat="p95">90.0 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="independent-parse-load">Independent parse load</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.06%"></i><i class="bench-bar__fill" style="width:60.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.07 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:76.87%"></i><i class="bench-bar__fill" style="width:75.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">6.24 ms</b><b class="bench-num" data-stat="p95">6.98 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:96.23%"></i><i class="bench-bar__fill" style="width:95.95%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">62.8 ms</b><b class="bench-num" data-stat="p95">64.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="iterative-finance">Iterative finance</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.73%"></i><i class="bench-bar__fill" style="width:71.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.72 ms</b><b class="bench-num" data-stat="p95">3.86 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="let-repeat">Let repeat</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:66.09%"></i><i class="bench-bar__fill" style="width:65.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.97 ms</b><b class="bench-num" data-stat="p95">2.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="let-reuse-edit">Let reuse edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:56.68%"></i><i class="bench-bar__fill" style="width:56.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.67 ms</b><b class="bench-num" data-stat="p95">0.68 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="linear-chain">Linear chain</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">8 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.79%"></i><i class="bench-bar__fill" style="width:24.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">16 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.42%"></i><i class="bench-bar__fill" style="width:28.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:33.97%"></i><i class="bench-bar__fill" style="width:33.47%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.05 ms</b><b class="bench-num" data-stat="p95">0.05 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">64 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:38.82%"></i><i class="bench-bar__fill" style="width:37.98%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.08 ms</b><b class="bench-num" data-stat="p95">0.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="lookup-range-edit">Lookup range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.09%"></i><i class="bench-bar__fill" style="width:64.63%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.70 ms</b><b class="bench-num" data-stat="p95">1.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="percentile-covariance">Percentile covariance</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.58%"></i><i class="bench-bar__fill" style="width:71.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.71 ms</b><b class="bench-num" data-stat="p95">3.80 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="removed-sheet-ref">Removed sheet ref</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:57.87%"></i><i class="bench-bar__fill" style="width:53.93%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.50 ms</b><b class="bench-num" data-stat="p95">0.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="shared-range-edit">Shared range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:55.44%"></i><i class="bench-bar__fill" style="width:54.88%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.55 ms</b><b class="bench-num" data-stat="p95">0.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="spill-filter-resize">Spill filter resize</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:88.39%"></i><i class="bench-bar__fill" style="width:88.05%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">25.3 ms</b><b class="bench-num" data-stat="p95">26.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="spill-sequence-admission">Spill sequence admission</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.68%"></i><i class="bench-bar__fill" style="width:82.51%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">13.4 ms</b><b class="bench-num" data-stat="p95">13.6 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sum-multi-range">Sum multi range</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:73.93%"></i><i class="bench-bar__fill" style="width:72.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.45 ms</b><b class="bench-num" data-stat="p95">4.97 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumifs-3-criteria">Sumifs 3 criteria</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:77.99%"></i><i class="bench-bar__fill" style="width:77.61%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">7.59 ms</b><b class="bench-num" data-stat="p95">7.94 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumproduct-matrix-edit">Sumproduct matrix edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.89%"></i><i class="bench-bar__fill" style="width:65.78%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.95 ms</b><b class="bench-num" data-stat="p95">1.97 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumproduct-vector-edit">Sumproduct vector edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.00%"></i><i class="bench-bar__fill" style="width:66.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.11 ms</b><b class="bench-num" data-stat="p95">2.24 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many">Text lookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.25%"></i><i class="bench-bar__fill" style="width:67.70%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.43 ms</b><b class="bench-num" data-stat="p95">4.09 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-edit">Text lookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:67.55%"></i><i class="bench-bar__fill" style="width:67.08%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.26 ms</b><b class="bench-num" data-stat="p95">2.39 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-sorted">Text lookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.78%"></i><i class="bench-bar__fill" style="width:71.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.83 ms</b><b class="bench-num" data-stat="p95">3.88 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-sorted-edit">Text lookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.56%"></i><i class="bench-bar__fill" style="width:71.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.71 ms</b><b class="bench-num" data-stat="p95">3.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="topology-remove-add">Topology remove add</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:79.73%"></i><i class="bench-bar__fill" style="width:79.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">9.50 ms</b><b class="bench-num" data-stat="p95">9.70 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="unicode-text-date-edit">Unicode text date edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.28%"></i><i class="bench-bar__fill" style="width:61.38%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.17 ms</b><b class="bench-num" data-stat="p95">1.30 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many">Vlookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.62%"></i><i class="bench-bar__fill" style="width:62.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.28 ms</b><b class="bench-num" data-stat="p95">1.35 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-edit">Vlookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.30%"></i><i class="bench-bar__fill" style="width:61.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.13 ms</b><b class="bench-num" data-stat="p95">1.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-sorted">Vlookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.38%"></i><i class="bench-bar__fill" style="width:64.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.65 ms</b><b class="bench-num" data-stat="p95">1.66 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-sorted-edit">Vlookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:63.74%"></i><i class="bench-bar__fill" style="width:63.66%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.52 ms</b><b class="bench-num" data-stat="p95">1.54 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="wide-fan-out-edit">Wide fan out edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:52.09%"></i><i class="bench-bar__fill" style="width:51.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.38 ms</b><b class="bench-num" data-stat="p95">0.40 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:95.86%"></i><i class="bench-bar__fill" style="width:95.62%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">60.4 ms</b><b class="bench-num" data-stat="p95">62.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many">Xlookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.48%"></i><i class="bench-bar__fill" style="width:62.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.28 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-edit">Xlookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:61.61%"></i><i class="bench-bar__fill" style="width:61.12%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.14 ms</b><b class="bench-num" data-stat="p95">1.20 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-sorted">Xlookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.91%"></i><i class="bench-bar__fill" style="width:65.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.83 ms</b><b class="bench-num" data-stat="p95">1.98 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-sorted-edit">Xlookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.02%"></i><i class="bench-bar__fill" style="width:64.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.76 ms</b><b class="bench-num" data-stat="p95">1.78 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scalar-edit-affects">Scalar edit affects</span></div>
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

### Choose a formula engine

Shared functions use the same implementation in both builds. Choose by function coverage and download size, not small timing differences.

<div class="sw-engine-choices">
<div class="sw-engine-choice"><span>Default engine</span><h4><code>@sheetwrite/wasm</code></h4><p>Core spreadsheet functions, with the smaller download.</p><strong>250.1 KiB</strong><small>Brotli WASM · 856.4 KiB uncompressed</small></div>
<div class="sw-engine-choice"><span>Full engine</span><h4><code>@sheetwrite/formulas</code></h4><p>Default functions, plus statistics, finance, LAMBDA, grouping, and other analysis functions.</p><strong>336.2 KiB</strong><small>Brotli WASM · 1.1 MiB uncompressed</small></div>
</div>

[Browse functions by engine](/docs/reference/formula-functions/) · [Use the full engine](/docs/features/formulas/analysis-formulas/)

<details class="bench-all"><summary>All measurements</summary>

#### Analysis workloads

Each workload has 1,000 formulas. It has one untimed warmup and five measured samples. Each sample uses a fresh store. The timer measures first recompute. Setup and output reads are outside the timer. Every result is read and summed as a checked checksum. The default engine does not run these analysis functions.

LINEST, SORTBY, and MAP/REDUCE use 100 input rows. DSUM uses 100 database rows, a header, and the criterion `key > 0`. XIRR uses two cash flows one year apart. The text workload uses three fields. MODE.MULT uses five scalar inputs. MMULT uses two 2-by-2 matrices. Array outputs are reduced to scalar results.

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:2">
<div class="bench-viz__scale"><span class="bench-viz__lead">analysis workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 ms</span><span class="bench-ruler__tick" style="left:50.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="linest">Linest</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:44.32%"></i><i class="bench-bar__fill" style="width:33.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.66 ms</b><b class="bench-num" data-stat="p95">7.70 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xirr">Xirr</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:10.26%"></i><i class="bench-bar__fill" style="width:9.35%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.54 ms</b><b class="bench-num" data-stat="p95">1.60 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="dsum">Dsum</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.93%"></i><i class="bench-bar__fill" style="width:23.68%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.98 ms</b><b class="bench-num" data-stat="p95">4.16 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="textsplit-regexreplace">Textsplit regexreplace</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.62%"></i><i class="bench-bar__fill" style="width:24.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.07 ms</b><b class="bench-num" data-stat="p95">3.25 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sortby">Sortby</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:42.95%"></i><i class="bench-bar__fill" style="width:27.14%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.49 ms</b><b class="bench-num" data-stat="p95">7.23 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="mode-mult">Mode mult</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:5.89%"></i><i class="bench-bar__fill" style="width:0.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.03 ms</b><b class="bench-num" data-stat="p95">1.31 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="map-reduce">Map reduce</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.52%"></i><i class="bench-bar__fill" style="width:71.36%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">26.7 ms</b><b class="bench-num" data-stat="p95">26.9 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="mmult">Mmult</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:7.81%"></i><i class="bench-bar__fill" style="width:6.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.36 ms</b><b class="bench-num" data-stat="p95">1.43 ms</b></span></div>
</div>
</figure>

Brotli size uses quality 11 on the WASM file only. It is not the full package transfer size. The raw artifacts retain cold-initialization samples; those samples do not establish that one engine initializes faster.

Raw evidence: `bench/results/full-engine-matched-results.json` and `bench/results/full-engine-results.json`. They retain time samples, output checks, allocation samples, source hashes, and WASM hashes. The full workload captures are `bench/results/formula-default-results.json` and `bench/results/formula-full-results.json`. Their baseline gates stay blocked in output mode. A valid capture is not a passed timing regression gate.

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Analysis capture</dt><dd>2026-10-17 06:44 UTC</dd></div>
<div><dt>Analysis commit</dt><dd><code title="49e05e298c3f39a8cede038fe8d0062343abc21f">49e05e298c3f</code> clean worktree</dd></div>
</dl>

Shared-workload captures are validation data, not evidence that one package is faster.

</details>

Reproduce after `bun run build:packages`:

```sh verify title="Default and full engine evidence"
cd bench
bun run bench:formula:engines
bun run bench:formula:matched
```
