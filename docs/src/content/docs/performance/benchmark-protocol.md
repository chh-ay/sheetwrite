---
title: "Benchmark protocol"
description: "How the evidence is captured, and how to check a change for a timing regression."
---

## Release comparison

### Sheetwrite 0.6.0 compared with a fresh 0.5.4 capture

**16 rows exceed their suite's recorded limit or noise test.** They are listed first, not removed or normalized against a control. The complete median/p95 and ratio tables follow. A descriptive comparison flag is not itself a controlled gate verdict; rows without a documented threshold are labeled slower or faster rather than assigned an invented noise limit.

| Artifact and metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio |
| --- | ---: | ---: | ---: | ---: |
| <code>formula-results.json · workloads[id=independent-parse-load;size=10000].stat</code> | 6.0613 / 6.4264 ms | 5.9725 / 8.6217 ms | 0.985× | 1.342× |
| <code>formula-default-results.json · workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1992 / 3.2919 ms | 4.0162 / 4.4550 ms | 1.255× | 1.353× |
| <code>formula-full-results.json · workloads[id=independent-parse-load;size=1000].stat</code> | 0.82593 / 0.95638 ms | 1.2095 / 1.5702 ms | 1.464× | 1.642× |
| <code>formula-full-results.json · workloads[id=text-lookup-many;size=1000].stat</code> | 2.1185 / 2.1745 ms | 2.4491 / 3.2150 ms | 1.156× | 1.478× |
| <code>full-engine-results.json · engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1992 / 3.2919 ms | 4.0162 / 4.4550 ms | 1.255× | 1.353× |
| <code>full-engine-results.json · engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].stat</code> | 0.82593 / 0.95638 ms | 1.2095 / 1.5702 ms | 1.464× | 1.642× |
| <code>full-engine-results.json · engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].stat</code> | 2.1185 / 2.1745 ms | 2.4491 / 3.2150 ms | 1.156× | 1.478× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=altering.insert-5-rows-top]</code> | 14.507 / 21.209 ms | 17.300 / 18.783 ms | 1.193× | 0.886× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=altering.remove-5-rows-top]</code> | 12.537 / 15.526 ms | 15.014 / 15.837 ms | 1.198× | 1.020× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=edit-commit.middle]</code> | 4.9548 / 5.5202 ms | 7.8038 / 8.1758 ms | 1.575× | 1.481× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=formatted-paint.top-left]</code> | 3.3633 / 3.7223 ms | 6.1382 / 7.6481 ms | 1.825× | 2.055× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=merge-heavy.paint]</code> | 3.4845 / 3.7624 ms | 6.3688 / 6.5422 ms | 1.828× | 1.739× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=scroll-down.middle]</code> | 4.0022 / 4.9782 ms | 6.8600 / 9.8560 ms | 1.714× | 1.980× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=scroll-down.top-left]</code> | 15.764 / 16.022 ms | 21.340 / 21.891 ms | 1.354× | 1.366× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=scroll-right.top-left]</code> | 10.550 / 10.685 ms | 16.414 / 17.760 ms | 1.556× | 1.662× |
| <code>render-baseline.json · cells[key=engine=handsontable;rows=100000;scenario=scroll-smooth.same-window]</code> | 7.7231 / 8.3319 ms | 10.530 / 11.310 ms | 1.363× | 1.357× |

### Capture conditions

Both releases were captured on the same machine and toolchain, one suite at a time, each in its own scope with a 8G memory cap. The parent slice's memory-high counter must stay unchanged during a suite. Each suite uses the same effective CPU mask on both sides; the comparison refuses a mismatch.

| Suite | Effective CPU mask |
| --- | --- |
| <code>chart-tracking</code> | 4 |
| <code>core-paths</code> | 4 |
| <code>data</code> | 4 |
| <code>formula</code> | 0-19 |
| <code>formula-engines</code> | 0-19 |
| <code>formula-matched</code> | 0-19 |
| <code>interaction</code> | 4 |
| <code>paged</code> | 4 |
| <code>pivot</code> | 4 |
| <code>regression-baseline</code> | 4 |
| <code>render-scale</code> | 4 |
| <code>xlsx</code> | 4 |

For data captures, a full garbage collection runs between samples, untimed. Each ingest sample also gets a fresh happy-dom document after the prior sample has released its store or grid. Both versions use data protocol v2. Mixed protocol versions are rejected.

Formula tables compare the 0.5.4 engine (WASM) under the 0.6 core and harness with the 0.6 engine under that same core and harness. They isolate the engine difference only. The source records both commits and the hashes of the loaded binaries. Grid constant edits and Node initialization time current-core paths, so those measurements are 0.6-only and have no version ratio. A workload absent from the older engine is marked not in 0.5.4.

New in 0.6, with no 0.5.4 comparison: <code>chart-tracking-results.json</code>, <code>pivot-results.json</code>.

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Comparison generated</dt><dd>2026-10-30 03:44 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>CPU</dt><dd>12th Gen Intel(R) Core(TM) i9-12900H</dd></div>
<div><dt>Machine</dt><dd>hypr-zephyrus</dd></div>
<div><dt>Capture memory cap</dt><dd>8G</dd></div>
<div><dt>Bun</dt><dd>1.4.4</dd></div>
<div><dt>Node executable</dt><dd>v26.12.1</dd></div>
<div><dt>npm</dt><dd>11.19.1</dd></div>
<div><dt>Kernel</dt><dd>7.3.0-4-cachyos</dd></div>
<div><dt>Raw artifact</dt><dd><code>bench/results/release-comparison.json</code></dd></div>
</dl>

Comparison base: <code>release/version-0.5.4</code> at <code title="dcfb2037cc340451cf68bc4369e419c9adb13b3f">dcfb2037cc34</code>. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code>. Ratios are candidate / 0.5.4: below 1 is lower; above 1 is higher. Median and p95 retain the artifact's units. New-only and removed measurements are not ratios.

### Reading the flags

Each flag compares one 0.6.0 capture with one fresh 0.5.4 capture of the same suite. A flag means that pair exceeded the suite's documented budget; it is not a controlled confirmation of a regression.

All nine `render-baseline.json` flags are Handsontable rows. Handsontable is the comparison control and is version 18.1.2 on both sides, so these flags reflect variation between the two capture sessions, not a Sheetwrite change. The cause is not isolated, and the rows are not normalized or suppressed. They also indicate how much render timing can move between sessions on this machine.

The aggregate `full-engine-results.json` table repeats three flags from the default and full formula tables. They are the same measurements, not independent replications.

### Formula flags re-measured

Four distinct formula rows are flagged: 10k parse-load p95, default-engine sorted text lookup, full-engine 1k parse-load and full-engine text lookup. Each was re-measured with the frozen harness's own workload factories, running every preceding workload in its original order, in 20 fresh processes per side: 10 interleaved ABBA blocks, 100 timed samples per row and side, on the full CPU mask.

Paired ratios, 0.6 / 0.5.4, with 99% block-bootstrap intervals: 10k parse-load median 0.987 [0.934, 1.041], p95 1.004 [0.940, 1.066]; full-engine 1k parse-load median 0.997 [0.927, 1.079], p95 1.039 [0.973, 1.118]; default-engine sorted text lookup median 1.044 [1.015, 1.077], p95 1.000 [0.883, 1.094]; full-engine text lookup median 1.128 [1.094, 1.170], p95 1.142 [1.086, 1.222].

The two parse-load flags did not reproduce. Text lookup is slower in 0.6: about 4% with the default engine and about 13% with the full engine. Both are within the 25% release budget, but they are real costs. Data: `bench/results/capture-attempts/formula-prefix-summary.json`, raw samples in `formula-prefix-10.json.gz`.

The separate paired formula gate passed all 52 rows at 8ac21089, using engine binaries that match ac4ab632 by SHA-256. Log: `bench/results/capture-attempts/formula-paired-gate.log`.

### Formula CPU affinity

Formula suites run on the full logical CPU mask on an otherwise quiet machine, as the 0.4.0 and 0.5.0 captures did. Earlier 0.6.0 attempts pinned the process to one CPU, then to two. Both starve JavaScriptCore's background WebAssembly compiler, which then competes with the timed work.

On one CPU, the 1k parse-load row split into fast and slow groups for both engines and failed the absolute gate twice. On two CPUs, XIRR after LINEST looked 44% slower; the same worker on the full mask measured 0.6 faster, with a paired ratio of 0.728 [0.651, 0.797]. These superseded captures and failed receipts remain under `bench/results/capture-attempts/` as diagnostics and are not mixed into these tables. No engine change, delay, JIT flag or relaxed budget was used.

These suites run in Bun, which uses JavaScriptCore. Most browsers running Sheetwrite use V8, whose WebAssembly compilation tiers differ, so cold-compilation effects measured here may not carry over to Chrome.

### Evidence handling

Capture receipts record command arguments without this machine's directories: a path inside the repository is repository-relative, and any other path keeps only its last segment under `&lt;external&gt;`. Four receipts captured before that rule had their arguments rewritten the same way; nothing else in them changed.

The 0.5.4 plain-formula baseline was captured a second time with a repository-relative output path, because the first capture wrote this machine's path into the result file. The replaced capture is kept as `capture-attempts/formula-before-portability-baseline.json.gz`, with machine directory prefixes replaced by placeholders.

The 0.6.0 captures ran on commit ac4ab632, which is not published because its tree holds receipts written before the argument rule above. Its packages are byte-identical to the 0.6.0 packages in this release; it differs only in benchmark tooling and results. The 0.5.4 baseline ran on dcfb2037, the 0.5.4 release branch before it was squash-merged; its packages are byte-identical to the published 0.5.4 release, 37fed9c7 on develop.

The 0.6.0 candidate is the release stack before its version bump, so raw package-version strings can still read 0.5.4; commits and loaded binary hashes identify the engines. Older committed 0.5.x results are history only, not comparison inputs.

### render-scale.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 16:36 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:15 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>results[engine=handsontable;rows=1000000;scenarioId=altering.insert-5-rows-top]</code> | 91.725 / 175.10 ms | 95.175 / 164.63 ms | 1.038× | 0.940× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=altering.remove-5-rows-top]</code> | 76.775 / 81.140 ms | 79.650 / 123.58 ms | 1.037× | 1.523× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=arrow-down.top-left]</code> | 1.3091 / 1.3813 ms | 1.3760 / 1.4691 ms | 1.051× | 1.064× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=arrow-right.middle]</code> | 1.2133 / 1.2941 ms | 1.3052 / 1.3646 ms | 1.076× | 1.054× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=edit-commit.middle]</code> | 4.6409 / 4.7958 ms | 7.5893 / 7.8760 ms | 1.635× | 1.642× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=edit-open.bottom-right]</code> | 1.3144 / 1.3741 ms | 1.4407 / 1.7114 ms | 1.096× | 1.245× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=edit-open.middle]</code> | 1.0101 / 2.3324 ms | 1.0330 / 1.0807 ms | 1.023× | 0.463× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=edit-open.top-left]</code> | 0.97961 / 1.0149 ms | 1.0213 / 1.0918 ms | 1.043× | 1.076× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=formatted-paint.top-left]</code> | 3.1531 / 3.2203 ms | 5.9529 / 6.0953 ms | 1.888× | 1.893× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=merge-heavy.paint]</code> | 3.3967 / 3.6234 ms | 6.2836 / 6.3375 ms | 1.850× | 1.749× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=scroll-down.middle]</code> | 3.9327 / 6.7246 ms | 6.7500 / 7.2617 ms | 1.716× | 1.080× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=scroll-down.top-left]</code> | 14.379 / 14.879 ms | 20.300 / 20.976 ms | 1.412× | 1.410× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=scroll-right.top-left]</code> | 10.310 / 10.527 ms | 15.979 / 16.613 ms | 1.550× | 1.578× | slower |
| <code>results[engine=handsontable;rows=1000000;scenarioId=scroll-smooth.same-window]</code> | 7.3607 / 7.6947 ms | 10.280 / 10.538 ms | 1.397× | 1.370× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=altering.insert-5-rows-top]</code> | 13.194 / 18.210 ms | 15.936 / 19.589 ms | 1.208× | 1.076× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=altering.remove-5-rows-top]</code> | 11.544 / 12.007 ms | 14.736 / 15.256 ms | 1.276× | 1.271× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=arrow-down.top-left]</code> | 1.3164 / 1.8507 ms | 1.4021 / 1.7457 ms | 1.065× | 0.943× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=arrow-right.middle]</code> | 1.2383 / 1.3175 ms | 1.3091 / 1.4287 ms | 1.057× | 1.084× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-commit.middle]</code> | 4.6250 / 5.4622 ms | 7.6000 / 7.8588 ms | 1.643× | 1.439× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.bottom-right]</code> | 1.3203 / 1.6231 ms | 1.4299 / 1.7616 ms | 1.083× | 1.085× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.middle]</code> | 0.96223 / 1.2352 ms | 1.0308 / 1.2648 ms | 1.071× | 1.024× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.top-left]</code> | 0.98146 / 1.1588 ms | 1.0490 / 1.1805 ms | 1.069× | 1.019× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=formatted-paint.top-left]</code> | 3.2094 / 3.7108 ms | 6.0265 / 6.5422 ms | 1.878× | 1.763× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=merge-heavy.paint]</code> | 3.3800 / 3.5747 ms | 6.2460 / 6.5381 ms | 1.848× | 1.829× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-down.middle]</code> | 4.0520 / 4.6739 ms | 6.8533 / 7.7670 ms | 1.691× | 1.662× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-down.top-left]</code> | 14.571 / 15.001 ms | 20.440 / 20.890 ms | 1.403× | 1.393× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-right.top-left]</code> | 10.185 / 10.407 ms | 15.943 / 16.862 ms | 1.565× | 1.620× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-smooth.same-window]</code> | 7.3214 / 7.6579 ms | 10.235 / 10.466 ms | 1.398× | 1.367× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=altering.insert-5-rows-top]</code> | 5.9500 / 6.7887 ms | 8.9750 / 10.349 ms | 1.508× | 1.524× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=altering.remove-5-rows-top]</code> | 5.6667 / 6.6958 ms | 8.6917 / 10.147 ms | 1.534× | 1.515× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=arrow-down.top-left]</code> | 1.3071 / 1.7400 ms | 1.4554 / 1.8296 ms | 1.113× | 1.052× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=arrow-right.middle]</code> | 1.2238 / 1.5675 ms | 1.2994 / 1.8412 ms | 1.062× | 1.175× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=edit-commit.middle]</code> | 4.5909 / 5.1618 ms | 7.5286 / 7.9500 ms | 1.640× | 1.540× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=edit-open.bottom-right]</code> | 1.3007 / 1.4649 ms | 1.3986 / 1.5933 ms | 1.075× | 1.088× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=edit-open.middle]</code> | 0.95581 / 1.0882 ms | 1.0086 / 1.1347 ms | 1.055× | 1.043× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=edit-open.top-left]</code> | 0.97621 / 1.0747 ms | 1.0537 / 1.1546 ms | 1.079× | 1.074× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=formatted-paint.top-left]</code> | 3.1578 / 3.4216 ms | 5.9735 / 6.1912 ms | 1.892× | 1.809× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=merge-heavy.paint]</code> | 3.3800 / 3.5885 ms | 6.1588 / 6.4948 ms | 1.822× | 1.810× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=scroll-down.middle]</code> | 3.9868 / 4.2499 ms | 6.7267 / 7.7096 ms | 1.687× | 1.814× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=scroll-down.top-left]</code> | 14.371 / 14.906 ms | 20.220 / 20.964 ms | 1.407× | 1.406× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=scroll-right.top-left]</code> | 10.260 / 11.662 ms | 16.021 / 18.420 ms | 1.562× | 1.580× | slower |
| <code>results[engine=handsontable;rows=10000;scenarioId=scroll-smooth.same-window]</code> | 7.2929 / 7.5357 ms | 10.205 / 10.369 ms | 1.399× | 1.376× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=altering.insert-5-rows-top]</code> | 5.3722 / 6.2759 ms | 8.3965 / 9.0362 ms | 1.563× | 1.440× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=altering.remove-5-rows-top]</code> | 5.2150 / 5.8805 ms | 8.1154 / 9.0323 ms | 1.556× | 1.536× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=arrow-down.top-left]</code> | 1.3413 / 1.5528 ms | 1.4213 / 1.7717 ms | 1.060× | 1.141× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=arrow-right.middle]</code> | 1.2367 / 1.5392 ms | 1.3203 / 1.6234 ms | 1.068× | 1.055× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=edit-commit.middle]</code> | 4.5909 / 5.2665 ms | 7.5036 / 8.0829 ms | 1.634× | 1.535× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=edit-open.bottom-right]</code> | 1.3164 / 1.4447 ms | 1.3944 / 1.5383 ms | 1.059× | 1.065× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=edit-open.middle]</code> | 0.95094 / 1.0472 ms | 1.0187 / 1.1178 ms | 1.071× | 1.067× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=edit-open.top-left]</code> | 0.96787 / 1.0669 ms | 1.0364 / 1.1419 ms | 1.071× | 1.070× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=formatted-paint.top-left]</code> | 3.2129 / 3.5339 ms | 6.0029 / 6.4723 ms | 1.868× | 1.831× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=merge-heavy.paint]</code> | 3.6982 / 3.8523 ms | 6.4031 / 6.8498 ms | 1.731× | 1.778× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=scroll-down.middle]</code> | 3.9000 / 4.1887 ms | 6.6521 / 7.5471 ms | 1.706× | 1.802× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=scroll-down.top-left]</code> | 14.393 / 14.977 ms | 20.210 / 20.978 ms | 1.404× | 1.401× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=scroll-right.top-left]</code> | 10.240 / 11.135 ms | 16.314 / 17.554 ms | 1.593× | 1.576× | slower |
| <code>results[engine=handsontable;rows=1000;scenarioId=scroll-smooth.same-window]</code> | 7.3607 / 7.9565 ms | 10.225 / 10.394 ms | 1.389× | 1.306× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=altering.insert-5-rows-top]</code> | 12.028 / 12.223 ms | 12.456 / 12.563 ms | 1.036× | 1.028× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=altering.remove-5-rows-top]</code> | 11.994 / 12.492 ms | 12.389 / 12.826 ms | 1.033× | 1.027× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=arrow-down.top-left]</code> | 0.60629 / 1.3667 ms | 0.59003 / 1.2276 ms | 0.973× | 0.898× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=arrow-right.middle]</code> | 0.60779 / 1.2397 ms | 0.60485 / 1.4328 ms | 0.995× | 1.156× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=edit-commit.middle]</code> | 0.82395 / 1.4390 ms | 0.87346 / 1.5730 ms | 1.060× | 1.093× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.bottom-right]</code> | 0.44966 / 1.4442 ms | 0.45904 / 1.5061 ms | 1.021× | 1.043× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.middle]</code> | 0.58293 / 1.5189 ms | 0.55556 / 1.3026 ms | 0.953× | 0.858× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.top-left]</code> | 0.50011 / 1.4232 ms | 0.57716 / 1.3706 ms | 1.154× | 0.963× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=formatted-paint.top-left]</code> | 0.40923 / 0.70345 ms | 0.0036291 / 0.0039462 ms | 0.009× | 0.006× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=merge-heavy.paint]</code> | 0.0031947 / 0.0032538 ms | 0.0031870 / 0.0032156 ms | 0.998× | 0.988× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=scroll-down.middle]</code> | 1.0984 / 1.8054 ms | 1.1229 / 1.6739 ms | 1.022× | 0.927× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=scroll-down.top-left]</code> | 1.1082 / 1.1825 ms | 1.1642 / 1.2603 ms | 1.050× | 1.066× | slower |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=scroll-right.top-left]</code> | 0.26799 / 0.41082 ms | 0.26458 / 0.39747 ms | 0.987× | 0.967× | faster |
| <code>results[engine=sheetwrite;rows=1000000;scenarioId=scroll-smooth.same-window]</code> | 0.37595 / 0.38511 ms | 0.38577 / 0.40335 ms | 1.026× | 1.047× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=altering.insert-5-rows-top]</code> | 1.7711 / 1.9339 ms | 1.8706 / 2.0817 ms | 1.056× | 1.076× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=altering.remove-5-rows-top]</code> | 1.5680 / 1.6498 ms | 1.6671 / 1.7979 ms | 1.063× | 1.090× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=arrow-down.top-left]</code> | 0.65310 / 0.73197 ms | 0.67781 / 0.76028 ms | 1.038× | 1.039× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=arrow-right.middle]</code> | 0.66303 / 0.74098 ms | 0.67840 / 0.75761 ms | 1.023× | 1.022× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-commit.middle]</code> | 0.91169 / 1.0407 ms | 0.96078 / 1.1509 ms | 1.054× | 1.106× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.bottom-right]</code> | 0.53210 / 0.58356 ms | 0.54755 / 0.60173 ms | 1.029× | 1.031× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.middle]</code> | 0.63418 / 0.72755 ms | 0.66512 / 0.73889 ms | 1.049× | 1.016× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.top-left]</code> | 0.56491 / 0.61241 ms | 0.58632 / 0.61975 ms | 1.038× | 1.012× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=formatted-paint.top-left]</code> | 0.47376 / 0.52764 ms | 0.0036132 / 0.0038825 ms | 0.008× | 0.007× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=merge-heavy.paint]</code> | 0.0032058 / 0.0041122 ms | 0.0032002 / 0.0050678 ms | 0.998× | 1.232× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.middle]</code> | 1.1292 / 1.2563 ms | 1.2060 / 1.3442 ms | 1.068× | 1.070× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.top-left]</code> | 1.1848 / 1.2716 ms | 1.2280 / 1.4838 ms | 1.037× | 1.167× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-right.top-left]</code> | 0.26034 / 0.31674 ms | 0.25389 / 0.34890 ms | 0.975× | 1.102× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-smooth.same-window]</code> | 0.37831 / 0.38481 ms | 0.39066 / 0.41528 ms | 1.033× | 1.079× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=altering.insert-5-rows-top]</code> | 1.0397 / 1.1725 ms | 1.0643 / 1.2200 ms | 1.024× | 1.041× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=altering.remove-5-rows-top]</code> | 1.1038 / 1.2114 ms | 1.1119 / 1.2262 ms | 1.007× | 1.012× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=arrow-down.top-left]</code> | 0.65376 / 0.69670 ms | 0.66737 / 0.70427 ms | 1.021× | 1.011× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=arrow-right.middle]</code> | 0.65138 / 0.72287 ms | 0.66394 / 0.74064 ms | 1.019× | 1.025× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=edit-commit.middle]</code> | 0.90360 / 0.99662 ms | 0.95856 / 1.0971 ms | 1.061× | 1.101× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=edit-open.bottom-right]</code> | 0.54150 / 0.61350 ms | 0.54100 / 0.62892 ms | 0.999× | 1.025× | faster |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=edit-open.middle]</code> | 0.63892 / 0.67588 ms | 0.65621 / 0.71393 ms | 1.027× | 1.056× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=edit-open.top-left]</code> | 0.57105 / 0.62556 ms | 0.57358 / 0.64575 ms | 1.004× | 1.032× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=formatted-paint.top-left]</code> | 0.45719 / 0.48896 ms | 0.0037050 / 0.0038488 ms | 0.008× | 0.008× | faster |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=merge-heavy.paint]</code> | 0.0032031 / 0.0041264 ms | 0.0031907 / 0.0045737 ms | 0.996× | 1.108× | faster |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=scroll-down.middle]</code> | 1.1492 / 1.2205 ms | 1.1987 / 1.2922 ms | 1.043× | 1.059× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=scroll-down.top-left]</code> | 1.1669 / 1.3074 ms | 1.2432 / 1.3523 ms | 1.065× | 1.034× | slower |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=scroll-right.top-left]</code> | 0.26631 / 0.29888 ms | 0.26358 / 0.32799 ms | 0.990× | 1.097× | faster |
| <code>results[engine=sheetwrite;rows=10000;scenarioId=scroll-smooth.same-window]</code> | 0.37319 / 0.39887 ms | 0.39644 / 0.41893 ms | 1.062× | 1.050× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=altering.insert-5-rows-top]</code> | 1.0017 / 1.1115 ms | 1.0303 / 1.1656 ms | 1.028× | 1.049× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=altering.remove-5-rows-top]</code> | 1.0571 / 1.1736 ms | 1.0558 / 1.1788 ms | 0.999× | 1.004× | faster |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=arrow-down.top-left]</code> | 0.66291 / 0.69503 ms | 0.68816 / 0.74922 ms | 1.038× | 1.078× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=arrow-right.middle]</code> | 0.66802 / 0.72661 ms | 0.67385 / 0.73445 ms | 1.009× | 1.011× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=edit-commit.middle]</code> | 0.90096 / 1.0316 ms | 0.94336 / 1.0903 ms | 1.047× | 1.057× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=edit-open.bottom-right]</code> | 0.54754 / 0.56742 ms | 0.55344 / 0.59773 ms | 1.011× | 1.053× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=edit-open.middle]</code> | 0.65165 / 0.68208 ms | 0.66975 / 0.71868 ms | 1.028× | 1.054× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=edit-open.top-left]</code> | 0.57530 / 0.64173 ms | 0.58286 / 0.69343 ms | 1.013× | 1.081× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=formatted-paint.top-left]</code> | 0.46328 / 0.48440 ms | 0.0036889 / 0.0039007 ms | 0.008× | 0.008× | faster |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=merge-heavy.paint]</code> | 0.0032618 / 0.0040872 ms | 0.0031713 / 0.0044620 ms | 0.972× | 1.092× | faster |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=scroll-down.middle]</code> | 1.2060 / 1.3021 ms | 1.1687 / 1.2969 ms | 0.969× | 0.996× | faster |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=scroll-down.top-left]</code> | 1.1518 / 1.3124 ms | 1.2588 / 1.3694 ms | 1.093× | 1.043× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=scroll-right.top-left]</code> | 0.26508 / 0.30821 ms | 0.27079 / 0.31861 ms | 1.022× | 1.034× | slower |
| <code>results[engine=sheetwrite;rows=1000;scenarioId=scroll-smooth.same-window]</code> | 0.37268 / 0.40149 ms | 0.38913 / 0.41941 ms | 1.044× | 1.045× | slower |

