---
title: "Formula engine performance"
description: "Recalculation timings by dependency shape, and how the two engine builds compare."
---

<div class="evidence-available"><strong>Validated evidence.</strong> 53 recalculation workloads across dependency shapes; every workload passed the protocol's safety ceilings.</div>

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-29 04:24 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/formula-results.json</code></dd></div>
</dl>

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:5">
<div class="bench-viz__scale"><span class="bench-viz__lead">workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">1 µs</span><span class="bench-ruler__tick" style="left:20.00%">10 µs</span><span class="bench-ruler__tick" style="left:40.00%">100 µs</span><span class="bench-ruler__tick" style="left:60.00%">1 ms</span><span class="bench-ruler__tick" style="left:80.00%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="countif-100k">Countif 100k</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.16%"></i><i class="bench-bar__fill" style="width:58.82%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.87 ms</b><b class="bench-num" data-stat="p95">0.91 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="criteria-multi-range-edit">Criteria multi range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:72.69%"></i><i class="bench-bar__fill" style="width:72.57%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.25 ms</b><b class="bench-num" data-stat="p95">4.31 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="criteria-range-edit">Criteria range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.81%"></i><i class="bench-bar__fill" style="width:64.50%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.68 ms</b><b class="bench-num" data-stat="p95">1.74 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="cross-sheet-range-edit">Cross sheet range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.31%"></i><i class="bench-bar__fill" style="width:47.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.25 ms</b><b class="bench-num" data-stat="p95">0.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="cycles">Cycles</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.16%"></i><i class="bench-bar__fill" style="width:53.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.50 ms</b><b class="bench-num" data-stat="p95">0.51 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="diamond-edit">Diamond edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:35.56%"></i><i class="bench-bar__fill" style="width:32.21%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.04 ms</b><b class="bench-num" data-stat="p95">0.06 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="distinct-range-edit">Distinct range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:25.17%"></i><i class="bench-bar__fill" style="width:20.96%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.01 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="error-propagation">Error propagation</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.29%"></i><i class="bench-bar__fill" style="width:48.03%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.25 ms</b><b class="bench-num" data-stat="p95">0.26 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="formula-constant-edit">Formula constant edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.98%"></i><i class="bench-bar__fill" style="width:29.64%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="incremental-dependency-closure-edit">Incremental dependency closure edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:28.31%"></i><i class="bench-bar__fill" style="width:26.30%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="independent-first-recompute">Independent first recompute</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:53.36%"></i><i class="bench-bar__fill" style="width:53.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.45 ms</b><b class="bench-num" data-stat="p95">0.47 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:69.02%"></i><i class="bench-bar__fill" style="width:68.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.71 ms</b><b class="bench-num" data-stat="p95">2.82 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:92.31%"></i><i class="bench-bar__fill" style="width:91.92%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">39.5 ms</b><b class="bench-num" data-stat="p95">41.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="independent-parse-load">Independent parse load</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.44%"></i><i class="bench-bar__fill" style="width:59.91%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.99 ms</b><b class="bench-num" data-stat="p95">1.32 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.71%"></i><i class="bench-bar__fill" style="width:75.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.97 ms</b><b class="bench-num" data-stat="p95">8.62 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:94.53%"></i><i class="bench-bar__fill" style="width:94.49%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">53.0 ms</b><b class="bench-num" data-stat="p95">53.3 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="iterative-finance">Iterative finance</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:69.33%"></i><i class="bench-bar__fill" style="width:69.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.85 ms</b><b class="bench-num" data-stat="p95">2.93 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="let-repeat">Let repeat</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.68%"></i><i class="bench-bar__fill" style="width:64.65%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.71 ms</b><b class="bench-num" data-stat="p95">1.71 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="let-reuse-edit">Let reuse edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.13%"></i><i class="bench-bar__fill" style="width:53.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.50 ms</b><b class="bench-num" data-stat="p95">0.51 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="linear-chain">Linear chain</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">8 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.05%"></i><i class="bench-bar__fill" style="width:25.27%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">16 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:24.96%"></i><i class="bench-bar__fill" style="width:23.84%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.02 ms</b><b class="bench-num" data-stat="p95">0.02 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">32 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:29.61%"></i><i class="bench-bar__fill" style="width:29.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.03 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">64 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:31.22%"></i><i class="bench-bar__fill" style="width:30.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.03 ms</b><b class="bench-num" data-stat="p95">0.04 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="lookup-range-edit">Lookup range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.05%"></i><i class="bench-bar__fill" style="width:64.74%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.73 ms</b><b class="bench-num" data-stat="p95">1.79 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="percentile-covariance">Percentile covariance</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:69.83%"></i><i class="bench-bar__fill" style="width:69.10%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.85 ms</b><b class="bench-num" data-stat="p95">3.10 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="removed-sheet-ref">Removed sheet ref</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.57%"></i><i class="bench-bar__fill" style="width:46.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.21 ms</b><b class="bench-num" data-stat="p95">0.34 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="shared-range-edit">Shared range edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:49.89%"></i><i class="bench-bar__fill" style="width:49.02%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.28 ms</b><b class="bench-num" data-stat="p95">0.31 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="spill-filter-resize">Spill filter resize</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:82.59%"></i><i class="bench-bar__fill" style="width:81.44%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">11.8 ms</b><b class="bench-num" data-stat="p95">13.5 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="spill-sequence-admission">Spill sequence admission</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:74.44%"></i><i class="bench-bar__fill" style="width:72.83%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">4.38 ms</b><b class="bench-num" data-stat="p95">5.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sum-multi-range">Sum multi range</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:71.89%"></i><i class="bench-bar__fill" style="width:71.58%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.79 ms</b><b class="bench-num" data-stat="p95">3.93 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumifs-3-criteria">Sumifs 3 criteria</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.46%"></i><i class="bench-bar__fill" style="width:75.25%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.79 ms</b><b class="bench-num" data-stat="p95">5.93 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumproduct-matrix-edit">Sumproduct matrix edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.00%"></i><i class="bench-bar__fill" style="width:63.75%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.54 ms</b><b class="bench-num" data-stat="p95">1.59 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sumproduct-vector-edit">Sumproduct vector edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:66.45%"></i><i class="bench-bar__fill" style="width:63.90%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.57 ms</b><b class="bench-num" data-stat="p95">2.10 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many">Text lookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:68.85%"></i><i class="bench-bar__fill" style="width:66.97%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.23 ms</b><b class="bench-num" data-stat="p95">2.77 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-edit">Text lookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:64.49%"></i><i class="bench-bar__fill" style="width:64.19%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.62 ms</b><b class="bench-num" data-stat="p95">1.68 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-sorted">Text lookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:70.70%"></i><i class="bench-bar__fill" style="width:70.55%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.37 ms</b><b class="bench-num" data-stat="p95">3.43 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="text-lookup-many-sorted-edit">Text lookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:70.66%"></i><i class="bench-bar__fill" style="width:69.99%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.16 ms</b><b class="bench-num" data-stat="p95">3.41 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="topology-remove-add">Topology remove add</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">10,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:75.43%"></i><i class="bench-bar__fill" style="width:74.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">5.42 ms</b><b class="bench-num" data-stat="p95">5.91 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="unicode-text-date-edit">Unicode text date edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.75%"></i><i class="bench-bar__fill" style="width:57.85%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.78 ms</b><b class="bench-num" data-stat="p95">0.87 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many">Vlookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:60.51%"></i><i class="bench-bar__fill" style="width:59.60%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.96 ms</b><b class="bench-num" data-stat="p95">1.06 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-edit">Vlookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.78%"></i><i class="bench-bar__fill" style="width:58.69%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.86 ms</b><b class="bench-num" data-stat="p95">0.87 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-sorted">Vlookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.42%"></i><i class="bench-bar__fill" style="width:62.37%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.31 ms</b><b class="bench-num" data-stat="p95">1.32 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="vlookup-many-sorted-edit">Vlookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.10%"></i><i class="bench-bar__fill" style="width:61.81%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.23 ms</b><b class="bench-num" data-stat="p95">1.27 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="wide-fan-out-edit">Wide fan out edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:43.91%"></i><i class="bench-bar__fill" style="width:43.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.14 ms</b><b class="bench-num" data-stat="p95">0.16 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:87.15%"></i><i class="bench-bar__fill" style="width:86.86%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.0 ms</b><b class="bench-num" data-stat="p95">22.8 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many">Xlookup many</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.46%"></i><i class="bench-bar__fill" style="width:59.42%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.94 ms</b><b class="bench-num" data-stat="p95">0.94 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-edit">Xlookup many edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:58.65%"></i><i class="bench-bar__fill" style="width:58.39%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.83 ms</b><b class="bench-num" data-stat="p95">0.86 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-sorted">Xlookup many sorted</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:62.61%"></i><i class="bench-bar__fill" style="width:62.41%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.32 ms</b><b class="bench-num" data-stat="p95">1.35 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xlookup-many-sorted-edit">Xlookup many sorted edit</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 cells</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:65.04%"></i><i class="bench-bar__fill" style="width:61.52%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">1.19 ms</b><b class="bench-num" data-stat="p95">1.79 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="scalar-edit-affects">Scalar edit affects</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">0 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:9.07%"></i><i class="bench-bar__fill" style="width:8.22%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">3 µs</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:20.43%"></i><i class="bench-bar__fill" style="width:10.48%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3 µs</b><b class="bench-num" data-stat="p95">0.01 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:45.35%"></i><i class="bench-bar__fill" style="width:44.40%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.17 ms</b><b class="bench-num" data-stat="p95">0.19 ms</b></span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">100,000 affected</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:86.90%"></i><i class="bench-bar__fill" style="width:86.73%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">21.7 ms</b><b class="bench-num" data-stat="p95">22.1 ms</b></span></div>
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