### interaction-results.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:16 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:16 UTC.

Threshold: **absolute-ceiling**. lookupP95Ns uses the median; byte and owned long-task ceilings apply to every sample. Historical deltas are descriptive, not relative gates. Source: <code>bench/src/interaction-gate.ts</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>values.dirty100Bytes</code> | 5679.0 / 5679.0 bytes | 5679.0 / 5679.0 bytes | 1.000× | 1.000× | unchanged |
| <code>values.inverseIndexBytes</code> | 4.0000e+6 / 4.0000e+6 bytes | 4.0000e+6 / 4.0000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>values.lookupMedianNs</code> | 19.946 / 20.805 ns | 20.971 / 21.356 ns | 1.051× | 1.026× | slower |
| <code>values.lookupP95Ns</code> | 251.89 / 348.06 ns | 250.05 / 318.50 ns | 0.993× | 0.915× | faster |
| <code>values.ownedColdLongTaskMs</code> | 0.0000 / 0.0000 ms | 0.0000 / 0.0000 ms | 1.000× | 1.000× | unchanged |
| <code>values.unattributedColdLongTaskMs</code> | 94.592 / 99.072 ms | 99.174 / 106.90 ms | 1.048× | 1.079× | slower |
| <code>values.usableMs</code> | 1096.5 / 1146.7 ms | 1439.1 / 1489.8 ms | 1.312× | 1.299× | slower |

### paged-results.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:16 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:16 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>timings.cache-churn.stat</code> | 18.526 / 48.733 ms | 17.028 / 66.067 ms | 0.919× | 1.356× | faster |
| <code>timings.distant-page.stat</code> | 0.14966 / 1.1466 ms | 0.13186 / 1.5085 ms | 0.881× | 1.316× | faster |
| <code>timings.first-page.stat</code> | 0.15394 / 2.4355 ms | 0.14635 / 3.8525 ms | 0.951× | 1.582× | faster |
| <code>timings.startup.stat</code> | 0.10107 / 1.9930 ms | 0.11421 / 1.9848 ms | 1.130× | 0.996× | slower |
| <code>timings.wide-page.stat</code> | 12.313 / 41.937 ms | 10.920 / 37.532 ms | 0.887× | 0.895× | faster |

### data-results.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:28 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:40 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>handsontable.1000.stats.aggregate</code> | 0.12175 / 0.17065 ms | 0.12826 / 0.18266 ms | 1.053× | 1.070× | slower |
| <code>handsontable.1000.stats.distinctHigh</code> | 0.15087 / 0.18484 ms | 0.15600 / 0.27955 ms | 1.034× | 1.512× | slower |
| <code>handsontable.1000.stats.distinctLow</code> | 0.12523 / 0.19885 ms | 0.11955 / 0.15825 ms | 0.955× | 0.796× | faster |
| <code>handsontable.1000.stats.edit</code> | 197.48 / 243.42 ms | 171.80 / 251.20 ms | 0.870× | 1.032× | faster |
| <code>handsontable.1000.stats.filter</code> | 61.407 / 94.077 ms | 68.724 / 87.323 ms | 1.119× | 0.928× | slower |
| <code>handsontable.1000.stats.ingest</code> | 390.00 / 526.31 ms | 409.68 / 507.13 ms | 1.050× | 0.964× | slower |
| <code>handsontable.1000.stats.multiFilter</code> | 124.57 / 137.72 ms | 149.49 / 202.28 ms | 1.200× | 1.469× | slower |
| <code>handsontable.1000.stats.sort</code> | 150.37 / 157.62 ms | 170.63 / 196.37 ms | 1.135× | 1.246× | slower |
| <code>handsontable.1000.stats.windowRead</code> | 0.17112 / 0.21027 ms | 0.17460 / 0.20289 ms | 1.020× | 0.965× | slower |
| <code>handsontable.10000.stats.aggregate</code> | 1.0228 / 1.4159 ms | 1.0421 / 1.4030 ms | 1.019× | 0.991× | slower |
| <code>handsontable.10000.stats.distinctHigh</code> | 1.3166 / 1.7959 ms | 1.3329 / 1.7484 ms | 1.012× | 0.974× | slower |
| <code>handsontable.10000.stats.distinctLow</code> | 0.94934 / 1.8225 ms | 0.93977 / 1.9326 ms | 0.990× | 1.060× | faster |
| <code>handsontable.10000.stats.edit</code> | 372.52 / 446.14 ms | 380.23 / 447.07 ms | 1.021× | 1.002× | slower |
| <code>handsontable.10000.stats.filter</code> | 588.72 / 626.72 ms | 581.86 / 617.10 ms | 0.988× | 0.985× | faster |
| <code>handsontable.10000.stats.ingest</code> | 3987.9 / 4296.9 ms | 3882.8 / 4159.6 ms | 0.974× | 0.968× | faster |
| <code>handsontable.10000.stats.multiFilter</code> | 1225.1 / 1322.5 ms | 1206.5 / 1253.6 ms | 0.985× | 0.948× | faster |
| <code>handsontable.10000.stats.sort</code> | 1443.9 / 1554.0 ms | 1441.7 / 1554.7 ms | 0.999× | 1.000× | faster |
| <code>handsontable.10000.stats.windowRead</code> | 0.18146 / 0.22677 ms | 0.18399 / 0.24982 ms | 1.014× | 1.102× | slower |
| <code>sheetwrite.1000.queries.filter-value-set-10</code> | 0.19146 / 0.72483 ms | 0.16551 / 0.66606 ms | 0.865× | 0.919× | faster |
| <code>sheetwrite.1000.queries.filter-value-set-1000</code> | 0.91925 / 1.6234 ms | 0.83350 / 1.3653 ms | 0.907× | 0.841× | faster |
| <code>sheetwrite.1000.queries.ingest-numeric-only</code> | 0.30488 / 0.43380 ms | 0.23518 / 0.34685 ms | 0.771× | 0.800× | faster |
| <code>sheetwrite.1000.queries.sort-multi-key</code> | 0.24137 / 0.38886 ms | 0.17330 / 0.31537 ms | 0.718× | 0.811× | faster |
| <code>sheetwrite.1000.queries.sort-with-candidates</code> | 0.14270 / 0.18407 ms | 0.12310 / 0.27864 ms | 0.863× | 1.514× | faster |
| <code>sheetwrite.1000.stats.aggregate</code> | 0.0021906 / 0.0025323 ms | 0.0020919 / 0.0023807 ms | 0.955× | 0.940× | faster |
| <code>sheetwrite.1000.stats.distinctHigh</code> | 0.24748 / 0.39128 ms | 0.20961 / 1.4650 ms | 0.847× | 3.744× | faster |
| <code>sheetwrite.1000.stats.distinctLow</code> | 0.078749 / 0.10219 ms | 0.060536 / 0.069086 ms | 0.769× | 0.676× | faster |
| <code>sheetwrite.1000.stats.edit</code> | 12.848 / 29.133 ms | 15.450 / 27.678 ms | 1.203× | 0.950× | slower |
| <code>sheetwrite.1000.stats.filter</code> | 0.14253 / 0.21751 ms | 0.11105 / 0.23018 ms | 0.779× | 1.058× | faster |
| <code>sheetwrite.1000.stats.ingest</code> | 0.76940 / 1.1996 ms | 0.73332 / 1.3557 ms | 0.953× | 1.130× | faster |
| <code>sheetwrite.1000.stats.multiFilter</code> | 0.19123 / 0.25616 ms | 0.16280 / 0.28506 ms | 0.851× | 1.113× | faster |
| <code>sheetwrite.1000.stats.sort</code> | 0.23381 / 0.24838 ms | 0.19564 / 0.64783 ms | 0.837× | 2.608× | faster |
| <code>sheetwrite.1000.stats.windowRead</code> | 0.011401 / 0.026302 ms | 0.010102 / 0.020394 ms | 0.886× | 0.775× | faster |
| <code>sheetwrite.10000.queries.filter-value-set-10</code> | 0.43515 / 0.49919 ms | 0.39510 / 0.42715 ms | 0.908× | 0.856× | faster |
| <code>sheetwrite.10000.queries.filter-value-set-1000</code> | 1.1300 / 1.1657 ms | 1.0333 / 1.1172 ms | 0.914× | 0.958× | faster |
| <code>sheetwrite.10000.queries.ingest-numeric-only</code> | 1.8836 / 1.9938 ms | 1.4838 / 1.5309 ms | 0.788× | 0.768× | faster |
| <code>sheetwrite.10000.queries.sort-multi-key</code> | 2.6945 / 5.3852 ms | 2.6439 / 3.4212 ms | 0.981× | 0.635× | faster |
| <code>sheetwrite.10000.queries.sort-with-candidates</code> | 0.28984 / 0.32695 ms | 0.26455 / 0.29958 ms | 0.913× | 0.916× | faster |
| <code>sheetwrite.10000.stats.aggregate</code> | 0.018955 / 0.028076 ms | 0.017568 / 0.018096 ms | 0.927× | 0.645× | faster |
| <code>sheetwrite.10000.stats.distinctHigh</code> | 1.3733 / 2.5489 ms | 1.3117 / 2.2517 ms | 0.955× | 0.883× | faster |
| <code>sheetwrite.10000.stats.distinctLow</code> | 0.11404 / 0.17427 ms | 0.081944 / 0.12854 ms | 0.719× | 0.738× | faster |
| <code>sheetwrite.10000.stats.edit</code> | 7.5397 / 17.526 ms | 7.9605 / 17.591 ms | 1.056× | 1.004× | slower |
| <code>sheetwrite.10000.stats.filter</code> | 0.12687 / 0.15818 ms | 0.12470 / 0.16047 ms | 0.983× | 1.014× | faster |
| <code>sheetwrite.10000.stats.ingest</code> | 5.2670 / 7.0104 ms | 4.8996 / 5.1517 ms | 0.930× | 0.735× | faster |
| <code>sheetwrite.10000.stats.multiFilter</code> | 0.47234 / 0.65615 ms | 0.43905 / 0.48998 ms | 0.930× | 0.747× | faster |
| <code>sheetwrite.10000.stats.sort</code> | 0.26339 / 0.34805 ms | 0.25808 / 0.56841 ms | 0.980× | 1.633× | faster |
| <code>sheetwrite.10000.stats.windowRead</code> | 0.011320 / 0.013254 ms | 0.010145 / 0.012062 ms | 0.896× | 0.910× | faster |
| <code>sheetwrite.100000.queries.filter-value-set-10</code> | 3.0568 / 3.1254 ms | 2.8760 / 3.1188 ms | 0.941× | 0.998× | faster |
| <code>sheetwrite.100000.queries.filter-value-set-1000</code> | 3.7454 / 3.8265 ms | 3.6088 / 3.6783 ms | 0.964× | 0.961× | faster |
| <code>sheetwrite.100000.queries.filter-value-set-50000</code> | 47.494 / 48.066 ms | 46.952 / 49.058 ms | 0.989× | 1.021× | faster |
| <code>sheetwrite.100000.queries.ingest-numeric-only</code> | 17.028 / 17.627 ms | 14.431 / 25.217 ms | 0.847× | 1.431× | faster |
| <code>sheetwrite.100000.queries.sort-multi-key</code> | 34.794 / 35.185 ms | 35.699 / 35.945 ms | 1.026× | 1.022× | slower |
| <code>sheetwrite.100000.queries.sort-with-candidates</code> | 2.1301 / 2.3239 ms | 2.0896 / 2.2863 ms | 0.981× | 0.984× | faster |
| <code>sheetwrite.100000.stats.aggregate</code> | 0.19142 / 0.21676 ms | 0.18935 / 0.23002 ms | 0.989× | 1.061× | faster |
| <code>sheetwrite.100000.stats.distinctHigh</code> | 13.885 / 14.160 ms | 14.071 / 14.480 ms | 1.013× | 1.023× | slower |
| <code>sheetwrite.100000.stats.distinctLow</code> | 0.58863 / 0.62356 ms | 0.61362 / 0.68193 ms | 1.042× | 1.094× | slower |
| <code>sheetwrite.100000.stats.edit</code> | 5.6497 / 9.6005 ms | 5.8044 / 9.4813 ms | 1.027× | 0.988× | slower |
| <code>sheetwrite.100000.stats.filter</code> | 0.43915 / 0.48060 ms | 0.39808 / 0.54259 ms | 0.906× | 1.129× | faster |
| <code>sheetwrite.100000.stats.ingest</code> | 62.322 / 76.067 ms | 56.272 / 66.841 ms | 0.903× | 0.879× | faster |
| <code>sheetwrite.100000.stats.multiFilter</code> | 3.7125 / 3.8572 ms | 3.5183 / 3.7498 ms | 0.948× | 0.972× | faster |
| <code>sheetwrite.100000.stats.sort</code> | 2.0558 / 2.2118 ms | 1.9653 / 2.1364 ms | 0.956× | 0.966× | faster |
| <code>sheetwrite.100000.stats.windowRead</code> | 0.013072 / 0.015070 ms | 0.011570 / 0.012997 ms | 0.885× | 0.862× | faster |
| <code>sheetwrite.1000000.queries.filter-value-set-10</code> | 31.356 / 32.353 ms | 30.374 / 31.735 ms | 0.969× | 0.981× | faster |
| <code>sheetwrite.1000000.queries.filter-value-set-1000</code> | 31.515 / 32.452 ms | 30.743 / 30.977 ms | 0.976× | 0.955× | faster |
| <code>sheetwrite.1000000.queries.ingest-numeric-only</code> | 145.01 / 146.27 ms | 66.288 / 67.280 ms | 0.457× | 0.460× | faster |
| <code>sheetwrite.1000000.queries.sort-multi-key</code> | 537.02 / 550.24 ms | 503.13 / 511.21 ms | 0.937× | 0.929× | faster |
| <code>sheetwrite.1000000.queries.sort-with-candidates</code> | 27.252 / 27.669 ms | 27.010 / 27.580 ms | 0.991× | 0.997× | faster |
| <code>sheetwrite.1000000.stats.aggregate</code> | 1.8253 / 1.9774 ms | 1.7364 / 1.8083 ms | 0.951× | 0.914× | faster |
| <code>sheetwrite.1000000.stats.distinctHigh</code> | 148.27 / 149.83 ms | 151.49 / 152.99 ms | 1.022× | 1.021× | slower |
| <code>sheetwrite.1000000.stats.distinctLow</code> | 6.1641 / 6.4334 ms | 5.2184 / 5.4413 ms | 0.847× | 0.846× | faster |
| <code>sheetwrite.1000000.stats.edit</code> | 6.4248 / 8.6066 ms | 6.7516 / 24.892 ms | 1.051× | 2.892× | slower |
| <code>sheetwrite.1000000.stats.filter</code> | 3.5785 / 3.6042 ms | 3.2020 / 3.2542 ms | 0.895× | 0.903× | faster |
| <code>sheetwrite.1000000.stats.ingest</code> | 553.40 / 574.45 ms | 594.98 / 595.40 ms | 1.075× | 1.036× | slower |
| <code>sheetwrite.1000000.stats.multiFilter</code> | 38.136 / 38.917 ms | 37.214 / 37.262 ms | 0.976× | 0.957× | faster |
| <code>sheetwrite.1000000.stats.sort</code> | 23.312 / 24.114 ms | 22.406 / 23.436 ms | 0.961× | 0.972× | faster |
| <code>sheetwrite.1000000.stats.windowRead</code> | 0.017505 / 0.019205 ms | 0.015101 / 0.016989 ms | 0.863× | 0.885× | faster |
| <code>sheetwrite.500000.queries.filter-value-set-10</code> | 15.192 / 16.594 ms | 14.921 / 16.037 ms | 0.982× | 0.966× | faster |
| <code>sheetwrite.500000.queries.filter-value-set-1000</code> | 16.039 / 16.243 ms | 15.971 / 16.088 ms | 0.996× | 0.990× | faster |
| <code>sheetwrite.500000.queries.ingest-numeric-only</code> | 67.755 / 67.816 ms | 72.647 / 72.953 ms | 1.072× | 1.076× | slower |
| <code>sheetwrite.500000.queries.sort-multi-key</code> | 214.03 / 217.73 ms | 221.31 / 254.05 ms | 1.034× | 1.167× | slower |
| <code>sheetwrite.500000.queries.sort-with-candidates</code> | 12.511 / 12.760 ms | 12.450 / 12.515 ms | 0.995× | 0.981× | faster |
| <code>sheetwrite.500000.stats.aggregate</code> | 0.88638 / 0.94514 ms | 0.88403 / 0.92397 ms | 0.997× | 0.978× | faster |
| <code>sheetwrite.500000.stats.distinctHigh</code> | 72.793 / 73.995 ms | 76.304 / 76.460 ms | 1.048× | 1.033× | slower |
| <code>sheetwrite.500000.stats.distinctLow</code> | 2.7724 / 3.0061 ms | 2.3830 / 2.7366 ms | 0.860× | 0.910× | faster |
| <code>sheetwrite.500000.stats.edit</code> | 5.4687 / 5.6195 ms | 5.6275 / 5.7160 ms | 1.029× | 1.017× | slower |
| <code>sheetwrite.500000.stats.filter</code> | 1.7469 / 1.7850 ms | 1.5643 / 1.6112 ms | 0.895× | 0.903× | faster |
| <code>sheetwrite.500000.stats.ingest</code> | 325.01 / 327.49 ms | 290.66 / 296.65 ms | 0.894× | 0.906× | faster |
| <code>sheetwrite.500000.stats.multiFilter</code> | 19.154 / 19.783 ms | 18.294 / 18.588 ms | 0.955× | 0.940× | faster |
| <code>sheetwrite.500000.stats.sort</code> | 10.046 / 10.145 ms | 10.033 / 10.134 ms | 0.999× | 0.999× | faster |
| <code>sheetwrite.500000.stats.windowRead</code> | 0.014440 / 0.015779 ms | 0.015229 / 0.016849 ms | 1.055× | 1.068× | slower |

### core-paths-results.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:40 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:41 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>scenarios[id=command-state-select].timing</code> | 9.1821 / 18.013 ms | 9.8424 / 16.438 ms | 1.072× | 0.913× | slower |
| <code>scenarios[id=command-state-select].variants[id=with-command-state-handler].timing</code> | 9.1821 / 18.013 ms | 9.8424 / 16.438 ms | 1.072× | 0.913× | slower |
| <code>scenarios[id=command-state-select].variants[id=without-command-state-handler].timing</code> | 7.6262 / 11.757 ms | 7.4363 / 12.424 ms | 0.975× | 1.057× | faster |
| <code>scenarios[id=csv-import].timing</code> | 230.65 / 243.52 ms | 218.07 / 231.19 ms | 0.945× | 0.949× | faster |
| <code>scenarios[id=node-cold-init].timing</code> | 6.3553 / 7.5723 ms | 6.8376 / 8.0791 ms | 1.076× | 1.067× | slower |
| <code>scenarios[id=paged-evicted-revisit].timing</code> | 8.0573 / 10.602 ms | 14.678 / 17.600 ms | 1.822× | 1.660× | slower |
| <code>scenarios[id=rebase-large].timing</code> | 1.7258 / 1.8344 ms | 3.7557 / 4.9038 ms | 2.176× | 2.673× | slower |
| <code>scenarios[id=restore-near-ceiling].timing</code> | 1005.9 / 1007.3 ms | 840.19 / 896.13 ms | 0.835× | 0.890× | faster |
| <code>scenarios[id=row-bridge-insert].timing</code> | 6.2225 / 8.4085 ms | 5.9905 / 8.3835 ms | 0.963× | 0.997× | faster |
| <code>scenarios[id=setblock-admission].timing</code> | 545.54 / 559.71 ms | 544.86 / 555.57 ms | 0.999× | 0.993× | faster |
| <code>scenarios[id=setblock-detailed-capture].timing</code> | 697.52 / 782.18 ms | 656.66 / 765.70 ms | 0.941× | 0.979× | faster |
| <code>scenarios[id=sync-offline-queue].timing</code> | 0.64086 / 1.5959 ms | 0.032401 / 1.5858 ms | 0.051× | 0.994× | faster |
| <code>scenarios[id=undo-large-clear].timing</code> | 1691.5 / 1701.8 ms | 362.31 / 430.02 ms | 0.214× | 0.253× | faster |
| <code>scenarios[id=validation-sparse].timing</code> | 187.39 / 193.72 ms | 181.16 / 182.00 ms | 0.967× | 0.939× | faster |

### chart-tracking-results.json

Status: **new-only**. Baseline: **0.5.4**. Baseline capture: not available. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:42 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>baseline</code> | Not captured | 0.0067420 / 0.016508 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=20000;source=literal].baselineMs</code> | Not captured | 0.0060560 / 0.011135 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=20000;source=literal].commitMs</code> | Not captured | 0.0067300 / 0.010823 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=20000;source=literal].eventMs</code> | Not captured | 0.0065200 / 0.010620 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=2000;source=literal].baselineMs</code> | Not captured | 0.0067420 / 0.016508 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=2000;source=literal].commitMs</code> | Not captured | 0.0067190 / 0.020489 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=2000;source=literal].eventMs</code> | Not captured | 0.0065080 / 0.020133 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=200;source=literal].baselineMs</code> | Not captured | 0.011922 / 0.047927 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=200;source=literal].commitMs</code> | Not captured | 0.011238 / 0.025521 ms | — | — | new-only |
| <code>rows[scenario=inside;chartCount=200;source=literal].eventMs</code> | Not captured | 0.010742 / 0.024646 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].baselineMs</code> | Not captured | 0.0060560 / 0.011135 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].commitMs</code> | Not captured | 2.3807 / 3.9835 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].eventMs</code> | Not captured | 2.3763 / 3.9769 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].baselineMs</code> | Not captured | 0.0067420 / 0.016508 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].commitMs</code> | Not captured | 0.16618 / 0.28735 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].eventMs</code> | Not captured | 0.16378 / 0.28420 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=200;source=formula].baselineMs</code> | Not captured | 0.011922 / 0.047927 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=200;source=formula].commitMs</code> | Not captured | 0.033996 / 0.065134 ms | — | — | new-only |
| <code>rows[scenario=literal-dependency-edit;chartCount=200;source=formula].eventMs</code> | Not captured | 0.033126 / 0.064147 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=20000;source=formula].baselineMs</code> | Not captured | 0.0060560 / 0.011135 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=20000;source=formula].commitMs</code> | Not captured | 2.3500 / 4.1767 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=20000;source=formula].eventMs</code> | Not captured | 2.3458 / 4.1701 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=20000;source=literal].baselineMs</code> | Not captured | 0.0060560 / 0.011135 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=20000;source=literal].commitMs</code> | Not captured | 0.0073180 / 0.026764 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=2000;source=formula].baselineMs</code> | Not captured | 0.0067420 / 0.016508 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=2000;source=formula].commitMs</code> | Not captured | 0.18462 / 0.23536 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=2000;source=formula].eventMs</code> | Not captured | 0.18238 / 0.23286 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=2000;source=literal].baselineMs</code> | Not captured | 0.0067420 / 0.016508 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=2000;source=literal].commitMs</code> | Not captured | 0.0062800 / 0.010274 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=200;source=formula].baselineMs</code> | Not captured | 0.011922 / 0.047927 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=200;source=formula].commitMs</code> | Not captured | 0.053512 / 0.20969 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=200;source=formula].eventMs</code> | Not captured | 0.051643 / 0.20753 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=200;source=literal].baselineMs</code> | Not captured | 0.011922 / 0.047927 ms | — | — | new-only |
| <code>rows[scenario=outside;chartCount=200;source=literal].commitMs</code> | Not captured | 0.0096660 / 0.017699 ms | — | — | new-only |

### pivot-results.json

Status: **new-only**. Baseline: **0.5.4**. Baseline capture: not available. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:42 UTC.

Threshold: **none**. No historical artifact at the base ref. The 100x incremental/full-build speedup target is an in-capture gate, not a historical comparison threshold. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>buildMs</code> | Not captured | 28.873 / 30.493 ms | — | — | new-only |
| <code>donorKeyEditMs</code> | Not captured | 0.0027440 / 0.012722 ms | — | — | new-only |
| <code>editMs</code> | Not captured | 0.0016899 / 0.011576 ms | — | — | new-only |
| <code>maxBuildMs</code> | Not captured | 81.819 / 108.92 ms | — | — | new-only |
| <code>maxExtremeEditMs</code> | Not captured | 0.0024885 / 0.011054 ms | — | — | new-only |

### formula-results.json