## Choose a formula engine

Shared functions use the same implementation in both builds. Choose by function coverage and download size, not small timing differences.

<div class="sw-engine-choices">
<div class="sw-engine-choice"><span>Default engine</span><h3><code>@sheetwrite/wasm</code></h3><p>Core spreadsheet functions, with the smaller download.</p><strong>290.7 KiB</strong><small>Brotli WASM · 991.6 KiB uncompressed</small></div>
<div class="sw-engine-choice"><span>Full engine</span><h3><code>@sheetwrite/formulas</code></h3><p>Default functions, plus statistics, finance, LAMBDA, grouping, and other analysis functions.</p><strong>409.8 KiB</strong><small>Brotli WASM · 1.3 MiB uncompressed</small></div>
</div>

[Browse functions by engine](/docs/reference/formula-functions/) · [Use the full engine](/docs/features/formulas/analysis-formulas/)

<details class="bench-all"><summary>All measurements</summary>

### Analysis workloads

Each workload has 1,000 formulas. It has one untimed warmup and five measured samples. Each sample uses a fresh store. The timer measures first recompute. Setup and output reads are outside the timer. Every result is read and summed as a checked checksum. The default engine does not run these analysis functions.

LINEST, SORTBY, and MAP/REDUCE use 100 input rows. DSUM uses 100 database rows, a header, and the criterion `key > 0`. XIRR uses two cash flows one year apart. The text workload uses three fields. MODE.MULT uses five scalar inputs. MMULT uses two 2-by-2 matrices. Array outputs are reduced to scalar results.