Status: **compared**. Baseline: **0.5.4 engine (WASM) under 0.6 core and harness**. Baseline capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:50 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].allocationStat.retainedBytes</code> | 2.6122e+6 / 2.6122e+6 bytes | 2.6027e+6 / 2.6027e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=countif-100k;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].stat</code> | 0.94476 / 1.0609 ms | 0.87297 / 0.90785 ms | 0.924× | 0.856× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2176e+6 / 5.2176e+6 bytes | 5.2034e+6 / 5.2034e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].stat</code> | 4.7918 / 5.0174 ms | 4.2492 / 4.3106 ms | 0.887× | 0.859× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].stat</code> | 1.5986 / 1.6482 ms | 1.6788 / 1.7393 ms | 1.050× | 1.055× | within-noise |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes</code> | 6.3990e+5 / 6.3990e+5 bytes | 6.1665e+5 / 6.1665e+5 bytes | 0.964× | 0.964× | faster |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].stat</code> | 0.50711 / 0.54007 ms | 0.24866 / 0.26036 ms | 0.490× | 0.482× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].allocationStat.retainedBytes</code> | 7.4499e+5 / 7.4499e+5 bytes | 6.9908e+5 / 6.9908e+5 bytes | 0.938× | 0.938× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].stat</code> | 1.4115 / 1.4320 ms | 0.49645 / 0.51072 ms | 0.352× | 0.357× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].allocationStat.retainedBytes</code> | 43094 / 43094 bytes | 37290 / 37290 bytes | 0.865× | 0.865× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].stat</code> | 0.087770 / 0.10380 ms | 0.040764 / 0.059967 ms | 0.464× | 0.578× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes</code> | 8.6510e+5 / 8.6510e+5 bytes | 8.3719e+5 / 8.3719e+5 bytes | 0.968× | 0.968× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].stat</code> | 0.012278 / 0.019448 ms | 0.011171 / 0.018132 ms | 0.910× | 0.932× | faster |
| <code>workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].allocationStat.retainedBytes</code> | 3.1478e+5 / 3.1478e+5 bytes | 2.8321e+5 / 2.8321e+5 bytes | 0.900× | 0.900× | faster |
| <code>workloads[id=error-propagation;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].stat</code> | 0.73226 / 0.74649 ms | 0.25205 / 0.25962 ms | 0.344× | 0.348× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes</code> | 5.7667e+7 / 5.7667e+7 bytes | 5.5939e+7 / 5.5939e+7 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].stat</code> | 0.030414 / 0.037330 ms | 0.030352 / 0.039734 ms | 0.998× | 1.064× | faster |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes</code> | 7.5508e+7 / 7.5508e+7 bytes | 7.2063e+7 / 7.2063e+7 bytes | 0.954× | 0.954× | faster |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].stat</code> | 0.020184 / 0.027557 ms | 0.020659 / 0.026022 ms | 1.024× | 0.944× | within-noise |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes</code> | 3.8408e+7 / 3.8408e+7 bytes | 3.6683e+7 / 3.6683e+7 bytes | 0.955× | 0.955× | faster |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].stat</code> | 80.265 / 81.548 ms | 39.459 / 41.255 ms | 0.492× | 0.506× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].stat</code> | 5.6488 / 5.7193 ms | 2.7133 / 2.8240 ms | 0.480× | 0.494× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes</code> | 4.7278e+5 / 4.7278e+5 bytes | 4.4531e+5 / 4.4531e+5 bytes | 0.942× | 0.942× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].stat</code> | 0.60972 / 1.0601 ms | 0.44879 / 0.46561 ms | 0.736× | 0.439× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes</code> | 2.9934e+7 / 2.9934e+7 bytes | 2.9015e+7 / 2.9015e+7 bytes | 0.969× | 0.969× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].stat</code> | 55.534 / 55.698 ms | 53.028 / 53.287 ms | 0.955× | 0.957× | faster |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes</code> | 3.2867e+6 / 3.2867e+6 bytes | 3.1713e+6 / 3.1713e+6 bytes | 0.965× | 0.965× | faster |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].stat</code> | 6.0613 / 6.4264 ms | 5.9725 / 8.6217 ms | 0.985× | 1.342× | regression |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes</code> | 3.6762e+5 / 3.6762e+5 bytes | 3.5255e+5 / 3.5255e+5 bytes | 0.959× | 0.959× | faster |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].stat</code> | 0.81668 / 1.2941 ms | 0.98969 / 1.3236 ms | 1.212× | 1.023× | within-noise |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes</code> | 8.9966e+5 / 8.9966e+5 bytes | 8.7229e+5 / 8.7229e+5 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].stat</code> | 3.8281 / 4.1846 ms | 2.8517 / 2.9284 ms | 0.745× | 0.700× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].allocationStat.retainedBytes</code> | 5.2175e+6 / 5.2175e+6 bytes | 5.2033e+6 / 5.2033e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].stat</code> | 1.9319 / 2.0742 ms | 1.7071 / 1.7140 ms | 0.884× | 0.826× | faster |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes</code> | 2.6126e+6 / 2.6126e+6 bytes | 2.6031e+6 / 2.6031e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].stat</code> | 0.64403 / 0.65832 ms | 0.50084 / 0.50852 ms | 0.778× | 0.772× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].allocationStat.retainedBytes</code> | 13761 / 13761 bytes | 8629.0 / 8629.0 bytes | 0.627× | 0.627× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].stat</code> | 0.024079 / 0.032526 ms | 0.015563 / 0.017708 ms | 0.646× | 0.544× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].allocationStat.retainedBytes</code> | 21029 / 21029 bytes | 15673 / 15673 bytes | 0.745× | 0.745× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].stat</code> | 0.043885 / 0.046944 ms | 0.029797 / 0.030249 ms | 0.679× | 0.644× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].allocationStat.retainedBytes</code> | 35565 / 35565 bytes | 29761 / 29761 bytes | 0.837× | 0.837× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].stat</code> | 0.075321 / 0.081069 ms | 0.034924 / 0.036379 ms | 0.464× | 0.449× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].allocationStat.retainedBytes</code> | 9219.0 / 9219.0 bytes | 4255.0 / 4255.0 bytes | 0.462× | 0.462× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].stat</code> | 0.018954 / 0.037661 ms | 0.018349 / 0.035684 ms | 0.968× | 0.948× | faster |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2172e+6 / 5.2172e+6 bytes | 5.2029e+6 / 5.2029e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].stat</code> | 1.8804 / 2.7193 ms | 1.7250 / 1.7885 ms | 0.917× | 0.658× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes</code> | 3.9150e+6 / 3.9150e+6 bytes | 3.9031e+6 / 3.9031e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].stat</code> | 3.5211 / 3.7146 ms | 2.8511 / 3.0993 ms | 0.810× | 0.834× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes</code> | 2.3625e+5 / 2.3625e+5 bytes | 1.9677e+5 / 1.9677e+5 bytes | 0.833× | 0.833× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].stat</code> | 0.40684 / 0.41491 ms | 0.21023 / 0.33778 ms | 0.517× | 0.814× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].stat</code> | 0.0026440 / 0.0029996 ms | 0.0025760 / 0.0028400 ms | 0.974× | 0.947× | faster |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].stat</code> | 54.009 / 54.443 ms | 21.702 / 22.121 ms | 0.402× | 0.406× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].stat</code> | 0.30270 / 0.30889 ms | 0.16599 / 0.18516 ms | 0.548× | 0.599× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes</code> | 7355.0 / 7355.0 bytes | 2423.0 / 2423.0 bytes | 0.329× | 0.329× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].stat</code> | 0.0038240 / 0.0068786 ms | 0.0033420 / 0.010504 ms | 0.874× | 1.527× | faster |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes</code> | 5.3056e+5 / 5.3056e+5 bytes | 5.0319e+5 / 5.0319e+5 bytes | 0.948× | 0.948× | faster |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].stat</code> | 0.52997 / 0.55171 ms | 0.28243 / 0.31232 ms | 0.533× | 0.566× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes</code> | 4.8000e+6 / 4.8000e+6 bytes | 4.8000e+6 / 4.8000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes</code> | 6.6631e+6 / 6.6631e+6 bytes | 5.8525e+6 / 5.8525e+6 bytes | 0.878× | 0.878× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations</code> | 3.0000 / 3.0000 count | 3.0000 / 3.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].stat</code> | 22.311 / 22.587 ms | 11.800 / 13.466 ms | 0.529× | 0.596× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes</code> | 4.0581e+6 / 4.0581e+6 bytes | 3.2521e+6 / 3.2521e+6 bytes | 0.801× | 0.801× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations</code> | 1.0000 / 1.0000 count | 1.0000 / 1.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].stat</code> | 11.402 / 11.627 ms | 4.3787 / 5.2738 ms | 0.384× | 0.454× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes</code> | 3.9146e+6 / 3.9146e+6 bytes | 3.9027e+6 / 3.9027e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].stat</code> | 4.0268 / 4.7363 ms | 3.7914 / 3.9331 ms | 0.942× | 0.830× | faster |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes</code> | 6.5198e+6 / 6.5198e+6 bytes | 6.5032e+6 / 6.5032e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].stat</code> | 7.1104 / 7.4815 ms | 5.7859 / 5.9272 ms | 0.814× | 0.792× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes</code> | 2.7426e+6 / 2.7426e+6 bytes | 2.7328e+6 / 2.7328e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].stat</code> | 1.7565 / 1.8084 ms | 1.5397 / 1.5857 ms | 0.877× | 0.877× | faster |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].stat</code> | 1.8455 / 1.9379 ms | 1.5665 / 2.1020 ms | 0.849× | 1.085× | faster |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].stat</code> | 1.9716 / 2.0910 ms | 1.6200 / 1.6766 ms | 0.822× | 0.802× | faster |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].stat</code> | 3.1700 / 3.2538 ms | 3.1602 / 3.4130 ms | 0.997× | 1.049× | faster |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.6833 / 4.2529 ms | 3.3683 / 3.4260 ms | 0.914× | 0.806× | faster |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].stat</code> | 2.0880 / 2.3567 ms | 2.2318 / 2.7710 ms | 1.069× | 1.176× | within-noise |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].stat</code> | 8.2591 / 8.2971 ms | 5.4160 / 5.9063 ms | 0.656× | 0.712× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes</code> | 1.2187e+6 / 1.2187e+6 bytes | 1.1912e+6 / 1.1912e+6 bytes | 0.977× | 0.977× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].stat</code> | 1.0212 / 1.1247 ms | 0.78083 / 0.86581 ms | 0.765× | 0.770× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0726e+6 / 1.0726e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].stat</code> | 1.1229 / 1.1530 ms | 0.86045 / 0.86860 ms | 0.766× | 0.753× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0716e+6 / 1.0716e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].stat</code> | 1.4980 / 1.5182 ms | 1.2313 / 1.2734 ms | 0.822× | 0.839× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0715e+6 / 1.0715e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].stat</code> | 1.6252 / 1.7434 ms | 1.3133 / 1.3220 ms | 0.808× | 0.758× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0725e+6 / 1.0725e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].stat</code> | 1.2713 / 1.4005 ms | 0.95554 / 1.0599 ms | 0.752× | 0.757× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].stat</code> | 53.808 / 55.144 ms | 22.021 / 22.782 ms | 0.409× | 0.413× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].stat</code> | 0.30881 / 0.35827 ms | 0.14246 / 0.15686 ms | 0.461× | 0.438× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].stat</code> | 1.0820 / 1.1070 ms | 0.83065 / 0.85592 ms | 0.768× | 0.773× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].stat</code> | 1.4834 / 1.5230 ms | 1.1906 / 1.7871 ms | 0.803× | 1.173× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].stat</code> | 1.6391 / 1.7859 ms | 1.3201 / 1.3499 ms | 0.805× | 0.756× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].stat</code> | 1.2526 / 1.3839 ms | 0.93566 / 0.93978 ms | 0.747× | 0.679× | faster |

### formula-default-results.json

Status: **compared**. Baseline: **0.5.4 engine (WASM) under 0.6 core and harness**. Baseline capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].allocationStat.retainedBytes</code> | 2.6122e+6 / 2.6122e+6 bytes | 2.6027e+6 / 2.6027e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=countif-100k;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].stat</code> | 0.94184 / 0.96398 ms | 0.89046 / 0.91453 ms | 0.945× | 0.949× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2176e+6 / 5.2176e+6 bytes | 5.2034e+6 / 5.2034e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].stat</code> | 5.5009 / 7.7854 ms | 5.1587 / 5.4453 ms | 0.938× | 0.699× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].stat</code> | 1.6186 / 1.6618 ms | 1.5929 / 1.6788 ms | 0.984× | 1.010× | faster |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes</code> | 6.3990e+5 / 6.3990e+5 bytes | 6.1665e+5 / 6.1665e+5 bytes | 0.964× | 0.964× | faster |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].stat</code> | 0.53491 / 0.83419 ms | 0.28126 / 0.29021 ms | 0.526× | 0.348× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].allocationStat.retainedBytes</code> | 7.4499e+5 / 7.4499e+5 bytes | 6.9908e+5 / 6.9908e+5 bytes | 0.938× | 0.938× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].stat</code> | 1.3988 / 1.4753 ms | 0.48108 / 0.54393 ms | 0.344× | 0.369× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].allocationStat.retainedBytes</code> | 43094 / 43094 bytes | 37290 / 37290 bytes | 0.865× | 0.865× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].stat</code> | 0.088323 / 0.10124 ms | 0.043291 / 0.054448 ms | 0.490× | 0.538× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes</code> | 8.6510e+5 / 8.6510e+5 bytes | 8.3719e+5 / 8.3719e+5 bytes | 0.968× | 0.968× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].stat</code> | 0.012602 / 0.019544 ms | 0.013225 / 0.022577 ms | 1.049× | 1.155× | within-noise |
| <code>workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].allocationStat.retainedBytes</code> | 3.1478e+5 / 3.1478e+5 bytes | 2.8321e+5 / 2.8321e+5 bytes | 0.900× | 0.900× | faster |
| <code>workloads[id=error-propagation;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].stat</code> | 0.73390 / 0.75356 ms | 0.25497 / 0.25619 ms | 0.347× | 0.340× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes</code> | 5.7667e+7 / 5.7667e+7 bytes | 5.5939e+7 / 5.5939e+7 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].stat</code> | 0.029323 / 0.043606 ms | 0.030421 / 0.037396 ms | 1.037× | 0.858× | within-noise |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes</code> | 7.5508e+7 / 7.5508e+7 bytes | 7.2063e+7 / 7.2063e+7 bytes | 0.954× | 0.954× | faster |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].stat</code> | 0.020408 / 0.025784 ms | 0.019001 / 0.024440 ms | 0.931× | 0.948× | faster |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes</code> | 3.8408e+7 / 3.8408e+7 bytes | 3.6683e+7 / 3.6683e+7 bytes | 0.955× | 0.955× | faster |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].stat</code> | 80.289 / 86.278 ms | 40.053 / 42.467 ms | 0.499× | 0.492× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].stat</code> | 4.7769 / 4.9035 ms | 2.7510 / 2.8356 ms | 0.576× | 0.578× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes</code> | 4.7278e+5 / 4.7278e+5 bytes | 4.4531e+5 / 4.4531e+5 bytes | 0.942× | 0.942× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].stat</code> | 0.71886 / 1.0643 ms | 0.43841 / 0.54043 ms | 0.610× | 0.508× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes</code> | 2.9934e+7 / 2.9934e+7 bytes | 2.9015e+7 / 2.9015e+7 bytes | 0.969× | 0.969× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].stat</code> | 54.010 / 54.495 ms | 59.658 / 59.905 ms | 1.105× | 1.099× | within-noise |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes</code> | 3.2867e+6 / 3.2867e+6 bytes | 3.1713e+6 / 3.1713e+6 bytes | 0.965× | 0.965× | faster |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].stat</code> | 7.2078 / 7.5983 ms | 6.3303 / 6.6335 ms | 0.878× | 0.873× | faster |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes</code> | 3.6762e+5 / 3.6762e+5 bytes | 3.5255e+5 / 3.5255e+5 bytes | 0.959× | 0.959× | faster |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].stat</code> | 0.85618 / 0.94346 ms | 1.1405 / 1.5680 ms | 1.332× | 1.662× | within-noise |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes</code> | 8.9966e+5 / 8.9966e+5 bytes | 8.7229e+5 / 8.7229e+5 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].stat</code> | 3.1294 / 3.1466 ms | 2.8527 / 2.8755 ms | 0.912× | 0.914× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].allocationStat.retainedBytes</code> | 5.2175e+6 / 5.2175e+6 bytes | 5.2033e+6 / 5.2033e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].stat</code> | 1.6504 / 1.7015 ms | 1.7080 / 1.7675 ms | 1.035× | 1.039× | within-noise |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes</code> | 2.6126e+6 / 2.6126e+6 bytes | 2.6031e+6 / 2.6031e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].stat</code> | 0.58148 / 0.64252 ms | 0.51018 / 0.51371 ms | 0.877× | 0.800× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].allocationStat.retainedBytes</code> | 13761 / 13761 bytes | 8629.0 / 8629.0 bytes | 0.627× | 0.627× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].stat</code> | 0.023186 / 0.028575 ms | 0.016231 / 0.019062 ms | 0.700× | 0.667× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].allocationStat.retainedBytes</code> | 21029 / 21029 bytes | 15673 / 15673 bytes | 0.745× | 0.745× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].stat</code> | 0.041298 / 0.047767 ms | 0.029290 / 0.031550 ms | 0.709× | 0.660× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].allocationStat.retainedBytes</code> | 35565 / 35565 bytes | 29761 / 29761 bytes | 0.837× | 0.837× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].stat</code> | 0.069478 / 0.077201 ms | 0.038327 / 0.039529 ms | 0.552× | 0.512× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].allocationStat.retainedBytes</code> | 9219.0 / 9219.0 bytes | 4255.0 / 4255.0 bytes | 0.462× | 0.462× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].stat</code> | 0.015479 / 0.034255 ms | 0.022497 / 0.037623 ms | 1.453× | 1.098× | within-noise |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2172e+6 / 5.2172e+6 bytes | 5.2029e+6 / 5.2029e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].stat</code> | 1.7345 / 1.7886 ms | 1.7130 / 1.7697 ms | 0.988× | 0.989× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes</code> | 3.9150e+6 / 3.9150e+6 bytes | 3.9031e+6 / 3.9031e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].stat</code> | 3.1543 / 3.1791 ms | 2.8323 / 2.8634 ms | 0.898× | 0.901× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes</code> | 2.3625e+5 / 2.3625e+5 bytes | 1.9677e+5 / 1.9677e+5 bytes | 0.833× | 0.833× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].stat</code> | 0.41662 / 0.42178 ms | 0.19993 / 0.20887 ms | 0.480× | 0.495× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].stat</code> | 0.0032190 / 0.0040934 ms | 0.0028330 / 0.0032842 ms | 0.880× | 0.802× | faster |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].stat</code> | 57.523 / 58.592 ms | 20.665 / 21.570 ms | 0.359× | 0.368× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].stat</code> | 0.31252 / 0.32642 ms | 0.14218 / 0.28975 ms | 0.455× | 0.888× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes</code> | 7355.0 / 7355.0 bytes | 2423.0 / 2423.0 bytes | 0.329× | 0.329× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].stat</code> | 0.0032650 / 0.0067822 ms | 0.0037090 / 0.0039654 ms | 1.136× | 0.585× | within-noise |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes</code> | 5.3056e+5 / 5.3056e+5 bytes | 5.0319e+5 / 5.0319e+5 bytes | 0.948× | 0.948× | faster |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].stat</code> | 0.63292 / 0.90536 ms | 0.25259 / 0.29934 ms | 0.399× | 0.331× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes</code> | 4.8000e+6 / 4.8000e+6 bytes | 4.8000e+6 / 4.8000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes</code> | 6.6631e+6 / 6.6631e+6 bytes | 5.8525e+6 / 5.8525e+6 bytes | 0.878× | 0.878× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations</code> | 3.0000 / 3.0000 count | 3.0000 / 3.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].stat</code> | 22.309 / 22.824 ms | 10.627 / 11.354 ms | 0.476× | 0.497× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes</code> | 4.0581e+6 / 4.0581e+6 bytes | 3.2521e+6 / 3.2521e+6 bytes | 0.801× | 0.801× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations</code> | 1.0000 / 1.0000 count | 1.0000 / 1.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].stat</code> | 11.050 / 11.275 ms | 4.3586 / 4.4363 ms | 0.394× | 0.393× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes</code> | 3.9146e+6 / 3.9146e+6 bytes | 3.9027e+6 / 3.9027e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].stat</code> | 3.8991 / 4.1905 ms | 4.3625 / 4.3922 ms | 1.119× | 1.048× | within-noise |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes</code> | 6.5198e+6 / 6.5198e+6 bytes | 6.5032e+6 / 6.5032e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].stat</code> | 6.1393 / 6.2006 ms | 5.6109 / 5.8323 ms | 0.914× | 0.941× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes</code> | 2.7426e+6 / 2.7426e+6 bytes | 2.7328e+6 / 2.7328e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].stat</code> | 1.7209 / 3.0118 ms | 1.8251 / 1.8563 ms | 1.061× | 0.616× | within-noise |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].stat</code> | 1.8171 / 2.9387 ms | 1.8778 / 1.8959 ms | 1.033× | 0.645× | within-noise |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].stat</code> | 1.9308 / 2.0103 ms | 1.9410 / 1.9639 ms | 1.005× | 0.977× | within-noise |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].stat</code> | 3.2624 / 3.3133 ms | 3.3867 / 3.4269 ms | 1.038× | 1.034× | within-noise |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1992 / 3.2919 ms | 4.0162 / 4.4550 ms | 1.255× | 1.353× | regression |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].stat</code> | 2.1121 / 2.1370 ms | 2.5762 / 2.6466 ms | 1.220× | 1.238× | within-noise |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].stat</code> | 8.1226 / 8.2985 ms | 6.0200 / 6.1468 ms | 0.741× | 0.741× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes</code> | 1.2187e+6 / 1.2187e+6 bytes | 1.1912e+6 / 1.1912e+6 bytes | 0.977× | 0.977× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].stat</code> | 1.0114 / 1.0895 ms | 0.80370 / 0.85732 ms | 0.795× | 0.787× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0726e+6 / 1.0726e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].stat</code> | 1.1355 / 1.1595 ms | 0.81719 / 0.82568 ms | 0.720× | 0.712× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0716e+6 / 1.0716e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].stat</code> | 1.5175 / 1.5367 ms | 1.2452 / 1.2883 ms | 0.821× | 0.838× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0715e+6 / 1.0715e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].stat</code> | 1.6533 / 1.6693 ms | 1.3080 / 2.0185 ms | 0.791× | 1.209× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0725e+6 / 1.0725e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].stat</code> | 1.3043 / 1.3777 ms | 0.92089 / 1.0532 ms | 0.706× | 0.764× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].stat</code> | 52.249 / 55.278 ms | 21.863 / 22.369 ms | 0.418× | 0.405× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].stat</code> | 0.31316 / 0.34760 ms | 0.15202 / 0.15936 ms | 0.485× | 0.458× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].stat</code> | 1.1139 / 1.1393 ms | 0.82906 / 0.85000 ms | 0.744× | 0.746× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].stat</code> | 1.5480 / 1.6785 ms | 1.2521 / 1.3178 ms | 0.809× | 0.785× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].stat</code> | 1.6646 / 1.8736 ms | 1.3475 / 1.4554 ms | 0.810× | 0.777× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].stat</code> | 1.2839 / 1.2898 ms | 0.89980 / 0.90660 ms | 0.701× | 0.703× | faster |

### formula-full-results.json

Status: **compared**. Baseline: **0.5.4 engine (WASM) under 0.6 core and harness**. Baseline capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:25 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].allocationStat.retainedBytes</code> | 2.6122e+6 / 2.6122e+6 bytes | 2.6027e+6 / 2.6027e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=countif-100k;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=countif-100k;size=100000].stat</code> | 1.0919 / 1.1314 ms | 0.91261 / 0.97324 ms | 0.836× | 0.860× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2176e+6 / 5.2176e+6 bytes | 5.2034e+6 / 5.2034e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-multi-range-edit;size=100000].stat</code> | 5.4541 / 5.5387 ms | 4.8386 / 4.9724 ms | 0.887× | 0.898× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=criteria-range-edit;size=100000].stat</code> | 1.6157 / 1.6404 ms | 1.5621 / 1.5963 ms | 0.967× | 0.973× | faster |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes</code> | 6.3990e+5 / 6.3990e+5 bytes | 6.1665e+5 / 6.1665e+5 bytes | 0.964× | 0.964× | faster |
| <code>workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cross-sheet-range-edit;size=1000].stat</code> | 0.51481 / 0.52156 ms | 0.26478 / 0.30745 ms | 0.514× | 0.589× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].allocationStat.retainedBytes</code> | 7.4499e+5 / 7.4499e+5 bytes | 6.9908e+5 / 6.9908e+5 bytes | 0.938× | 0.938× | faster |
| <code>workloads[id=cycles;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=cycles;size=1000].stat</code> | 1.3574 / 1.4264 ms | 0.46179 / 0.47318 ms | 0.340× | 0.332× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].allocationStat.retainedBytes</code> | 43094 / 43094 bytes | 37290 / 37290 bytes | 0.865× | 0.865× | faster |
| <code>workloads[id=diamond-edit;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=diamond-edit;size=32].stat</code> | 0.096689 / 0.10534 ms | 0.042517 / 0.063147 ms | 0.440× | 0.599× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes</code> | 8.6510e+5 / 8.6510e+5 bytes | 8.3719e+5 / 8.3719e+5 bytes | 0.968× | 0.968× | faster |
| <code>workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=distinct-range-edit;size=1000].stat</code> | 0.012186 / 0.019463 ms | 0.019291 / 0.025174 ms | 1.583× | 1.293× | within-noise |
| <code>workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].allocationStat.retainedBytes</code> | 3.1478e+5 / 3.1478e+5 bytes | 2.8321e+5 / 2.8321e+5 bytes | 0.900× | 0.900× | faster |
| <code>workloads[id=error-propagation;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=error-propagation;size=1000].stat</code> | 0.74040 / 0.91064 ms | 0.24726 / 0.25241 ms | 0.334× | 0.277× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes</code> | 5.7667e+7 / 5.7667e+7 bytes | 5.5939e+7 / 5.5939e+7 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=formula-constant-edit;size=100000].stat</code> | 0.033246 / 0.039485 ms | 0.031785 / 0.037816 ms | 0.956× | 0.958× | faster |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes</code> | 7.5508e+7 / 7.5508e+7 bytes | 7.2063e+7 / 7.2063e+7 bytes | 0.954× | 0.954× | faster |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=incremental-dependency-closure-edit;size=100000].stat</code> | 0.021021 / 0.030474 ms | 0.019607 / 0.027386 ms | 0.933× | 0.899× | faster |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes</code> | 3.8408e+7 / 3.8408e+7 bytes | 3.6683e+7 / 3.6683e+7 bytes | 0.955× | 0.955× | faster |
| <code>workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=100000].stat</code> | 80.068 / 86.655 ms | 38.995 / 40.528 ms | 0.487× | 0.468× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=10000].stat</code> | 4.9398 / 5.3880 ms | 2.2913 / 2.3271 ms | 0.464× | 0.432× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes</code> | 4.7278e+5 / 4.7278e+5 bytes | 4.4531e+5 / 4.4531e+5 bytes | 0.942× | 0.942× | faster |
| <code>workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-first-recompute;size=1000].stat</code> | 0.63458 / 0.93337 ms | 0.43713 / 0.46681 ms | 0.689× | 0.500× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes</code> | 2.9934e+7 / 2.9934e+7 bytes | 2.9015e+7 / 2.9015e+7 bytes | 0.969× | 0.969× | faster |
| <code>workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=100000].stat</code> | 53.552 / 54.550 ms | 53.486 / 53.938 ms | 0.999× | 0.989× | faster |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes</code> | 3.2867e+6 / 3.2867e+6 bytes | 3.1713e+6 / 3.1713e+6 bytes | 0.965× | 0.965× | faster |
| <code>workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=10000].stat</code> | 5.9817 / 6.7530 ms | 5.8018 / 7.1154 ms | 0.970× | 1.054× | faster |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes</code> | 3.6762e+5 / 3.6762e+5 bytes | 3.5255e+5 / 3.5255e+5 bytes | 0.959× | 0.959× | faster |
| <code>workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=independent-parse-load;size=1000].stat</code> | 0.82593 / 0.95638 ms | 1.2095 / 1.5702 ms | 1.464× | 1.642× | regression |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes</code> | 8.9966e+5 / 8.9966e+5 bytes | 8.7229e+5 / 8.7229e+5 bytes | 0.970× | 0.970× | faster |
| <code>workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=iterative-finance;size=1000].stat</code> | 3.6023 / 5.3588 ms | 3.0177 / 3.3813 ms | 0.838× | 0.631× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].allocationStat.retainedBytes</code> | 5.2175e+6 / 5.2175e+6 bytes | 5.2033e+6 / 5.2033e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=let-repeat;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-repeat;size=100000].stat</code> | 1.8774 / 1.9938 ms | 1.7982 / 2.0992 ms | 0.958× | 1.053× | faster |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes</code> | 2.6126e+6 / 2.6126e+6 bytes | 2.6031e+6 / 2.6031e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=let-reuse-edit;size=100000].stat</code> | 0.55241 / 0.58710 ms | 0.50930 / 0.58361 ms | 0.922× | 0.994× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].allocationStat.retainedBytes</code> | 13761 / 13761 bytes | 8629.0 / 8629.0 bytes | 0.627× | 0.627× | faster |
| <code>workloads[id=linear-chain;size=16].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=16].stat</code> | 0.024626 / 0.026690 ms | 0.017114 / 0.019927 ms | 0.695× | 0.747× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].allocationStat.retainedBytes</code> | 21029 / 21029 bytes | 15673 / 15673 bytes | 0.745× | 0.745× | faster |
| <code>workloads[id=linear-chain;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=32].stat</code> | 0.060176 / 0.068397 ms | 0.029435 / 0.030547 ms | 0.489× | 0.447× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].allocationStat.retainedBytes</code> | 35565 / 35565 bytes | 29761 / 29761 bytes | 0.837× | 0.837× | faster |
| <code>workloads[id=linear-chain;size=64].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=64].stat</code> | 0.11241 / 0.12325 ms | 0.036096 / 0.036894 ms | 0.321× | 0.299× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].allocationStat.retainedBytes</code> | 9219.0 / 9219.0 bytes | 4255.0 / 4255.0 bytes | 0.462× | 0.462× | faster |
| <code>workloads[id=linear-chain;size=8].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=linear-chain;size=8].stat</code> | 0.015976 / 0.034148 ms | 0.016869 / 0.032274 ms | 1.056× | 0.945× | within-noise |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2172e+6 / 5.2172e+6 bytes | 5.2029e+6 / 5.2029e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=lookup-range-edit;size=100000].stat</code> | 1.7561 / 1.8707 ms | 1.6660 / 1.7232 ms | 0.949× | 0.921× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes</code> | 3.9150e+6 / 3.9150e+6 bytes | 3.9031e+6 / 3.9031e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=percentile-covariance;size=100000].stat</code> | 3.6413 / 3.7420 ms | 2.9327 / 3.0598 ms | 0.805× | 0.818× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes</code> | 2.3625e+5 / 2.3625e+5 bytes | 1.9677e+5 / 1.9677e+5 bytes | 0.833× | 0.833× | faster |
| <code>workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=removed-sheet-ref;size=1000].stat</code> | 0.40729 / 0.41899 ms | 0.20420 / 0.20858 ms | 0.501× | 0.498× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-0;size=1000].stat</code> | 0.0027620 / 0.0030144 ms | 0.0027900 / 0.0035496 ms | 1.010× | 1.178× | within-noise |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-100000;size=100000].stat</code> | 52.512 / 53.365 ms | 20.654 / 21.030 ms | 0.393× | 0.394× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1000;size=1000].stat</code> | 0.31395 / 0.32591 ms | 0.18823 / 0.25984 ms | 0.600× | 0.797× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes</code> | 7355.0 / 7355.0 bytes | 2423.0 / 2423.0 bytes | 0.329× | 0.329× | faster |
| <code>workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=scalar-edit-affects-1;size=1].stat</code> | 0.0038400 / 0.0069782 ms | 0.0040940 / 0.0057812 ms | 1.066× | 0.828× | within-noise |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes</code> | 5.3056e+5 / 5.3056e+5 bytes | 5.0319e+5 / 5.0319e+5 bytes | 0.948× | 0.948× | faster |
| <code>workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=shared-range-edit;size=1000].stat</code> | 0.50004 / 0.52032 ms | 0.24755 / 0.27676 ms | 0.495× | 0.532× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes</code> | 4.8000e+6 / 4.8000e+6 bytes | 4.8000e+6 / 4.8000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes</code> | 6.6631e+6 / 6.6631e+6 bytes | 5.8525e+6 / 5.8525e+6 bytes | 0.878× | 0.878× | faster |
| <code>workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations</code> | 3.0000 / 3.0000 count | 3.0000 / 3.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-filter-resize;size=100000].stat</code> | 21.775 / 21.920 ms | 10.544 / 10.597 ms | 0.484× | 0.483× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes</code> | 4.0581e+6 / 4.0581e+6 bytes | 3.2521e+6 / 3.2521e+6 bytes | 0.801× | 0.801× | faster |
| <code>workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations</code> | 1.0000 / 1.0000 count | 1.0000 / 1.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=spill-sequence-admission;size=100000].stat</code> | 11.283 / 11.550 ms | 5.3421 / 5.4349 ms | 0.473× | 0.471× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes</code> | 3.9146e+6 / 3.9146e+6 bytes | 3.9027e+6 / 3.9027e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sum-multi-range;size=100000].stat</code> | 3.9421 / 4.1800 ms | 3.7902 / 3.9289 ms | 0.961× | 0.940× | faster |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes</code> | 6.5198e+6 / 6.5198e+6 bytes | 6.5032e+6 / 6.5032e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumifs-3-criteria;size=100000].stat</code> | 6.4648 / 6.7985 ms | 5.9883 / 6.0432 ms | 0.926× | 0.889× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes</code> | 2.7426e+6 / 2.7426e+6 bytes | 2.7328e+6 / 2.7328e+6 bytes | 0.996× | 0.996× | faster |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-matrix-edit;size=100000].stat</code> | 1.6970 / 1.7586 ms | 1.5779 / 1.6345 ms | 0.930× | 0.929× | faster |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=sumproduct-vector-edit;size=100000].stat</code> | 2.1983 / 2.3374 ms | 2.0027 / 2.0769 ms | 0.911× | 0.889× | faster |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-edit;size=1000].stat</code> | 2.1929 / 2.9639 ms | 1.6661 / 1.6841 ms | 0.760× | 0.568× | faster |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted-edit;size=1000].stat</code> | 3.1362 / 3.2748 ms | 2.7925 / 2.8940 ms | 0.890× | 0.884× | faster |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1760 / 3.8260 ms | 3.3055 / 3.3675 ms | 1.041× | 0.880× | within-noise |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=text-lookup-many;size=1000].stat</code> | 2.1185 / 2.1745 ms | 2.4491 / 3.2150 ms | 1.156× | 1.478× | regression |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=topology-remove-add;size=10000].stat</code> | 8.2853 / 8.9032 ms | 5.3522 / 5.4001 ms | 0.646× | 0.607× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes</code> | 1.2187e+6 / 1.2187e+6 bytes | 1.1912e+6 / 1.1912e+6 bytes | 0.977× | 0.977× | faster |
| <code>workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=unicode-text-date-edit;size=1000].stat</code> | 1.0871 / 1.2655 ms | 0.95259 / 0.97821 ms | 0.876× | 0.773× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0726e+6 / 1.0726e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-edit;size=1000].stat</code> | 1.1319 / 1.1494 ms | 0.81383 / 0.82191 ms | 0.719× | 0.715× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0716e+6 / 1.0716e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted-edit;size=1000].stat</code> | 1.4958 / 1.5462 ms | 1.2142 / 1.2237 ms | 0.812× | 0.791× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0715e+6 / 1.0715e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many-sorted;size=1000].stat</code> | 1.6164 / 1.6240 ms | 1.2853 / 1.2981 ms | 0.795× | 0.799× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0725e+6 / 1.0725e+6 bytes | 0.974× | 0.974× | faster |
| <code>workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=vlookup-many;size=1000].stat</code> | 1.2874 / 1.3719 ms | 0.89818 / 0.99310 ms | 0.698× | 0.724× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=100000].stat</code> | 53.535 / 56.833 ms | 21.340 / 21.427 ms | 0.399× | 0.377× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=wide-fan-out-edit;size=1000].stat</code> | 0.53145 / 0.54271 ms | 0.13497 / 0.15091 ms | 0.254× | 0.278× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-edit;size=1000].stat</code> | 1.1244 / 1.1376 ms | 0.82728 / 0.83456 ms | 0.736× | 0.734× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted-edit;size=1000].stat</code> | 1.5635 / 1.5699 ms | 1.2980 / 1.3108 ms | 0.830× | 0.835× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many-sorted;size=1000].stat</code> | 1.7043 / 1.7114 ms | 1.3455 / 1.3564 ms | 0.789× | 0.793× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>workloads[id=xlookup-many;size=1000].stat</code> | 1.2489 / 1.2777 ms | 0.90879 / 0.93940 ms | 0.728× | 0.735× | faster |

### full-engine-results.json