<figure class="bench-viz bench-ruled" data-pagefind-ignore style="--bench-segs:3">
<div class="bench-viz__scale"><span class="bench-viz__lead">analysis workload</span><span class="bench-viz__axis-note">log scale — every tick is 10× — shorter is faster</span><span class="bench-viz__legend"><i class="bench-legend-swatch" data-kind="median"></i>median<i class="bench-legend-swatch" data-kind="p95"></i>p95</span></div>
<div class="bench-bar bench-bar--ruler" aria-hidden="true"><span class="bench-bar__engine"></span><span class="bench-bar__track"><span class="bench-ruler__tick" style="left:0.00%">100 µs</span><span class="bench-ruler__tick" style="left:33.33%">1 ms</span><span class="bench-ruler__tick" style="left:66.67%">10 ms</span><span class="bench-ruler__tick" style="left:100.00%">100 ms</span></span><span class="bench-bar__value"></span></div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="linest">Linest</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:59.26%"></i><i class="bench-bar__fill" style="width:52.67%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.80 ms</b><b class="bench-num" data-stat="p95">6.00 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="xirr">Xirr</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:37.45%"></i><i class="bench-bar__fill" style="width:32.06%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.92 ms</b><b class="bench-num" data-stat="p95">1.33 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="dsum">Dsum</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:50.07%"></i><i class="bench-bar__fill" style="width:49.04%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.96 ms</b><b class="bench-num" data-stat="p95">3.18 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="textsplit-regexreplace">Textsplit regexreplace</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:48.44%"></i><i class="bench-bar__fill" style="width:48.07%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">2.77 ms</b><b class="bench-num" data-stat="p95">2.84 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="sortby">Sortby</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:54.80%"></i><i class="bench-bar__fill" style="width:51.28%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">3.46 ms</b><b class="bench-num" data-stat="p95">4.40 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="mode-mult">Mode mult</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:30.81%"></i><i class="bench-bar__fill" style="width:30.26%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.81 ms</b><b class="bench-num" data-stat="p95">0.84 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="map-reduce">Map reduce</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:78.79%"></i><i class="bench-bar__fill" style="width:78.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">22.6 ms</b><b class="bench-num" data-stat="p95">23.1 ms</b></span></div>
</div>
<div class="bench-viz__row" data-outcome="faster">
<div class="bench-viz__head"><span class="bench-viz__label" title="mmult">Mmult</span></div>
<div class="bench-bar" data-engine="sheetwrite"><span class="bench-bar__engine">1,000 formulas</span><span class="bench-bar__track" aria-hidden="true"><i class="bench-bar__spread" style="width:32.19%"></i><i class="bench-bar__fill" style="width:30.45%"></i></span><span class="bench-bar__value"><b class="bench-num" data-stat="median">0.82 ms</b><b class="bench-num" data-stat="p95">0.92 ms</b></span></div>
</div>
</figure>

Brotli size uses quality 11 on the WASM file only. It is not the full package transfer size. The raw artifacts retain cold-initialization samples; those samples do not establish that one engine initializes faster.

Raw evidence: `bench/results/full-engine-matched-results.json` and `bench/results/full-engine-results.json`. They retain time samples, output checks, allocation samples, source hashes, and WASM hashes. The full workload captures are `bench/results/formula-default-results.json` and `bench/results/formula-full-results.json`. Their baseline gates stay blocked in output mode. A valid capture is not a passed timing regression gate.

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Analysis capture</dt><dd>2026-10-29 04:24 UTC</dd></div>
<div><dt>Analysis commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
</dl>

Shared-workload captures are validation data, not evidence that one package is faster.

</details>

Reproduce after `bun run build:packages`:

```sh verify title="Default and full engine evidence"
cd bench
bun run bench:formula:engines
bun run bench:formula:matched
```