Status: **compared**. Baseline: **0.5.4 engine (WASM) under 0.6 core and harness**. Baseline capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>analysis[id=dsum;size=1000].allocationStat.peakTransientBytes</code> | 3264.0 / 3264.0 bytes | 3264.0 / 3264.0 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=dsum;size=1000].allocationStat.retainedBytes</code> | 6.1406e+5 / 6.1406e+5 bytes | 5.8656e+5 / 5.8656e+5 bytes | 0.955× | 0.955× | faster |
| <code>analysis[id=dsum;size=1000].allocationStat.transientAllocations</code> | 2000.0 / 2000.0 count | 2000.0 / 2000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=dsum;size=1000].stat</code> | 2.9984 / 4.9566 ms | 2.9588 / 3.1783 ms | 0.987× | 0.641× | faster |
| <code>analysis[id=linest;size=1000].allocationStat.peakTransientBytes</code> | 3232.0 / 3232.0 bytes | 3232.0 / 3232.0 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=linest;size=1000].allocationStat.retainedBytes</code> | 7.9895e+5 / 7.9895e+5 bytes | 7.7145e+5 / 7.7145e+5 bytes | 0.966× | 0.966× | faster |
| <code>analysis[id=linest;size=1000].allocationStat.transientAllocations</code> | 3000.0 / 3000.0 count | 3000.0 / 3000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=linest;size=1000].stat</code> | 4.4305 / 6.3004 ms | 3.8037 / 5.9950 ms | 0.859× | 0.952× | faster |
| <code>analysis[id=map-reduce;size=1000].allocationStat.peakTransientBytes</code> | 3200.0 / 3200.0 bytes | 3200.0 / 3200.0 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=map-reduce;size=1000].allocationStat.retainedBytes</code> | 1.3926e+6 / 1.3926e+6 bytes | 1.3652e+6 / 1.3652e+6 bytes | 0.980× | 0.980× | faster |
| <code>analysis[id=map-reduce;size=1000].allocationStat.transientAllocations</code> | 3000.0 / 3000.0 count | 3000.0 / 3000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=map-reduce;size=1000].stat</code> | 22.573 / 22.765 ms | 22.572 / 23.107 ms | 1.000× | 1.015× | faster |
| <code>analysis[id=mmult;size=1000].allocationStat.peakTransientBytes</code> | 64.000 / 64.000 bytes | 64.000 / 64.000 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=mmult;size=1000].allocationStat.retainedBytes</code> | 7.9395e+5 / 7.9395e+5 bytes | 7.6645e+5 / 7.6645e+5 bytes | 0.965× | 0.965× | faster |
| <code>analysis[id=mmult;size=1000].allocationStat.transientAllocations</code> | 3000.0 / 3000.0 count | 3000.0 / 3000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=mmult;size=1000].stat</code> | 1.1385 / 1.1839 ms | 0.81957 / 0.92432 ms | 0.720× | 0.781× | faster |
| <code>analysis[id=mode-mult;size=1000].allocationStat.peakTransientBytes</code> | 64.000 / 64.000 bytes | 64.000 / 64.000 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=mode-mult;size=1000].allocationStat.retainedBytes</code> | 8.8318e+5 / 8.8318e+5 bytes | 8.5562e+5 / 8.5562e+5 bytes | 0.969× | 0.969× | faster |
| <code>analysis[id=mode-mult;size=1000].allocationStat.transientAllocations</code> | 6000.0 / 6000.0 count | 6000.0 / 6000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=mode-mult;size=1000].stat</code> | 1.0368 / 1.0539 ms | 0.80878 / 0.84013 ms | 0.780× | 0.797× | faster |
| <code>analysis[id=sortby;size=1000].allocationStat.peakTransientBytes</code> | 4800.0 / 4800.0 bytes | 4800.0 / 4800.0 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=sortby;size=1000].allocationStat.retainedBytes</code> | 8.5595e+5 / 8.5595e+5 bytes | 8.2845e+5 / 8.2845e+5 bytes | 0.968× | 0.968× | faster |
| <code>analysis[id=sortby;size=1000].allocationStat.transientAllocations</code> | 3000.0 / 3000.0 count | 3000.0 / 3000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=sortby;size=1000].stat</code> | 3.3895 / 3.7972 ms | 3.4557 / 4.4048 ms | 1.020× | 1.160× | within-noise |
| <code>analysis[id=textsplit-regexreplace;size=1000].allocationStat.peakTransientBytes</code> | 48.000 / 48.000 bytes | 48.000 / 48.000 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=textsplit-regexreplace;size=1000].allocationStat.retainedBytes</code> | 9.4018e+5 / 9.4018e+5 bytes | 9.1262e+5 / 9.1262e+5 bytes | 0.971× | 0.971× | faster |
| <code>analysis[id=textsplit-regexreplace;size=1000].allocationStat.transientAllocations</code> | 2000.0 / 2000.0 count | 2000.0 / 2000.0 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=textsplit-regexreplace;size=1000].stat</code> | 2.4738 / 2.5099 ms | 2.7676 / 2.8391 ms | 1.119× | 1.131× | within-noise |
| <code>analysis[id=xirr;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>analysis[id=xirr;size=1000].allocationStat.retainedBytes</code> | 5.9595e+5 / 5.9595e+5 bytes | 5.6845e+5 / 5.6845e+5 bytes | 0.954× | 0.954× | faster |
| <code>analysis[id=xirr;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>analysis[id=xirr;size=1000].stat</code> | 1.3617 / 2.0542 ms | 0.91585 / 1.3289 ms | 0.673× | 0.647× | faster |
| <code>engines[engine=default].initialization.stat</code> | Not captured | 4.2845 / 4.7350 ms | — | — | new-only · 0.6-only: timed current-core path; no version ratio |
| <code>engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.retainedBytes</code> | 2.6122e+6 / 2.6122e+6 bytes | 2.6027e+6 / 2.6027e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=countif-100k;size=100000].stat</code> | 0.94184 / 0.96398 ms | 0.89046 / 0.91453 ms | 0.945× | 0.949× | faster |
| <code>engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2176e+6 / 5.2176e+6 bytes | 5.2034e+6 / 5.2034e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].stat</code> | 5.5009 / 7.7854 ms | 5.1587 / 5.4453 ms | 0.938× | 0.699× | faster |
| <code>engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].stat</code> | 1.6186 / 1.6618 ms | 1.5929 / 1.6788 ms | 0.984× | 1.010× | faster |
| <code>engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes</code> | 6.3990e+5 / 6.3990e+5 bytes | 6.1665e+5 / 6.1665e+5 bytes | 0.964× | 0.964× | faster |
| <code>engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].stat</code> | 0.53491 / 0.83419 ms | 0.28126 / 0.29021 ms | 0.526× | 0.348× | faster |
| <code>engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.retainedBytes</code> | 7.4499e+5 / 7.4499e+5 bytes | 6.9908e+5 / 6.9908e+5 bytes | 0.938× | 0.938× | faster |
| <code>engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=cycles;size=1000].stat</code> | 1.3988 / 1.4753 ms | 0.48108 / 0.54393 ms | 0.344× | 0.369× | faster |
| <code>engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.retainedBytes</code> | 43094 / 43094 bytes | 37290 / 37290 bytes | 0.865× | 0.865× | faster |
| <code>engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=diamond-edit;size=32].stat</code> | 0.088323 / 0.10124 ms | 0.043291 / 0.054448 ms | 0.490× | 0.538× | faster |
| <code>engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes</code> | 8.6510e+5 / 8.6510e+5 bytes | 8.3719e+5 / 8.3719e+5 bytes | 0.968× | 0.968× | faster |
| <code>engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].stat</code> | 0.012602 / 0.019544 ms | 0.013225 / 0.022577 ms | 1.049× | 1.155× | within-noise |
| <code>engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.retainedBytes</code> | 3.1478e+5 / 3.1478e+5 bytes | 2.8321e+5 / 2.8321e+5 bytes | 0.900× | 0.900× | faster |
| <code>engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=error-propagation;size=1000].stat</code> | 0.73390 / 0.75356 ms | 0.25497 / 0.25619 ms | 0.347× | 0.340× | faster |
| <code>engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes</code> | 5.7667e+7 / 5.7667e+7 bytes | 5.5939e+7 / 5.5939e+7 bytes | 0.970× | 0.970× | faster |
| <code>engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].stat</code> | 0.029323 / 0.043606 ms | 0.030421 / 0.037396 ms | 1.037× | 0.858× | within-noise |
| <code>engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes</code> | 7.5508e+7 / 7.5508e+7 bytes | 7.2063e+7 / 7.2063e+7 bytes | 0.954× | 0.954× | faster |
| <code>engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].stat</code> | 0.020408 / 0.025784 ms | 0.019001 / 0.024440 ms | 0.931× | 0.948× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes</code> | 3.8408e+7 / 3.8408e+7 bytes | 3.6683e+7 / 3.6683e+7 bytes | 0.955× | 0.955× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].stat</code> | 80.289 / 86.278 ms | 40.053 / 42.467 ms | 0.499× | 0.492× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].stat</code> | 4.7769 / 4.9035 ms | 2.7510 / 2.8356 ms | 0.576× | 0.578× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes</code> | 4.7278e+5 / 4.7278e+5 bytes | 4.4531e+5 / 4.4531e+5 bytes | 0.942× | 0.942× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].stat</code> | 0.71886 / 1.0643 ms | 0.43841 / 0.54043 ms | 0.610× | 0.508× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes</code> | 2.9934e+7 / 2.9934e+7 bytes | 2.9015e+7 / 2.9015e+7 bytes | 0.969× | 0.969× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].stat</code> | 54.010 / 54.495 ms | 59.658 / 59.905 ms | 1.105× | 1.099× | within-noise |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes</code> | 3.2867e+6 / 3.2867e+6 bytes | 3.1713e+6 / 3.1713e+6 bytes | 0.965× | 0.965× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].stat</code> | 7.2078 / 7.5983 ms | 6.3303 / 6.6335 ms | 0.878× | 0.873× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes</code> | 3.6762e+5 / 3.6762e+5 bytes | 3.5255e+5 / 3.5255e+5 bytes | 0.959× | 0.959× | faster |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].stat</code> | 0.85618 / 0.94346 ms | 1.1405 / 1.5680 ms | 1.332× | 1.662× | within-noise |
| <code>engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes</code> | 8.9966e+5 / 8.9966e+5 bytes | 8.7229e+5 / 8.7229e+5 bytes | 0.970× | 0.970× | faster |
| <code>engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=iterative-finance;size=1000].stat</code> | 3.1294 / 3.1466 ms | 2.8527 / 2.8755 ms | 0.912× | 0.914× | faster |
| <code>engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.retainedBytes</code> | 5.2175e+6 / 5.2175e+6 bytes | 5.2033e+6 / 5.2033e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=let-repeat;size=100000].stat</code> | 1.6504 / 1.7015 ms | 1.7080 / 1.7675 ms | 1.035× | 1.039× | within-noise |
| <code>engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes</code> | 2.6126e+6 / 2.6126e+6 bytes | 2.6031e+6 / 2.6031e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].stat</code> | 0.58148 / 0.64252 ms | 0.51018 / 0.51371 ms | 0.877× | 0.800× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.retainedBytes</code> | 13761 / 13761 bytes | 8629.0 / 8629.0 bytes | 0.627× | 0.627× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=16].stat</code> | 0.023186 / 0.028575 ms | 0.016231 / 0.019062 ms | 0.700× | 0.667× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.retainedBytes</code> | 21029 / 21029 bytes | 15673 / 15673 bytes | 0.745× | 0.745× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=32].stat</code> | 0.041298 / 0.047767 ms | 0.029290 / 0.031550 ms | 0.709× | 0.660× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.retainedBytes</code> | 35565 / 35565 bytes | 29761 / 29761 bytes | 0.837× | 0.837× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=64].stat</code> | 0.069478 / 0.077201 ms | 0.038327 / 0.039529 ms | 0.552× | 0.512× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.retainedBytes</code> | 9219.0 / 9219.0 bytes | 4255.0 / 4255.0 bytes | 0.462× | 0.462× | faster |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=linear-chain;size=8].stat</code> | 0.015479 / 0.034255 ms | 0.022497 / 0.037623 ms | 1.453× | 1.098× | within-noise |
| <code>engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2172e+6 / 5.2172e+6 bytes | 5.2029e+6 / 5.2029e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].stat</code> | 1.7345 / 1.7886 ms | 1.7130 / 1.7697 ms | 0.988× | 0.989× | faster |
| <code>engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes</code> | 3.9150e+6 / 3.9150e+6 bytes | 3.9031e+6 / 3.9031e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].stat</code> | 3.1543 / 3.1791 ms | 2.8323 / 2.8634 ms | 0.898× | 0.901× | faster |
| <code>engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes</code> | 2.3625e+5 / 2.3625e+5 bytes | 1.9677e+5 / 1.9677e+5 bytes | 0.833× | 0.833× | faster |
| <code>engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].stat</code> | 0.41662 / 0.42178 ms | 0.19993 / 0.20887 ms | 0.480× | 0.495× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].stat</code> | 0.0032190 / 0.0040934 ms | 0.0028330 / 0.0032842 ms | 0.880× | 0.802× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].stat</code> | 57.523 / 58.592 ms | 20.665 / 21.570 ms | 0.359× | 0.368× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].stat</code> | 0.31252 / 0.32642 ms | 0.14218 / 0.28975 ms | 0.455× | 0.888× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes</code> | 7355.0 / 7355.0 bytes | 2423.0 / 2423.0 bytes | 0.329× | 0.329× | faster |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].stat</code> | 0.0032650 / 0.0067822 ms | 0.0037090 / 0.0039654 ms | 1.136× | 0.585× | within-noise |
| <code>engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes</code> | 5.3056e+5 / 5.3056e+5 bytes | 5.0319e+5 / 5.0319e+5 bytes | 0.948× | 0.948× | faster |
| <code>engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].stat</code> | 0.63292 / 0.90536 ms | 0.25259 / 0.29934 ms | 0.399× | 0.331× | faster |
| <code>engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes</code> | 4.8000e+6 / 4.8000e+6 bytes | 4.8000e+6 / 4.8000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes</code> | 6.6631e+6 / 6.6631e+6 bytes | 5.8525e+6 / 5.8525e+6 bytes | 0.878× | 0.878× | faster |
| <code>engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations</code> | 3.0000 / 3.0000 count | 3.0000 / 3.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].stat</code> | 22.309 / 22.824 ms | 10.627 / 11.354 ms | 0.476× | 0.497× | faster |
| <code>engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes</code> | 4.0581e+6 / 4.0581e+6 bytes | 3.2521e+6 / 3.2521e+6 bytes | 0.801× | 0.801× | faster |
| <code>engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations</code> | 1.0000 / 1.0000 count | 1.0000 / 1.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].stat</code> | 11.050 / 11.275 ms | 4.3586 / 4.4363 ms | 0.394× | 0.393× | faster |
| <code>engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes</code> | 3.9146e+6 / 3.9146e+6 bytes | 3.9027e+6 / 3.9027e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].stat</code> | 3.8991 / 4.1905 ms | 4.3625 / 4.3922 ms | 1.119× | 1.048× | within-noise |
| <code>engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes</code> | 6.5198e+6 / 6.5198e+6 bytes | 6.5032e+6 / 6.5032e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].stat</code> | 6.1393 / 6.2006 ms | 5.6109 / 5.8323 ms | 0.914× | 0.941× | faster |
| <code>engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes</code> | 2.7426e+6 / 2.7426e+6 bytes | 2.7328e+6 / 2.7328e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].stat</code> | 1.7209 / 3.0118 ms | 1.8251 / 1.8563 ms | 1.061× | 0.616× | within-noise |
| <code>engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].stat</code> | 1.8171 / 2.9387 ms | 1.8778 / 1.8959 ms | 1.033× | 0.645× | within-noise |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].stat</code> | 1.9308 / 2.0103 ms | 1.9410 / 1.9639 ms | 1.005× | 0.977× | within-noise |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].stat</code> | 3.2624 / 3.3133 ms | 3.3867 / 3.4269 ms | 1.038× | 1.034× | within-noise |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1992 / 3.2919 ms | 4.0162 / 4.4550 ms | 1.255× | 1.353× | regression |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].stat</code> | 2.1121 / 2.1370 ms | 2.5762 / 2.6466 ms | 1.220× | 1.238× | within-noise |
| <code>engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].stat</code> | 8.1226 / 8.2985 ms | 6.0200 / 6.1468 ms | 0.741× | 0.741× | faster |
| <code>engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes</code> | 1.2187e+6 / 1.2187e+6 bytes | 1.1912e+6 / 1.1912e+6 bytes | 0.977× | 0.977× | faster |
| <code>engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].stat</code> | 1.0114 / 1.0895 ms | 0.80370 / 0.85732 ms | 0.795× | 0.787× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0726e+6 / 1.0726e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].stat</code> | 1.1355 / 1.1595 ms | 0.81719 / 0.82568 ms | 0.720× | 0.712× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0716e+6 / 1.0716e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].stat</code> | 1.5175 / 1.5367 ms | 1.2452 / 1.2883 ms | 0.821× | 0.838× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0715e+6 / 1.0715e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].stat</code> | 1.6533 / 1.6693 ms | 1.3080 / 2.0185 ms | 0.791× | 1.209× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0725e+6 / 1.0725e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=vlookup-many;size=1000].stat</code> | 1.3043 / 1.3777 ms | 0.92089 / 1.0532 ms | 0.706× | 0.764× | faster |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].stat</code> | 52.249 / 55.278 ms | 21.863 / 22.369 ms | 0.418× | 0.405× | faster |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].stat</code> | 0.31316 / 0.34760 ms | 0.15202 / 0.15936 ms | 0.485× | 0.458× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].stat</code> | 1.1139 / 1.1393 ms | 0.82906 / 0.85000 ms | 0.744× | 0.746× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].stat</code> | 1.5480 / 1.6785 ms | 1.2521 / 1.3178 ms | 0.809× | 0.785× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].stat</code> | 1.6646 / 1.8736 ms | 1.3475 / 1.4554 ms | 0.810× | 0.777× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=default].shared.workloads[id=xlookup-many;size=1000].stat</code> | 1.2839 / 1.2898 ms | 0.89980 / 0.90660 ms | 0.701× | 0.703× | faster |
| <code>engines[engine=full].initialization.stat</code> | Not captured | 5.7654 / 6.2635 ms | — | — | new-only · 0.6-only: timed current-core path; no version ratio |
| <code>engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.retainedBytes</code> | 2.6122e+6 / 2.6122e+6 bytes | 2.6027e+6 / 2.6027e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=countif-100k;size=100000].stat</code> | 1.0919 / 1.1314 ms | 0.91261 / 0.97324 ms | 0.836× | 0.860× | faster |
| <code>engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2176e+6 / 5.2176e+6 bytes | 5.2034e+6 / 5.2034e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].stat</code> | 5.4541 / 5.5387 ms | 4.8386 / 4.9724 ms | 0.887× | 0.898× | faster |
| <code>engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].stat</code> | 1.6157 / 1.6404 ms | 1.5621 / 1.5963 ms | 0.967× | 0.973× | faster |
| <code>engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes</code> | 6.3990e+5 / 6.3990e+5 bytes | 6.1665e+5 / 6.1665e+5 bytes | 0.964× | 0.964× | faster |
| <code>engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].stat</code> | 0.51481 / 0.52156 ms | 0.26478 / 0.30745 ms | 0.514× | 0.589× | faster |
| <code>engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.retainedBytes</code> | 7.4499e+5 / 7.4499e+5 bytes | 6.9908e+5 / 6.9908e+5 bytes | 0.938× | 0.938× | faster |
| <code>engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=cycles;size=1000].stat</code> | 1.3574 / 1.4264 ms | 0.46179 / 0.47318 ms | 0.340× | 0.332× | faster |
| <code>engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.retainedBytes</code> | 43094 / 43094 bytes | 37290 / 37290 bytes | 0.865× | 0.865× | faster |
| <code>engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=diamond-edit;size=32].stat</code> | 0.096689 / 0.10534 ms | 0.042517 / 0.063147 ms | 0.440× | 0.599× | faster |
| <code>engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes</code> | 8.6510e+5 / 8.6510e+5 bytes | 8.3719e+5 / 8.3719e+5 bytes | 0.968× | 0.968× | faster |
| <code>engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].stat</code> | 0.012186 / 0.019463 ms | 0.019291 / 0.025174 ms | 1.583× | 1.293× | within-noise |
| <code>engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.retainedBytes</code> | 3.1478e+5 / 3.1478e+5 bytes | 2.8321e+5 / 2.8321e+5 bytes | 0.900× | 0.900× | faster |
| <code>engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=error-propagation;size=1000].stat</code> | 0.74040 / 0.91064 ms | 0.24726 / 0.25241 ms | 0.334× | 0.277× | faster |
| <code>engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes</code> | 5.7667e+7 / 5.7667e+7 bytes | 5.5939e+7 / 5.5939e+7 bytes | 0.970× | 0.970× | faster |
| <code>engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].stat</code> | 0.033246 / 0.039485 ms | 0.031785 / 0.037816 ms | 0.956× | 0.958× | faster |
| <code>engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes</code> | 7.5508e+7 / 7.5508e+7 bytes | 7.2063e+7 / 7.2063e+7 bytes | 0.954× | 0.954× | faster |
| <code>engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].stat</code> | 0.021021 / 0.030474 ms | 0.019607 / 0.027386 ms | 0.933× | 0.899× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes</code> | 3.8408e+7 / 3.8408e+7 bytes | 3.6683e+7 / 3.6683e+7 bytes | 0.955× | 0.955× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].stat</code> | 80.068 / 86.655 ms | 38.995 / 40.528 ms | 0.487× | 0.468× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].stat</code> | 4.9398 / 5.3880 ms | 2.2913 / 2.3271 ms | 0.464× | 0.432× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes</code> | 4.7278e+5 / 4.7278e+5 bytes | 4.4531e+5 / 4.4531e+5 bytes | 0.942× | 0.942× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].stat</code> | 0.63458 / 0.93337 ms | 0.43713 / 0.46681 ms | 0.689× | 0.500× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes</code> | 2.9934e+7 / 2.9934e+7 bytes | 2.9015e+7 / 2.9015e+7 bytes | 0.969× | 0.969× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].stat</code> | 53.552 / 54.550 ms | 53.486 / 53.938 ms | 0.999× | 0.989× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes</code> | 3.2867e+6 / 3.2867e+6 bytes | 3.1713e+6 / 3.1713e+6 bytes | 0.965× | 0.965× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].stat</code> | 5.9817 / 6.7530 ms | 5.8018 / 7.1154 ms | 0.970× | 1.054× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes</code> | 3.6762e+5 / 3.6762e+5 bytes | 3.5255e+5 / 3.5255e+5 bytes | 0.959× | 0.959× | faster |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].stat</code> | 0.82593 / 0.95638 ms | 1.2095 / 1.5702 ms | 1.464× | 1.642× | regression |
| <code>engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes</code> | 8.9966e+5 / 8.9966e+5 bytes | 8.7229e+5 / 8.7229e+5 bytes | 0.970× | 0.970× | faster |
| <code>engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=iterative-finance;size=1000].stat</code> | 3.6023 / 5.3588 ms | 3.0177 / 3.3813 ms | 0.838× | 0.631× | faster |
| <code>engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.retainedBytes</code> | 5.2175e+6 / 5.2175e+6 bytes | 5.2033e+6 / 5.2033e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=let-repeat;size=100000].stat</code> | 1.8774 / 1.9938 ms | 1.7982 / 2.0992 ms | 0.958× | 1.053× | faster |
| <code>engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes</code> | 2.6126e+6 / 2.6126e+6 bytes | 2.6031e+6 / 2.6031e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].stat</code> | 0.55241 / 0.58710 ms | 0.50930 / 0.58361 ms | 0.922× | 0.994× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.retainedBytes</code> | 13761 / 13761 bytes | 8629.0 / 8629.0 bytes | 0.627× | 0.627× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=16].stat</code> | 0.024626 / 0.026690 ms | 0.017114 / 0.019927 ms | 0.695× | 0.747× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.retainedBytes</code> | 21029 / 21029 bytes | 15673 / 15673 bytes | 0.745× | 0.745× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=32].stat</code> | 0.060176 / 0.068397 ms | 0.029435 / 0.030547 ms | 0.489× | 0.447× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.retainedBytes</code> | 35565 / 35565 bytes | 29761 / 29761 bytes | 0.837× | 0.837× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=64].stat</code> | 0.11241 / 0.12325 ms | 0.036096 / 0.036894 ms | 0.321× | 0.299× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.retainedBytes</code> | 9219.0 / 9219.0 bytes | 4255.0 / 4255.0 bytes | 0.462× | 0.462× | faster |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=linear-chain;size=8].stat</code> | 0.015976 / 0.034148 ms | 0.016869 / 0.032274 ms | 1.056× | 0.945× | within-noise |
| <code>engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes</code> | 5.2172e+6 / 5.2172e+6 bytes | 5.2029e+6 / 5.2029e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].stat</code> | 1.7561 / 1.8707 ms | 1.6660 / 1.7232 ms | 0.949× | 0.921× | faster |
| <code>engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes</code> | 3.9150e+6 / 3.9150e+6 bytes | 3.9031e+6 / 3.9031e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].stat</code> | 3.6413 / 3.7420 ms | 2.9327 / 3.0598 ms | 0.805× | 0.818× | faster |
| <code>engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes</code> | 2.3625e+5 / 2.3625e+5 bytes | 1.9677e+5 / 1.9677e+5 bytes | 0.833× | 0.833× | faster |
| <code>engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].stat</code> | 0.40729 / 0.41899 ms | 0.20420 / 0.20858 ms | 0.501× | 0.498× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].stat</code> | 0.0027620 / 0.0030144 ms | 0.0027900 / 0.0035496 ms | 1.010× | 1.178× | within-noise |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].stat</code> | 52.512 / 53.365 ms | 20.654 / 21.030 ms | 0.393× | 0.394× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].stat</code> | 0.31395 / 0.32591 ms | 0.18823 / 0.25984 ms | 0.600× | 0.797× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes</code> | 7355.0 / 7355.0 bytes | 2423.0 / 2423.0 bytes | 0.329× | 0.329× | faster |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].stat</code> | 0.0038400 / 0.0069782 ms | 0.0040940 / 0.0057812 ms | 1.066× | 0.828× | within-noise |
| <code>engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes</code> | 5.3056e+5 / 5.3056e+5 bytes | 5.0319e+5 / 5.0319e+5 bytes | 0.948× | 0.948× | faster |
| <code>engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].stat</code> | 0.50004 / 0.52032 ms | 0.24755 / 0.27676 ms | 0.495× | 0.532× | faster |
| <code>engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes</code> | 4.8000e+6 / 4.8000e+6 bytes | 4.8000e+6 / 4.8000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes</code> | 6.6631e+6 / 6.6631e+6 bytes | 5.8525e+6 / 5.8525e+6 bytes | 0.878× | 0.878× | faster |
| <code>engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations</code> | 3.0000 / 3.0000 count | 3.0000 / 3.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].stat</code> | 21.775 / 21.920 ms | 10.544 / 10.597 ms | 0.484× | 0.483× | faster |
| <code>engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes</code> | 1.6000e+6 / 1.6000e+6 bytes | 1.6000e+6 / 1.6000e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes</code> | 4.0581e+6 / 4.0581e+6 bytes | 3.2521e+6 / 3.2521e+6 bytes | 0.801× | 0.801× | faster |
| <code>engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations</code> | 1.0000 / 1.0000 count | 1.0000 / 1.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].stat</code> | 11.283 / 11.550 ms | 5.3421 / 5.4349 ms | 0.473× | 0.471× | faster |
| <code>engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes</code> | 3.9146e+6 / 3.9146e+6 bytes | 3.9027e+6 / 3.9027e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].stat</code> | 3.9421 / 4.1800 ms | 3.7902 / 3.9289 ms | 0.961× | 0.940× | faster |
| <code>engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes</code> | 6.5198e+6 / 6.5198e+6 bytes | 6.5032e+6 / 6.5032e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].stat</code> | 6.4648 / 6.7985 ms | 5.9883 / 6.0432 ms | 0.926× | 0.889× | faster |
| <code>engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes</code> | 2.7426e+6 / 2.7426e+6 bytes | 2.7328e+6 / 2.7328e+6 bytes | 0.996× | 0.996× | faster |
| <code>engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].stat</code> | 1.6970 / 1.7586 ms | 1.5779 / 1.6345 ms | 0.930× | 0.929× | faster |
| <code>engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes</code> | 3.9147e+6 / 3.9147e+6 bytes | 3.9028e+6 / 3.9028e+6 bytes | 0.997× | 0.997× | faster |
| <code>engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].stat</code> | 2.1983 / 2.3374 ms | 2.0027 / 2.0769 ms | 0.911× | 0.889× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].stat</code> | 2.1929 / 2.9639 ms | 1.6661 / 1.6841 ms | 0.760× | 0.568× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].stat</code> | 3.1362 / 3.2748 ms | 2.7925 / 2.8940 ms | 0.890× | 0.884× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.6958e+6 / 1.6958e+6 bytes | 1.6675e+6 / 1.6675e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].stat</code> | 3.1760 / 3.8260 ms | 3.3055 / 3.3675 ms | 1.041× | 0.880× | within-noise |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes</code> | 1.7111e+6 / 1.7111e+6 bytes | 1.6828e+6 / 1.6828e+6 bytes | 0.983× | 0.983× | faster |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].stat</code> | 2.1185 / 2.1745 ms | 2.4491 / 3.2150 ms | 1.156× | 1.478× | regression |
| <code>engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes</code> | 4.2117e+6 / 4.2117e+6 bytes | 4.0097e+6 / 4.0097e+6 bytes | 0.952× | 0.952× | faster |
| <code>engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].stat</code> | 8.2853 / 8.9032 ms | 5.3522 / 5.4001 ms | 0.646× | 0.607× | faster |
| <code>engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes</code> | 1.2187e+6 / 1.2187e+6 bytes | 1.1912e+6 / 1.1912e+6 bytes | 0.977× | 0.977× | faster |
| <code>engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].stat</code> | 1.0871 / 1.2655 ms | 0.95259 / 0.97821 ms | 0.876× | 0.773× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0726e+6 / 1.0726e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].stat</code> | 1.1319 / 1.1494 ms | 0.81383 / 0.82191 ms | 0.719× | 0.715× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0716e+6 / 1.0716e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].stat</code> | 1.4958 / 1.5462 ms | 1.2142 / 1.2237 ms | 0.812× | 0.791× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.0998e+6 / 1.0998e+6 bytes | 1.0715e+6 / 1.0715e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].stat</code> | 1.6164 / 1.6240 ms | 1.2853 / 1.2981 ms | 0.795× | 0.799× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 3.2000e+5 / 3.2000e+5 bytes | 3.2000e+5 / 3.2000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1008e+6 / 1.1008e+6 bytes | 1.0725e+6 / 1.0725e+6 bytes | 0.974× | 0.974× | faster |
| <code>engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations</code> | 2.0000 / 2.0000 count | 2.0000 / 2.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=vlookup-many;size=1000].stat</code> | 1.2874 / 1.3719 ms | 0.89818 / 0.99310 ms | 0.698× | 0.724× | faster |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes</code> | 3.3817e+7 / 3.3817e+7 bytes | 3.2088e+7 / 3.2088e+7 bytes | 0.949× | 0.949× | faster |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].stat</code> | 53.535 / 56.833 ms | 21.340 / 21.427 ms | 0.399× | 0.377× | faster |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes</code> | 4.2350e+5 / 4.2350e+5 bytes | 3.9600e+5 / 3.9600e+5 bytes | 0.935× | 0.935× | faster |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations</code> | 0.0000 / 0.0000 count | 0.0000 / 0.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].stat</code> | 0.53145 / 0.54271 ms | 0.13497 / 0.15091 ms | 0.254× | 0.278× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].stat</code> | 1.1244 / 1.1376 ms | 0.82728 / 0.83456 ms | 0.736× | 0.734× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].stat</code> | 1.5635 / 1.5699 ms | 1.2980 / 1.3108 ms | 0.830× | 0.835× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes</code> | 1.3611e+6 / 1.3611e+6 bytes | 1.3328e+6 / 1.3328e+6 bytes | 0.979× | 0.979× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].stat</code> | 1.7043 / 1.7114 ms | 1.3455 / 1.3564 ms | 0.789× | 0.793× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes</code> | 1.6000e+5 / 1.6000e+5 bytes | 1.6000e+5 / 1.6000e+5 bytes | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes</code> | 1.1151e+6 / 1.1151e+6 bytes | 1.0868e+6 / 1.0868e+6 bytes | 0.975× | 0.975× | faster |
| <code>engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations</code> | 4.0000 / 4.0000 count | 4.0000 / 4.0000 count | 1.000× | 1.000× | unchanged |
| <code>engines[engine=full].shared.workloads[id=xlookup-many;size=1000].stat</code> | 1.2489 / 1.2777 ms | 0.90879 / 0.93940 ms | 0.728× | 0.735× | faster |

### full-engine-matched-results.json

Status: **compared**. Baseline: **0.5.4 engine (WASM) under 0.6 core and harness**. Baseline capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:25 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:26 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>rows[id=independent-first-recompute;size=10000].defaultStat</code> | 6.0839 / 7.0763 ms | 3.0477 / 3.6168 ms | 0.501× | 0.511× | faster |
| <code>rows[id=independent-first-recompute;size=10000].fullStat</code> | 5.2702 / 6.6634 ms | 2.7848 / 3.0474 ms | 0.528× | 0.457× | faster |
| <code>rows[id=independent-first-recompute;size=10000].ratioStat</code> | 0.87491 / 1.1137 ratio | 0.90806 / 1.0512 ratio | 1.038× | 0.944× | slower |
| <code>rows[id=independent-first-recompute;size=1000].defaultStat</code> | 0.60598 / 0.67049 ms | 0.25450 / 0.29571 ms | 0.420× | 0.441× | faster |
| <code>rows[id=independent-first-recompute;size=1000].fullStat</code> | 0.51489 / 0.61520 ms | 0.23118 / 0.25923 ms | 0.449× | 0.421× | faster |
| <code>rows[id=independent-first-recompute;size=1000].ratioStat</code> | 0.87443 / 1.0409 ratio | 0.89192 / 1.0885 ratio | 1.020× | 1.046× | slower |
| <code>rows[id=independent-parse-load;size=10000].defaultStat</code> | 6.5623 / 7.0878 ms | 6.3539 / 7.1620 ms | 0.968× | 1.010× | faster |
| <code>rows[id=independent-parse-load;size=10000].fullStat</code> | 6.2822 / 7.0164 ms | 6.4198 / 6.8182 ms | 1.022× | 0.972× | slower |
| <code>rows[id=independent-parse-load;size=10000].ratioStat</code> | 0.98062 / 1.1293 ratio | 0.99936 / 1.0808 ratio | 1.019× | 0.957× | slower |
| <code>rows[id=independent-parse-load;size=1000].defaultStat</code> | 0.66278 / 0.72979 ms | 0.61129 / 0.73139 ms | 0.922× | 1.002× | faster |
| <code>rows[id=independent-parse-load;size=1000].fullStat</code> | 0.64231 / 0.72596 ms | 0.63813 / 0.72564 ms | 0.993× | 1.000× | faster |
| <code>rows[id=independent-parse-load;size=1000].ratioStat</code> | 0.97245 / 1.1343 ratio | 1.0186 / 1.1779 ratio | 1.047× | 1.038× | slower |
| <code>rows[id=linear-chain;size=8].defaultStat</code> | 0.010004 / 0.011190 ms | 0.0047852 / 0.0052801 ms | 0.478× | 0.472× | faster |
| <code>rows[id=linear-chain;size=8].fullStat</code> | 0.0090663 / 0.010670 ms | 0.0045027 / 0.0049472 ms | 0.497× | 0.464× | faster |
| <code>rows[id=linear-chain;size=8].ratioStat</code> | 0.94001 / 1.0829 ratio | 0.94671 / 1.0083 ratio | 1.007× | 0.931× | slower |
| <code>rows[id=scalar-edit-affects-0;size=1000].defaultStat</code> | 0.00027190 / 0.00031677 ms | 0.00023100 / 0.00025039 ms | 0.850× | 0.790× | faster |
| <code>rows[id=scalar-edit-affects-0;size=1000].fullStat</code> | 0.00026252 / 0.00031546 ms | 0.00024297 / 0.00027409 ms | 0.926× | 0.869× | faster |
| <code>rows[id=scalar-edit-affects-0;size=1000].ratioStat</code> | 0.96525 / 1.1954 ratio | 1.0589 / 1.1810 ratio | 1.097× | 0.988× | slower |
| <code>rows[id=vlookup-many;size=1000].defaultStat</code> | 1.6408 / 1.7697 ms | 1.1847 / 1.3348 ms | 0.722× | 0.754× | faster |
| <code>rows[id=vlookup-many;size=1000].fullStat</code> | 1.4163 / 1.5904 ms | 1.0265 / 1.1075 ms | 0.725× | 0.696× | faster |
| <code>rows[id=vlookup-many;size=1000].ratioStat</code> | 0.85469 / 1.0271 ratio | 0.85268 / 1.0171 ratio | 0.998× | 0.990× | faster |
| <code>rows[id=wide-fan-out-edit;size=1000].defaultStat</code> | 0.39792 / 0.44331 ms | 0.17169 / 0.18842 ms | 0.431× | 0.425× | faster |
| <code>rows[id=wide-fan-out-edit;size=1000].fullStat</code> | 0.37094 / 0.42423 ms | 0.14218 / 0.16250 ms | 0.383× | 0.383× | faster |
| <code>rows[id=wide-fan-out-edit;size=1000].ratioStat</code> | 0.91667 / 1.1682 ratio | 0.85498 / 0.99168 ratio | 0.933× | 0.849× | faster |

### xlsx-results.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:39 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 03:40 UTC.

Threshold: **none**. No documented historical-capture noise threshold. The XLSX 1.25 baseline ratio is an in-capture codec gate, not a historical/new comparison limit. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>summaries[engine=baseline;scenario=combined;operation=import].durationMs</code> | 10031 / 10585 ms | 10084 / 10832 ms | 1.005× | 1.023× | slower |
| <code>summaries[engine=baseline;scenario=combined;operation=import].maxRssBytes</code> | 3.5600e+9 / 3.5693e+9 bytes | 3.5672e+9 / 3.6045e+9 bytes | 1.002× | 1.010× | slower |
| <code>summaries[engine=baseline;scenario=combined;operation=import].processWallMs</code> | 10260 / 10833 ms | 10314 / 11061 ms | 1.005× | 1.021× | slower |
| <code>summaries[engine=baseline;scenario=combined;operation=import].retainedAllocationDeltaBytes</code> | 1.6274e+9 / 1.6781e+9 bytes | 1.5458e+9 / 1.6867e+9 bytes | 0.950× | 1.005× | faster |
| <code>summaries[engine=baseline;scenario=rich;operation=export].durationMs</code> | 722.54 / 728.11 ms | 697.28 / 711.13 ms | 0.965× | 0.977× | faster |
| <code>summaries[engine=baseline;scenario=rich;operation=export].maxRssBytes</code> | 1.8025e+8 / 1.8147e+8 bytes | 1.8015e+8 / 1.8234e+8 bytes | 0.999× | 1.005× | faster |
| <code>summaries[engine=baseline;scenario=rich;operation=export].processWallMs</code> | 879.22 / 887.61 ms | 855.48 / 871.08 ms | 0.973× | 0.981× | faster |
| <code>summaries[engine=baseline;scenario=rich;operation=export].retainedAllocationDeltaBytes</code> | 2.5779e+7 / 2.6018e+7 bytes | 1.5239e+7 / 2.5923e+7 bytes | 0.591× | 0.996× | faster |
| <code>summaries[engine=baseline;scenario=scalar;operation=export].durationMs</code> | 596.10 / 600.39 ms | 601.11 / 604.96 ms | 1.008× | 1.008× | slower |
| <code>summaries[engine=baseline;scenario=scalar;operation=export].maxRssBytes</code> | 2.0774e+8 / 2.1079e+8 bytes | 2.0677e+8 / 2.0833e+8 bytes | 0.995× | 0.988× | faster |
| <code>summaries[engine=baseline;scenario=scalar;operation=export].processWallMs</code> | 754.02 / 758.44 ms | 759.98 / 766.71 ms | 1.008× | 1.011× | slower |
| <code>summaries[engine=baseline;scenario=scalar;operation=export].retainedAllocationDeltaBytes</code> | 5.6617e+7 / 5.7702e+7 bytes | 5.6805e+7 / 5.6973e+7 bytes | 1.003× | 0.987× | slower |
| <code>summaries[engine=baseline;scenario=shared-style;operation=export].durationMs</code> | 1222.2 / 1254.0 ms | 1250.3 / 1313.2 ms | 1.023× | 1.047× | slower |
| <code>summaries[engine=baseline;scenario=shared-style;operation=export].maxRssBytes</code> | 2.9107e+8 / 2.9451e+8 bytes | 2.9481e+8 / 2.9683e+8 bytes | 1.013× | 1.008× | slower |
| <code>summaries[engine=baseline;scenario=shared-style;operation=export].processWallMs</code> | 1393.6 / 1421.9 ms | 1423.0 / 1487.5 ms | 1.021× | 1.046× | slower |
| <code>summaries[engine=baseline;scenario=shared-style;operation=export].retainedAllocationDeltaBytes</code> | 8.9585e+7 / 9.5990e+7 bytes | 8.3664e+7 / 9.1028e+7 bytes | 0.934× | 0.948× | faster |
| <code>summaries[engine=baseline;scenario=sparse;operation=export].durationMs</code> | 181.29 / 182.50 ms | 184.82 / 187.91 ms | 1.019× | 1.030× | slower |
| <code>summaries[engine=baseline;scenario=sparse;operation=export].maxRssBytes</code> | 1.1053e+8 / 1.1128e+8 bytes | 1.1209e+8 / 1.1285e+8 bytes | 1.014× | 1.014× | slower |
| <code>summaries[engine=baseline;scenario=sparse;operation=export].processWallMs</code> | 327.37 / 329.16 ms | 330.48 / 337.95 ms | 1.009× | 1.027× | slower |
| <code>summaries[engine=baseline;scenario=sparse;operation=export].retainedAllocationDeltaBytes</code> | 1.4364e+6 / 1.4364e+6 bytes | 1.4364e+6 / 1.4364e+6 bytes | 1.000× | 1.000× | unchanged |
| <code>summaries[engine=current;scenario=combined;operation=import].durationMs</code> | 1373.6 / 1383.6 ms | 1234.5 / 1246.6 ms | 0.899× | 0.901× | faster |
| <code>summaries[engine=current;scenario=combined;operation=import].maxRssBytes</code> | 3.2544e+8 / 3.2850e+8 bytes | 2.1678e+8 / 2.1791e+8 bytes | 0.666× | 0.663× | faster |
| <code>summaries[engine=current;scenario=combined;operation=import].processWallMs</code> | 1438.0 / 1467.8 ms | 1310.1 / 1331.6 ms | 0.911× | 0.907× | faster |
| <code>summaries[engine=current;scenario=combined;operation=import].retainedAllocationDeltaBytes</code> | 1.1638e+8 / 1.2154e+8 bytes | 3.7982e+7 / 3.8730e+7 bytes | 0.326× | 0.319× | faster |
| <code>summaries[engine=current;scenario=compression-ratio;operation=reject].durationMs</code> | 1.3622 / 1.4156 ms | 2.6910 / 2.9871 ms | 1.976× | 2.110× | slower |
| <code>summaries[engine=current;scenario=compression-ratio;operation=reject].maxRssBytes</code> | 4.4732e+7 / 4.6050e+7 bytes | 4.6035e+7 / 4.6578e+7 bytes | 1.029× | 1.011× | slower |
| <code>summaries[engine=current;scenario=compression-ratio;operation=reject].processWallMs</code> | 46.124 / 46.420 ms | 53.040 / 53.734 ms | 1.150× | 1.158× | slower |
| <code>summaries[engine=current;scenario=compression-ratio;operation=reject].retainedAllocationDeltaBytes</code> | 0.0000 / 0.0000 bytes | 0.0000 / 0.0000 bytes | 1.000× | 1.000× | unchanged |
| <code>summaries[engine=current;scenario=deep-xml;operation=reject].durationMs</code> | 5.9384 / 6.5013 ms | 8.7821 / 9.5816 ms | 1.479× | 1.474× | slower |
| <code>summaries[engine=current;scenario=deep-xml;operation=reject].maxRssBytes</code> | 4.6621e+7 / 4.6881e+7 bytes | 4.8992e+7 / 4.9683e+7 bytes | 1.051× | 1.060× | slower |
| <code>summaries[engine=current;scenario=deep-xml;operation=reject].processWallMs</code> | 51.220 / 51.552 ms | 59.444 / 60.119 ms | 1.161× | 1.166× | slower |
| <code>summaries[engine=current;scenario=deep-xml;operation=reject].retainedAllocationDeltaBytes</code> | 1.3799e+6 / 1.3799e+6 bytes | 1.3788e+6 / 1.3788e+6 bytes | 0.999× | 0.999× | faster |
| <code>summaries[engine=current;scenario=rich;operation=export].durationMs</code> | 357.09 / 380.26 ms | 370.06 / 386.54 ms | 1.036× | 1.017× | slower |
| <code>summaries[engine=current;scenario=rich;operation=export].maxRssBytes</code> | 1.3958e+8 / 1.4023e+8 bytes | 1.4561e+8 / 1.4790e+8 bytes | 1.043× | 1.055× | slower |
| <code>summaries[engine=current;scenario=rich;operation=export].processWallMs</code> | 450.94 / 476.63 ms | 469.92 / 488.61 ms | 1.042× | 1.025× | slower |
| <code>summaries[engine=current;scenario=rich;operation=export].retainedAllocationDeltaBytes</code> | 2.3242e+6 / 2.3242e+6 bytes | 2.2759e+7 / 2.3001e+7 bytes | 9.792× | 9.896× | slower |
| <code>summaries[engine=current;scenario=scalar;operation=export].durationMs</code> | 455.14 / 462.92 ms | 441.71 / 458.30 ms | 0.971× | 0.990× | faster |
| <code>summaries[engine=current;scenario=scalar;operation=export].maxRssBytes</code> | 1.5564e+8 / 1.5837e+8 bytes | 1.6500e+8 / 1.6694e+8 bytes | 1.060× | 1.054× | slower |
| <code>summaries[engine=current;scenario=scalar;operation=export].processWallMs</code> | 552.09 / 559.93 ms | 547.63 / 562.62 ms | 0.992× | 1.005× | faster |
| <code>summaries[engine=current;scenario=scalar;operation=export].retainedAllocationDeltaBytes</code> | 1.1187e+7 / 1.1193e+7 bytes | 2.8138e+7 / 2.8568e+7 bytes | 2.515× | 2.552× | slower |
| <code>summaries[engine=current;scenario=shared-style;operation=export].durationMs</code> | 664.11 / 672.59 ms | 688.15 / 709.17 ms | 1.036× | 1.054× | slower |
| <code>summaries[engine=current;scenario=shared-style;operation=export].maxRssBytes</code> | 1.5475e+8 / 1.6251e+8 bytes | 1.7192e+8 / 1.7361e+8 bytes | 1.111× | 1.068× | slower |
| <code>summaries[engine=current;scenario=shared-style;operation=export].processWallMs</code> | 769.65 / 778.89 ms | 802.33 / 822.67 ms | 1.042× | 1.056× | slower |
| <code>summaries[engine=current;scenario=shared-style;operation=export].retainedAllocationDeltaBytes</code> | 1.1126e+7 / 1.1146e+7 bytes | 1.4134e+7 / 1.5876e+7 bytes | 1.270× | 1.424× | slower |
| <code>summaries[engine=current;scenario=sparse;operation=export].durationMs</code> | 59.854 / 61.125 ms | 65.261 / 67.798 ms | 1.090× | 1.109× | slower |
| <code>summaries[engine=current;scenario=sparse;operation=export].maxRssBytes</code> | 8.8420e+7 / 8.8684e+7 bytes | 9.4892e+7 / 9.5977e+7 bytes | 1.073× | 1.082× | slower |
| <code>summaries[engine=current;scenario=sparse;operation=export].processWallMs</code> | 146.14 / 147.39 ms | 157.87 / 159.19 ms | 1.080× | 1.080× | slower |
| <code>summaries[engine=current;scenario=sparse;operation=export].retainedAllocationDeltaBytes</code> | 3.5158e+5 / 3.5158e+5 bytes | 1.3388e+6 / 1.3388e+6 bytes | 3.808× | 3.808× | slower |

### render-baseline-raw.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:46 UTC. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:05 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>results[engine=handsontable;rows=100000;scenarioId=altering.insert-5-rows-top]</code> | 14.471 / 15.600 ms | 17.275 / 18.321 ms | 1.194× | 1.174× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=altering.remove-5-rows-top]</code> | 12.537 / 13.802 ms | 15.107 / 15.501 ms | 1.205× | 1.123× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=arrow-down.top-left]</code> | 1.4623 / 1.5391 ms | 1.4533 / 1.5117 ms | 0.994× | 0.982× | faster |
| <code>results[engine=handsontable;rows=100000;scenarioId=arrow-right.middle]</code> | 1.3774 / 1.3901 ms | 1.3795 / 1.4167 ms | 1.001× | 1.019× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-commit.middle]</code> | 4.9548 / 5.2181 ms | 7.8077 / 7.9831 ms | 1.576× | 1.530× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.bottom-right]</code> | 1.4558 / 1.8473 ms | 1.4350 / 1.5873 ms | 0.986× | 0.859× | faster |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.middle]</code> | 1.0364 / 1.0816 ms | 1.0425 / 1.0690 ms | 1.006× | 0.988× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=edit-open.top-left]</code> | 1.0903 / 1.1484 ms | 1.1350 / 1.3042 ms | 1.041× | 1.136× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=formatted-paint.top-left]</code> | 3.3097 / 3.5293 ms | 6.1471 / 6.2467 ms | 1.857× | 1.770× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=merge-heavy.paint]</code> | 3.4845 / 3.6239 ms | 6.3375 / 6.4294 ms | 1.819× | 1.774× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-down.middle]</code> | 4.0022 / 4.4183 ms | 6.8367 / 8.3448 ms | 1.708× | 1.889× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-down.top-left]</code> | 15.786 / 15.931 ms | 21.390 / 21.753 ms | 1.355× | 1.365× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-right.top-left]</code> | 10.550 / 10.616 ms | 16.414 / 16.995 ms | 1.556× | 1.601× | slower |
| <code>results[engine=handsontable;rows=100000;scenarioId=scroll-smooth.same-window]</code> | 7.7077 / 8.1031 ms | 10.510 / 10.690 ms | 1.364× | 1.319× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=altering.insert-5-rows-top]</code> | 1.9014 / 2.0130 ms | 1.9654 / 2.1736 ms | 1.034× | 1.080× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=altering.remove-5-rows-top]</code> | 1.6382 / 1.7330 ms | 1.6407 / 1.7537 ms | 1.001× | 1.012× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=arrow-down.top-left]</code> | 0.68656 / 0.76008 ms | 0.70634 / 0.74582 ms | 1.029× | 0.981× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=arrow-right.middle]</code> | 0.69658 / 0.78332 ms | 0.69167 / 0.77929 ms | 0.993× | 0.995× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-commit.middle]</code> | 0.96000 / 1.0574 ms | 1.0286 / 1.1548 ms | 1.071× | 1.092× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.bottom-right]</code> | 0.57594 / 0.59393 ms | 0.57644 / 0.61179 ms | 1.001× | 1.030× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.middle]</code> | 0.65591 / 0.72473 ms | 0.64366 / 0.74637 ms | 0.981× | 1.030× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=edit-open.top-left]</code> | 0.60310 / 0.66761 ms | 0.63481 / 0.68170 ms | 1.053× | 1.021× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=formatted-paint.top-left]</code> | 0.47882 / 0.51099 ms | 0.0037096 / 0.0038356 ms | 0.008× | 0.008× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=merge-heavy.paint]</code> | 0.0033350 / 0.0034682 ms | 0.0032527 / 0.0032880 ms | 0.975× | 0.948× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.middle]</code> | 1.1604 / 1.2695 ms | 1.1619 / 1.2609 ms | 1.001× | 0.993× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.top-left]</code> | 1.3842 / 1.4838 ms | 1.4106 / 1.5416 ms | 1.019× | 1.039× | slower |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-right.top-left]</code> | 0.26490 / 0.28971 ms | 0.26329 / 0.28103 ms | 0.994× | 0.970× | faster |
| <code>results[engine=sheetwrite;rows=100000;scenarioId=scroll-smooth.same-window]</code> | 0.41385 / 0.44381 ms | 0.39880 / 0.42989 ms | 0.964× | 0.969× | faster |

### render-baseline.json

Status: **compared**. Baseline: **0.5.4**. Baseline capture: <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:40 UTC · scope start. Candidate capture: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 03:59 UTC · scope start.

Threshold: **bootstrap-median-delta**. Independent raw-sample median bootstrap; 99% familywise confidence, 20,000 resamples, maximum regression 0 ms. Historical/candidate harnesses are not asserted identical; descriptive release evidence, not bench:check approval. Source: <code>bench/src/controlled-baseline.ts</code>.

| Metric | Baseline median / p95 | Candidate median / p95 | Median ratio | p95 ratio | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| <code>cells[key=engine=handsontable;rows=100000;scenario=altering.insert-5-rows-top]</code> | 14.507 / 21.209 ms | 17.300 / 18.783 ms | 1.193× | 0.886× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=altering.remove-5-rows-top]</code> | 12.537 / 15.526 ms | 15.014 / 15.837 ms | 1.198× | 1.020× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=arrow-down.top-left]</code> | 1.4616 / 2.1081 ms | 1.4708 / 1.6915 ms | 1.006× | 0.802× | within-noise |
| <code>cells[key=engine=handsontable;rows=100000;scenario=arrow-right.middle]</code> | 1.3733 / 1.4627 ms | 1.3753 / 1.4836 ms | 1.001× | 1.014× | within-noise |
| <code>cells[key=engine=handsontable;rows=100000;scenario=edit-commit.middle]</code> | 4.9548 / 5.5202 ms | 7.8038 / 8.1758 ms | 1.575× | 1.481× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=edit-open.bottom-right]</code> | 1.4558 / 2.0607 ms | 1.4414 / 1.7688 ms | 0.990× | 0.858× | within-noise |
| <code>cells[key=engine=handsontable;rows=100000;scenario=edit-open.middle]</code> | 1.0364 / 1.1011 ms | 1.0361 / 1.1218 ms | 1.000× | 1.019× | within-noise |
| <code>cells[key=engine=handsontable;rows=100000;scenario=edit-open.top-left]</code> | 1.0876 / 1.1898 ms | 1.1350 / 1.3630 ms | 1.044× | 1.146× | within-noise |
| <code>cells[key=engine=handsontable;rows=100000;scenario=formatted-paint.top-left]</code> | 3.3633 / 3.7223 ms | 6.1382 / 7.6481 ms | 1.825× | 2.055× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=merge-heavy.paint]</code> | 3.4845 / 3.7624 ms | 6.3688 / 6.5422 ms | 1.828× | 1.739× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=scroll-down.middle]</code> | 4.0022 / 4.9782 ms | 6.8600 / 9.8560 ms | 1.714× | 1.980× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=scroll-down.top-left]</code> | 15.764 / 16.022 ms | 21.340 / 21.891 ms | 1.354× | 1.366× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=scroll-right.top-left]</code> | 10.550 / 10.685 ms | 16.414 / 17.760 ms | 1.556× | 1.662× | regression |
| <code>cells[key=engine=handsontable;rows=100000;scenario=scroll-smooth.same-window]</code> | 7.7231 / 8.3319 ms | 10.530 / 11.310 ms | 1.363× | 1.357× | regression |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=altering.insert-5-rows-top]</code> | 1.8741 / 2.1947 ms | 1.9653 / 2.3272 ms | 1.049× | 1.060× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=altering.remove-5-rows-top]</code> | 1.6621 / 1.8003 ms | 1.6426 / 1.8351 ms | 0.988× | 1.019× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=arrow-down.top-left]</code> | 0.68935 / 0.79531 ms | 0.71170 / 0.77658 ms | 1.032× | 0.976× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=arrow-right.middle]</code> | 0.69147 / 0.81339 ms | 0.69479 / 0.81525 ms | 1.005× | 1.002× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=edit-commit.middle]</code> | 0.96000 / 1.1480 ms | 1.0465 / 1.2421 ms | 1.090× | 1.082× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.bottom-right]</code> | 0.56410 / 0.63176 ms | 0.57543 / 0.63694 ms | 1.020× | 1.008× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.middle]</code> | 0.65195 / 0.78875 ms | 0.65468 / 0.79097 ms | 1.004× | 1.003× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.top-left]</code> | 0.60413 / 0.93973 ms | 0.63481 / 0.92129 ms | 1.051× | 0.980× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=formatted-paint.top-left]</code> | 0.47224 / 0.54724 ms | 0.0036952 / 0.0040641 ms | 0.008× | 0.007× | improvement |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=merge-heavy.paint]</code> | 0.0033352 / 0.0042234 ms | 0.0032565 / 0.0033357 ms | 0.976× | 0.790× | improvement |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=scroll-down.middle]</code> | 1.1766 / 1.2980 ms | 1.1546 / 1.3219 ms | 0.981× | 1.018× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=scroll-down.top-left]</code> | 1.3626 / 1.5872 ms | 1.4106 / 1.5853 ms | 1.035× | 0.999× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=scroll-right.top-left]</code> | 0.26364 / 0.30556 ms | 0.26259 / 0.31270 ms | 0.996× | 1.023× | within-noise |
| <code>cells[key=engine=sheetwrite;rows=100000;scenario=scroll-smooth.same-window]</code> | 0.41258 / 0.46128 ms | 0.40081 / 0.46502 ms | 0.971× | 1.008× | within-noise |

Generate from captured artifacts without running benchmarks:

```sh verify title="Release comparison artifact"
cd bench
bun src/release-comparison.ts --base-ref release/version-0.5.4 --baseline-results-dir results/releases/0.5.4 --output results/release-comparison.json
```

## Capture

<dl class="bench-meta" data-pagefind-ignore>
<div><dt>Captured</dt><dd>2026-10-28 17:15 → 2026-10-30 03:44 UTC</dd></div>
<div><dt>Commit</dt><dd><code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> clean worktree</dd></div>
<div><dt>Artifacts</dt><dd>10 validated captures from that one commit; each section states its own environment (browser or runtime) and protocol</dd></div>
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
