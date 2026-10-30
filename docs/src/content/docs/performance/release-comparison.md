---
title: "Release comparison"
description: "Each release measured against the previous one on the same machine, suite by suite."
---

## Sheetwrite 0.6.0 compared with a fresh 0.5.4 capture

Each suite ran once on 0.5.4 and once on 0.6.0, on the same machine. Change is 0.6.0 / 0.5.4 for the median, with the p95 ratio in brackets when it differs: below 1× is faster or smaller, above 1× is slower or larger. A suite with a documented budget marks rows beyond it as flagged; rows without a budget are only marked faster, slower, smaller or larger.

The summary counts Sheetwrite's own measurements. **Lower** and **higher** cover time, memory and counts alike; **same** is unchanged or within budget; **new** has no 0.5.4 counterpart. **Apart** counts Handsontable control runs and full-engine rows that repeat the formula tables, so a change is not counted twice or credited to Sheetwrite.

| Suite | Rows | Lower | Higher | Same | New | Flagged | Apart |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Render scale | 112 | 16 | 39 | 1 | 0 | 0 | 56 |
| Interaction | 7 | 1 | 3 | 3 | 0 | 0 | 0 |
| Paged | 5 | 4 | 1 | 0 | 0 | 0 | 0 |
| Data | 89 | 62 | 25 | 2 | 0 | 0 | 0 |
| Core paths | 14 | 9 | 5 | 0 | 0 | 0 | 0 |
| Chart tracking | 34 | 0 | 0 | 0 | 34 | 0 | 0 |
| Pivot | 5 | 0 | 0 | 0 | 5 | 0 | 0 |
| Formula | 212 | 89 | 0 | 122 | 0 | 1 | 0 |
| Formula default | 212 | 81 | 0 | 130 | 0 | 1 | 0 |
| Formula full | 212 | 88 | 0 | 122 | 0 | 2 | 0 |
| Full engine | 458 | 14 | 0 | 18 | 2 | 0 | 424 |
| Full engine matched | 24 | 17 | 7 | 0 | 0 | 0 | 0 |
| Xlsx | 48 | 13 | 32 | 3 | 0 | 0 | 0 |
| Render baseline raw | 28 | 6 | 8 | 0 | 0 | 0 | 14 |
| Render baseline | 28 | 2 | 0 | 12 | 0 | 0 | 14 |

## Flagged rows

16 rows exceed their suite's budget or noise test. They stay listed here, not removed or adjusted against a control. A flag compares one capture of each release; it is not a controlled gate verdict.

| Suite | Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Formula | <span title="workloads[id=independent-parse-load;size=10000].stat">Independent parse load · 10,000</span> | 6.06 ms / 6.43 ms | 5.97 ms / 8.62 ms | 0.99× (p95 1.34×) | **Flagged** |
| Formula default | <span title="workloads[id=text-lookup-many-sorted;size=1000].stat">Text lookup many sorted · 1,000</span> | 3.20 ms / 3.29 ms | 4.02 ms / 4.45 ms | 1.26× (p95 1.35×) | **Flagged** |
| Formula full | <span title="workloads[id=independent-parse-load;size=1000].stat">Independent parse load · 1,000</span> | 0.83 ms / 0.96 ms | 1.21 ms / 1.57 ms | 1.46× (p95 1.64×) | **Flagged** |
| Formula full | <span title="workloads[id=text-lookup-many;size=1000].stat">Text lookup many · 1,000</span> | 2.12 ms / 2.17 ms | 2.45 ms / 3.22 ms | 1.16× (p95 1.48×) | **Flagged** |
| Full engine · repeat of formula table | <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].stat">Default · text lookup many sorted · 1,000</span> | 3.20 ms / 3.29 ms | 4.02 ms / 4.45 ms | 1.26× (p95 1.35×) | **Flagged** |
| Full engine · repeat of formula table | <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].stat">Full · independent parse load · 1,000</span> | 0.83 ms / 0.96 ms | 1.21 ms / 1.57 ms | 1.46× (p95 1.64×) | **Flagged** |
| Full engine · repeat of formula table | <span title="engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].stat">Full · text lookup many · 1,000</span> | 2.12 ms / 2.17 ms | 2.45 ms / 3.22 ms | 1.16× (p95 1.48×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=altering.insert-5-rows-top]">Handsontable · 100,000 rows · altering · insert 5 rows top</span> | 14.5 ms / 21.2 ms | 17.3 ms / 18.8 ms | 1.19× (p95 0.89×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=altering.remove-5-rows-top]">Handsontable · 100,000 rows · altering · remove 5 rows top</span> | 12.5 ms / 15.5 ms | 15.0 ms / 15.8 ms | 1.20× (p95 1.02×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=edit-commit.middle]">Handsontable · 100,000 rows · edit commit · middle</span> | 4.95 ms / 5.52 ms | 7.80 ms / 8.18 ms | 1.58× (p95 1.48×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=formatted-paint.top-left]">Handsontable · 100,000 rows · formatted paint · top left</span> | 3.36 ms / 3.72 ms | 6.14 ms / 7.65 ms | 1.83× (p95 2.05×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=merge-heavy.paint]">Handsontable · 100,000 rows · merge heavy · paint</span> | 3.48 ms / 3.76 ms | 6.37 ms / 6.54 ms | 1.83× (p95 1.74×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-down.middle]">Handsontable · 100,000 rows · scroll down · middle</span> | 4.00 ms / 4.98 ms | 6.86 ms / 9.86 ms | 1.71× (p95 1.98×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-down.top-left]">Handsontable · 100,000 rows · scroll down · top left</span> | 15.8 ms / 16.0 ms | 21.3 ms / 21.9 ms | 1.35× | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-right.top-left]">Handsontable · 100,000 rows · scroll right · top left</span> | 10.6 ms / 10.7 ms | 16.4 ms / 17.8 ms | 1.56× (p95 1.66×) | **Flagged** |
| Render baseline · Handsontable control | <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-smooth.same-window]">Handsontable · 100,000 rows · scroll smooth · same window</span> | 7.72 ms / 8.33 ms | 10.5 ms / 11.3 ms | 1.36× | **Flagged** |

## Reading the flags

Each flag compares one 0.6.0 capture with one fresh 0.5.4 capture of the same suite. A flag means that pair exceeded the suite's documented budget; it is not a controlled confirmation of a regression.

All nine `render-baseline.json` flags are Handsontable rows. Handsontable is the comparison control and is version 18.1.2 on both sides, so these flags reflect variation between the two capture sessions, not a Sheetwrite change. The cause is not isolated, and the rows are not normalized or suppressed. They also indicate how much render timing can move between sessions on this machine.

The aggregate `full-engine-results.json` table repeats three flags from the default and full formula tables. They are the same measurements, not independent replications.

## Formula flags re-measured

Four distinct formula rows are flagged: 10k parse-load p95, default-engine sorted text lookup, full-engine 1k parse-load and full-engine text lookup. Each was re-measured with the frozen harness's own workload factories, running every preceding workload in its original order, in 20 fresh processes per side: 10 interleaved ABBA blocks, 100 timed samples per row and side, on the full CPU mask.

Paired ratios, 0.6 / 0.5.4, with 99% block-bootstrap intervals: 10k parse-load median 0.987 [0.934, 1.041], p95 1.004 [0.940, 1.066]; full-engine 1k parse-load median 0.997 [0.927, 1.079], p95 1.039 [0.973, 1.118]; default-engine sorted text lookup median 1.044 [1.015, 1.077], p95 1.000 [0.883, 1.094]; full-engine text lookup median 1.128 [1.094, 1.170], p95 1.142 [1.086, 1.222].

The two parse-load flags did not reproduce. Text lookup is slower in 0.6: about 4% with the default engine and about 13% with the full engine. Both are within the 25% release budget, but they are real costs. Data: `bench/results/capture-attempts/formula-prefix-summary.json`, raw samples in `formula-prefix-10.json.gz`.

The separate paired formula gate passed all 52 rows at 8ac21089, using engine binaries that match ac4ab632 by SHA-256. Log: `bench/results/capture-attempts/formula-paired-gate.log`.

## Formula CPU affinity

Formula suites run on the full logical CPU mask on an otherwise quiet machine, as the 0.4.0 and 0.5.0 captures did. Earlier 0.6.0 attempts pinned the process to one CPU, then to two. Both starve JavaScriptCore's background WebAssembly compiler, which then competes with the timed work.

On one CPU, the 1k parse-load row split into fast and slow groups for both engines and failed the absolute gate twice. On two CPUs, XIRR after LINEST looked 44% slower; the same worker on the full mask measured 0.6 faster, with a paired ratio of 0.728 [0.651, 0.797]. These superseded captures and failed receipts remain under `bench/results/capture-attempts/` as diagnostics and are not mixed into these tables. No engine change, delay, JIT flag or relaxed budget was used.

These suites run in Bun, which uses JavaScriptCore. Most browsers running Sheetwrite use V8, whose WebAssembly compilation tiers differ, so cold-compilation effects measured here may not carry over to Chrome.

## Evidence handling

Capture receipts record command arguments without this machine's directories: a path inside the repository is repository-relative, and any other path keeps only its last segment under `&lt;external&gt;`. Four receipts captured before that rule had their arguments rewritten the same way; nothing else in them changed.

The 0.5.4 plain-formula baseline was captured a second time with a repository-relative output path, because the first capture wrote this machine's path into the result file. The replaced capture is kept as `capture-attempts/formula-before-portability-baseline.json.gz`, with machine directory prefixes replaced by placeholders.

The 0.6.0 captures ran on commit ac4ab632, which is not published because its tree holds receipts written before the argument rule above. Its packages are byte-identical to the 0.6.0 packages in this release; it differs only in benchmark tooling and results. The 0.5.4 baseline ran on dcfb2037, the 0.5.4 release branch before it was squash-merged; its packages are byte-identical to the published 0.5.4 release, 37fed9c7 on develop.

The 0.6.0 candidate is the release stack before its version bump, so raw package-version strings can still read 0.5.4; commits and loaded binary hashes identify the engines. Older committed 0.5.x results are history only, not comparison inputs.

## Capture conditions

Both releases were captured on the same machine and toolchain, one suite at a time, each in its own scope with a 8G memory cap. The parent slice's memory-high counter must stay unchanged during a suite. Each suite uses the same effective CPU mask on both sides; the comparison refuses a mismatch.

| Suite | Effective CPU mask |
| --- | --- |
| Chart tracking | 4 |
| Core paths | 4 |
| Data | 4 |
| Formula | 0-19 |
| Formula engines | 0-19 |
| Formula matched | 0-19 |
| Interaction | 4 |
| Paged | 4 |
| Pivot | 4 |
| Regression baseline | 4 |
| Render scale | 4 |
| Xlsx | 4 |

For data captures, a full garbage collection runs between samples, untimed. Each ingest sample also gets a fresh happy-dom document after the prior sample has released its store or grid. Both versions use data protocol v2. Mixed protocol versions are rejected.

Formula tables compare the 0.5.4 engine (WASM) under the 0.6 core and harness with the 0.6 engine under that same core and harness. They isolate the engine difference only. The source records both commits and the hashes of the loaded binaries. Grid constant edits and Node initialization time current-core paths, so those measurements are 0.6-only and have no version ratio.

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

Comparison base: <code>release/version-0.5.4</code> at <code title="dcfb2037cc340451cf68bc4369e419c9adb13b3f">dcfb2037cc34</code>. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code>.

## Every measurement

Each suite's full table, closed. Hover a measurement for its key in the raw artifact.

<details class="bench-all"><summary>Render scale · 112 measurements</summary>

Artifact <code>bench/results/render-scale.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 16:36 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:15 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=altering.insert-5-rows-top]">Handsontable · 1,000,000 rows · altering · insert 5 rows top</span> | 91.7 ms / 175 ms | 95.2 ms / 165 ms | 1.04× (p95 0.94×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=altering.remove-5-rows-top]">Handsontable · 1,000,000 rows · altering · remove 5 rows top</span> | 76.8 ms / 81.1 ms | 79.7 ms / 124 ms | 1.04× (p95 1.52×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=arrow-down.top-left]">Handsontable · 1,000,000 rows · arrow down · top left</span> | 1.31 ms / 1.38 ms | 1.38 ms / 1.47 ms | 1.05× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=arrow-right.middle]">Handsontable · 1,000,000 rows · arrow right · middle</span> | 1.21 ms / 1.29 ms | 1.31 ms / 1.36 ms | 1.08× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=edit-commit.middle]">Handsontable · 1,000,000 rows · edit commit · middle</span> | 4.64 ms / 4.80 ms | 7.59 ms / 7.88 ms | 1.64× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=edit-open.bottom-right]">Handsontable · 1,000,000 rows · edit open · bottom right</span> | 1.31 ms / 1.37 ms | 1.44 ms / 1.71 ms | 1.10× (p95 1.25×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=edit-open.middle]">Handsontable · 1,000,000 rows · edit open · middle</span> | 1.01 ms / 2.33 ms | 1.03 ms / 1.08 ms | 1.02× (p95 0.46×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=edit-open.top-left]">Handsontable · 1,000,000 rows · edit open · top left</span> | 0.98 ms / 1.01 ms | 1.02 ms / 1.09 ms | 1.04× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=formatted-paint.top-left]">Handsontable · 1,000,000 rows · formatted paint · top left</span> | 3.15 ms / 3.22 ms | 5.95 ms / 6.10 ms | 1.89× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=merge-heavy.paint]">Handsontable · 1,000,000 rows · merge heavy · paint</span> | 3.40 ms / 3.62 ms | 6.28 ms / 6.34 ms | 1.85× (p95 1.75×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=scroll-down.middle]">Handsontable · 1,000,000 rows · scroll down · middle</span> | 3.93 ms / 6.72 ms | 6.75 ms / 7.26 ms | 1.72× (p95 1.08×) | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=scroll-down.top-left]">Handsontable · 1,000,000 rows · scroll down · top left</span> | 14.4 ms / 14.9 ms | 20.3 ms / 21.0 ms | 1.41× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=scroll-right.top-left]">Handsontable · 1,000,000 rows · scroll right · top left</span> | 10.3 ms / 10.5 ms | 16.0 ms / 16.6 ms | 1.55× | Slower |
| <span title="results[engine=handsontable;rows=1000000;scenarioId=scroll-smooth.same-window]">Handsontable · 1,000,000 rows · scroll smooth · same window</span> | 7.36 ms / 7.69 ms | 10.3 ms / 10.5 ms | 1.40× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=altering.insert-5-rows-top]">Handsontable · 100,000 rows · altering · insert 5 rows top</span> | 13.2 ms / 18.2 ms | 15.9 ms / 19.6 ms | 1.21× (p95 1.08×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=altering.remove-5-rows-top]">Handsontable · 100,000 rows · altering · remove 5 rows top</span> | 11.5 ms / 12.0 ms | 14.7 ms / 15.3 ms | 1.28× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=arrow-down.top-left]">Handsontable · 100,000 rows · arrow down · top left</span> | 1.32 ms / 1.85 ms | 1.40 ms / 1.75 ms | 1.07× (p95 0.94×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=arrow-right.middle]">Handsontable · 100,000 rows · arrow right · middle</span> | 1.24 ms / 1.32 ms | 1.31 ms / 1.43 ms | 1.06× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-commit.middle]">Handsontable · 100,000 rows · edit commit · middle</span> | 4.62 ms / 5.46 ms | 7.60 ms / 7.86 ms | 1.64× (p95 1.44×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.bottom-right]">Handsontable · 100,000 rows · edit open · bottom right</span> | 1.32 ms / 1.62 ms | 1.43 ms / 1.76 ms | 1.08× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.middle]">Handsontable · 100,000 rows · edit open · middle</span> | 0.96 ms / 1.24 ms | 1.03 ms / 1.26 ms | 1.07× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.top-left]">Handsontable · 100,000 rows · edit open · top left</span> | 0.98 ms / 1.16 ms | 1.05 ms / 1.18 ms | 1.07× (p95 1.02×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=formatted-paint.top-left]">Handsontable · 100,000 rows · formatted paint · top left</span> | 3.21 ms / 3.71 ms | 6.03 ms / 6.54 ms | 1.88× (p95 1.76×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=merge-heavy.paint]">Handsontable · 100,000 rows · merge heavy · paint</span> | 3.38 ms / 3.57 ms | 6.25 ms / 6.54 ms | 1.85× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-down.middle]">Handsontable · 100,000 rows · scroll down · middle</span> | 4.05 ms / 4.67 ms | 6.85 ms / 7.77 ms | 1.69× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-down.top-left]">Handsontable · 100,000 rows · scroll down · top left</span> | 14.6 ms / 15.0 ms | 20.4 ms / 20.9 ms | 1.40× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-right.top-left]">Handsontable · 100,000 rows · scroll right · top left</span> | 10.2 ms / 10.4 ms | 15.9 ms / 16.9 ms | 1.57× (p95 1.62×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-smooth.same-window]">Handsontable · 100,000 rows · scroll smooth · same window</span> | 7.32 ms / 7.66 ms | 10.2 ms / 10.5 ms | 1.40× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=altering.insert-5-rows-top]">Handsontable · 10,000 rows · altering · insert 5 rows top</span> | 5.95 ms / 6.79 ms | 8.98 ms / 10.3 ms | 1.51× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=altering.remove-5-rows-top]">Handsontable · 10,000 rows · altering · remove 5 rows top</span> | 5.67 ms / 6.70 ms | 8.69 ms / 10.1 ms | 1.53× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=arrow-down.top-left]">Handsontable · 10,000 rows · arrow down · top left</span> | 1.31 ms / 1.74 ms | 1.46 ms / 1.83 ms | 1.11× (p95 1.05×) | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=arrow-right.middle]">Handsontable · 10,000 rows · arrow right · middle</span> | 1.22 ms / 1.57 ms | 1.30 ms / 1.84 ms | 1.06× (p95 1.17×) | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=edit-commit.middle]">Handsontable · 10,000 rows · edit commit · middle</span> | 4.59 ms / 5.16 ms | 7.53 ms / 7.95 ms | 1.64× (p95 1.54×) | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=edit-open.bottom-right]">Handsontable · 10,000 rows · edit open · bottom right</span> | 1.30 ms / 1.46 ms | 1.40 ms / 1.59 ms | 1.08× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=edit-open.middle]">Handsontable · 10,000 rows · edit open · middle</span> | 0.96 ms / 1.09 ms | 1.01 ms / 1.13 ms | 1.06× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=edit-open.top-left]">Handsontable · 10,000 rows · edit open · top left</span> | 0.98 ms / 1.07 ms | 1.05 ms / 1.15 ms | 1.08× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=formatted-paint.top-left]">Handsontable · 10,000 rows · formatted paint · top left</span> | 3.16 ms / 3.42 ms | 5.97 ms / 6.19 ms | 1.89× (p95 1.81×) | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=merge-heavy.paint]">Handsontable · 10,000 rows · merge heavy · paint</span> | 3.38 ms / 3.59 ms | 6.16 ms / 6.49 ms | 1.82× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=scroll-down.middle]">Handsontable · 10,000 rows · scroll down · middle</span> | 3.99 ms / 4.25 ms | 6.73 ms / 7.71 ms | 1.69× (p95 1.81×) | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=scroll-down.top-left]">Handsontable · 10,000 rows · scroll down · top left</span> | 14.4 ms / 14.9 ms | 20.2 ms / 21.0 ms | 1.41× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=scroll-right.top-left]">Handsontable · 10,000 rows · scroll right · top left</span> | 10.3 ms / 11.7 ms | 16.0 ms / 18.4 ms | 1.56× | Slower |
| <span title="results[engine=handsontable;rows=10000;scenarioId=scroll-smooth.same-window]">Handsontable · 10,000 rows · scroll smooth · same window</span> | 7.29 ms / 7.54 ms | 10.2 ms / 10.4 ms | 1.40× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=altering.insert-5-rows-top]">Handsontable · 1,000 rows · altering · insert 5 rows top</span> | 5.37 ms / 6.28 ms | 8.40 ms / 9.04 ms | 1.56× (p95 1.44×) | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=altering.remove-5-rows-top]">Handsontable · 1,000 rows · altering · remove 5 rows top</span> | 5.22 ms / 5.88 ms | 8.12 ms / 9.03 ms | 1.56× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=arrow-down.top-left]">Handsontable · 1,000 rows · arrow down · top left</span> | 1.34 ms / 1.55 ms | 1.42 ms / 1.77 ms | 1.06× (p95 1.14×) | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=arrow-right.middle]">Handsontable · 1,000 rows · arrow right · middle</span> | 1.24 ms / 1.54 ms | 1.32 ms / 1.62 ms | 1.07× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=edit-commit.middle]">Handsontable · 1,000 rows · edit commit · middle</span> | 4.59 ms / 5.27 ms | 7.50 ms / 8.08 ms | 1.63× (p95 1.53×) | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=edit-open.bottom-right]">Handsontable · 1,000 rows · edit open · bottom right</span> | 1.32 ms / 1.44 ms | 1.39 ms / 1.54 ms | 1.06× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=edit-open.middle]">Handsontable · 1,000 rows · edit open · middle</span> | 0.95 ms / 1.05 ms | 1.02 ms / 1.12 ms | 1.07× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=edit-open.top-left]">Handsontable · 1,000 rows · edit open · top left</span> | 0.97 ms / 1.07 ms | 1.04 ms / 1.14 ms | 1.07× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=formatted-paint.top-left]">Handsontable · 1,000 rows · formatted paint · top left</span> | 3.21 ms / 3.53 ms | 6.00 ms / 6.47 ms | 1.87× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=merge-heavy.paint]">Handsontable · 1,000 rows · merge heavy · paint</span> | 3.70 ms / 3.85 ms | 6.40 ms / 6.85 ms | 1.73× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=scroll-down.middle]">Handsontable · 1,000 rows · scroll down · middle</span> | 3.90 ms / 4.19 ms | 6.65 ms / 7.55 ms | 1.71× (p95 1.80×) | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=scroll-down.top-left]">Handsontable · 1,000 rows · scroll down · top left</span> | 14.4 ms / 15.0 ms | 20.2 ms / 21.0 ms | 1.40× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=scroll-right.top-left]">Handsontable · 1,000 rows · scroll right · top left</span> | 10.2 ms / 11.1 ms | 16.3 ms / 17.6 ms | 1.59× | Slower |
| <span title="results[engine=handsontable;rows=1000;scenarioId=scroll-smooth.same-window]">Handsontable · 1,000 rows · scroll smooth · same window</span> | 7.36 ms / 7.96 ms | 10.2 ms / 10.4 ms | 1.39× (p95 1.31×) | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=altering.insert-5-rows-top]">Sheetwrite · 1,000,000 rows · altering · insert 5 rows top</span> | 12.0 ms / 12.2 ms | 12.5 ms / 12.6 ms | 1.04× | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=altering.remove-5-rows-top]">Sheetwrite · 1,000,000 rows · altering · remove 5 rows top</span> | 12.0 ms / 12.5 ms | 12.4 ms / 12.8 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=arrow-down.top-left]">Sheetwrite · 1,000,000 rows · arrow down · top left</span> | 0.61 ms / 1.37 ms | 0.59 ms / 1.23 ms | 0.97× (p95 0.90×) | Faster |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=arrow-right.middle]">Sheetwrite · 1,000,000 rows · arrow right · middle</span> | 0.61 ms / 1.24 ms | 0.60 ms / 1.43 ms | 1.00× (p95 1.16×) | Faster |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=edit-commit.middle]">Sheetwrite · 1,000,000 rows · edit commit · middle</span> | 0.82 ms / 1.44 ms | 0.87 ms / 1.57 ms | 1.06× | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.bottom-right]">Sheetwrite · 1,000,000 rows · edit open · bottom right</span> | 0.45 ms / 1.44 ms | 0.46 ms / 1.51 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.middle]">Sheetwrite · 1,000,000 rows · edit open · middle</span> | 0.58 ms / 1.52 ms | 0.56 ms / 1.30 ms | 0.95× (p95 0.86×) | Faster |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=edit-open.top-left]">Sheetwrite · 1,000,000 rows · edit open · top left</span> | 0.50 ms / 1.42 ms | 0.58 ms / 1.37 ms | 1.15× (p95 0.96×) | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=formatted-paint.top-left]">Sheetwrite · 1,000,000 rows · formatted paint · top left</span> | 0.41 ms / 0.70 ms | 4 µs | 0.01× | Faster |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=merge-heavy.paint]">Sheetwrite · 1,000,000 rows · merge heavy · paint</span> | 3 µs | 3 µs | 1.00× | Unchanged |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=scroll-down.middle]">Sheetwrite · 1,000,000 rows · scroll down · middle</span> | 1.10 ms / 1.81 ms | 1.12 ms / 1.67 ms | 1.02× (p95 0.93×) | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=scroll-down.top-left]">Sheetwrite · 1,000,000 rows · scroll down · top left</span> | 1.11 ms / 1.18 ms | 1.16 ms / 1.26 ms | 1.05× | Slower |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=scroll-right.top-left]">Sheetwrite · 1,000,000 rows · scroll right · top left</span> | 0.27 ms / 0.41 ms | 0.26 ms / 0.40 ms | 0.99× | Faster |
| <span title="results[engine=sheetwrite;rows=1000000;scenarioId=scroll-smooth.same-window]">Sheetwrite · 1,000,000 rows · scroll smooth · same window</span> | 0.38 ms / 0.39 ms | 0.39 ms / 0.40 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=altering.insert-5-rows-top]">Sheetwrite · 100,000 rows · altering · insert 5 rows top</span> | 1.77 ms / 1.93 ms | 1.87 ms / 2.08 ms | 1.06× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=altering.remove-5-rows-top]">Sheetwrite · 100,000 rows · altering · remove 5 rows top</span> | 1.57 ms / 1.65 ms | 1.67 ms / 1.80 ms | 1.06× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=arrow-down.top-left]">Sheetwrite · 100,000 rows · arrow down · top left</span> | 0.65 ms / 0.73 ms | 0.68 ms / 0.76 ms | 1.04× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=arrow-right.middle]">Sheetwrite · 100,000 rows · arrow right · middle</span> | 0.66 ms / 0.74 ms | 0.68 ms / 0.76 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-commit.middle]">Sheetwrite · 100,000 rows · edit commit · middle</span> | 0.91 ms / 1.04 ms | 0.96 ms / 1.15 ms | 1.05× (p95 1.11×) | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.bottom-right]">Sheetwrite · 100,000 rows · edit open · bottom right</span> | 0.53 ms / 0.58 ms | 0.55 ms / 0.60 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.middle]">Sheetwrite · 100,000 rows · edit open · middle</span> | 0.63 ms / 0.73 ms | 0.67 ms / 0.74 ms | 1.05× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.top-left]">Sheetwrite · 100,000 rows · edit open · top left</span> | 0.56 ms / 0.61 ms | 0.59 ms / 0.62 ms | 1.04× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=formatted-paint.top-left]">Sheetwrite · 100,000 rows · formatted paint · top left</span> | 0.47 ms / 0.53 ms | 4 µs | 0.01× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=merge-heavy.paint]">Sheetwrite · 100,000 rows · merge heavy · paint</span> | 3 µs / 4 µs | 3 µs / 5 µs | 1.00× (p95 1.23×) | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.middle]">Sheetwrite · 100,000 rows · scroll down · middle</span> | 1.13 ms / 1.26 ms | 1.21 ms / 1.34 ms | 1.07× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.top-left]">Sheetwrite · 100,000 rows · scroll down · top left</span> | 1.18 ms / 1.27 ms | 1.23 ms / 1.48 ms | 1.04× (p95 1.17×) | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-right.top-left]">Sheetwrite · 100,000 rows · scroll right · top left</span> | 0.26 ms / 0.32 ms | 0.25 ms / 0.35 ms | 0.98× (p95 1.10×) | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-smooth.same-window]">Sheetwrite · 100,000 rows · scroll smooth · same window</span> | 0.38 ms | 0.39 ms / 0.42 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=altering.insert-5-rows-top]">Sheetwrite · 10,000 rows · altering · insert 5 rows top</span> | 1.04 ms / 1.17 ms | 1.06 ms / 1.22 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=altering.remove-5-rows-top]">Sheetwrite · 10,000 rows · altering · remove 5 rows top</span> | 1.10 ms / 1.21 ms | 1.11 ms / 1.23 ms | 1.01× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=arrow-down.top-left]">Sheetwrite · 10,000 rows · arrow down · top left</span> | 0.65 ms / 0.70 ms | 0.67 ms / 0.70 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=arrow-right.middle]">Sheetwrite · 10,000 rows · arrow right · middle</span> | 0.65 ms / 0.72 ms | 0.66 ms / 0.74 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=edit-commit.middle]">Sheetwrite · 10,000 rows · edit commit · middle</span> | 0.90 ms / 1.00 ms | 0.96 ms / 1.10 ms | 1.06× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=edit-open.bottom-right]">Sheetwrite · 10,000 rows · edit open · bottom right</span> | 0.54 ms / 0.61 ms | 0.54 ms / 0.63 ms | 1.00× | Faster |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=edit-open.middle]">Sheetwrite · 10,000 rows · edit open · middle</span> | 0.64 ms / 0.68 ms | 0.66 ms / 0.71 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=edit-open.top-left]">Sheetwrite · 10,000 rows · edit open · top left</span> | 0.57 ms / 0.63 ms | 0.57 ms / 0.65 ms | 1.00× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=formatted-paint.top-left]">Sheetwrite · 10,000 rows · formatted paint · top left</span> | 0.46 ms / 0.49 ms | 4 µs | 0.01× | Faster |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=merge-heavy.paint]">Sheetwrite · 10,000 rows · merge heavy · paint</span> | 3 µs / 4 µs | 3 µs / 5 µs | 1.00× (p95 1.11×) | Faster |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=scroll-down.middle]">Sheetwrite · 10,000 rows · scroll down · middle</span> | 1.15 ms / 1.22 ms | 1.20 ms / 1.29 ms | 1.04× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=scroll-down.top-left]">Sheetwrite · 10,000 rows · scroll down · top left</span> | 1.17 ms / 1.31 ms | 1.24 ms / 1.35 ms | 1.07× | Slower |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=scroll-right.top-left]">Sheetwrite · 10,000 rows · scroll right · top left</span> | 0.27 ms / 0.30 ms | 0.26 ms / 0.33 ms | 0.99× (p95 1.10×) | Faster |
| <span title="results[engine=sheetwrite;rows=10000;scenarioId=scroll-smooth.same-window]">Sheetwrite · 10,000 rows · scroll smooth · same window</span> | 0.37 ms / 0.40 ms | 0.40 ms / 0.42 ms | 1.06× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=altering.insert-5-rows-top]">Sheetwrite · 1,000 rows · altering · insert 5 rows top</span> | 1.00 ms / 1.11 ms | 1.03 ms / 1.17 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=altering.remove-5-rows-top]">Sheetwrite · 1,000 rows · altering · remove 5 rows top</span> | 1.06 ms / 1.17 ms | 1.06 ms / 1.18 ms | 1.00× | Faster |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=arrow-down.top-left]">Sheetwrite · 1,000 rows · arrow down · top left</span> | 0.66 ms / 0.70 ms | 0.69 ms / 0.75 ms | 1.04× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=arrow-right.middle]">Sheetwrite · 1,000 rows · arrow right · middle</span> | 0.67 ms / 0.73 ms | 0.67 ms / 0.73 ms | 1.01× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=edit-commit.middle]">Sheetwrite · 1,000 rows · edit commit · middle</span> | 0.90 ms / 1.03 ms | 0.94 ms / 1.09 ms | 1.05× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=edit-open.bottom-right]">Sheetwrite · 1,000 rows · edit open · bottom right</span> | 0.55 ms / 0.57 ms | 0.55 ms / 0.60 ms | 1.01× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=edit-open.middle]">Sheetwrite · 1,000 rows · edit open · middle</span> | 0.65 ms / 0.68 ms | 0.67 ms / 0.72 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=edit-open.top-left]">Sheetwrite · 1,000 rows · edit open · top left</span> | 0.58 ms / 0.64 ms | 0.58 ms / 0.69 ms | 1.01× (p95 1.08×) | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=formatted-paint.top-left]">Sheetwrite · 1,000 rows · formatted paint · top left</span> | 0.46 ms / 0.48 ms | 4 µs | 0.01× | Faster |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=merge-heavy.paint]">Sheetwrite · 1,000 rows · merge heavy · paint</span> | 3 µs / 4 µs | 3 µs / 4 µs | 0.97× (p95 1.09×) | Faster |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=scroll-down.middle]">Sheetwrite · 1,000 rows · scroll down · middle</span> | 1.21 ms / 1.30 ms | 1.17 ms / 1.30 ms | 0.97× | Faster |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=scroll-down.top-left]">Sheetwrite · 1,000 rows · scroll down · top left</span> | 1.15 ms / 1.31 ms | 1.26 ms / 1.37 ms | 1.09× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=scroll-right.top-left]">Sheetwrite · 1,000 rows · scroll right · top left</span> | 0.27 ms / 0.31 ms | 0.27 ms / 0.32 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=1000;scenarioId=scroll-smooth.same-window]">Sheetwrite · 1,000 rows · scroll smooth · same window</span> | 0.37 ms / 0.40 ms | 0.39 ms / 0.42 ms | 1.04× | Slower |

</details>

<details class="bench-all"><summary>Interaction · 7 measurements</summary>

Artifact <code>bench/results/interaction-results.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:16 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:16 UTC.

Threshold: **absolute-ceiling**. lookupP95Ns uses the median; byte and owned long-task ceilings apply to every sample. Historical deltas are descriptive, not relative gates. Source: <code>bench/src/interaction-gate.ts</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="values.dirty100Bytes">Dirty100 bytes</span> | 5.5 KiB | 5.5 KiB | 1.00× | Unchanged |
| <span title="values.inverseIndexBytes">Inverse index bytes</span> | 3.8 MiB | 3.8 MiB | 1.00× | Unchanged |
| <span title="values.lookupMedianNs">Lookup median ns</span> | 19.9 ns / 20.8 ns | 21.0 ns / 21.4 ns | 1.05× | Slower |
| <span title="values.lookupP95Ns">Lookup p95 ns</span> | 251.9 ns / 348.1 ns | 250.1 ns / 318.5 ns | 0.99× (p95 0.92×) | Faster |
| <span title="values.ownedColdLongTaskMs">Owned cold long task ms</span> | 0.00 ms | 0.00 ms | 1.00× | Unchanged |
| <span title="values.unattributedColdLongTaskMs">Unattributed cold long task ms</span> | 94.6 ms / 99.1 ms | 99.2 ms / 107 ms | 1.05× | Slower |
| <span title="values.usableMs">Usable ms</span> | 1.10 s / 1.15 s | 1.44 s / 1.49 s | 1.31× | Slower |

</details>

<details class="bench-all"><summary>Paged · 5 measurements</summary>

Artifact <code>bench/results/paged-results.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:16 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:16 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="timings.cache-churn.stat">Timings · cache churn</span> | 18.5 ms / 48.7 ms | 17.0 ms / 66.1 ms | 0.92× (p95 1.36×) | Faster |
| <span title="timings.distant-page.stat">Timings · distant page</span> | 0.15 ms / 1.15 ms | 0.13 ms / 1.51 ms | 0.88× (p95 1.32×) | Faster |
| <span title="timings.first-page.stat">Timings · first page</span> | 0.15 ms / 2.44 ms | 0.15 ms / 3.85 ms | 0.95× (p95 1.58×) | Faster |
| <span title="timings.startup.stat">Timings · startup</span> | 0.10 ms / 1.99 ms | 0.11 ms / 1.98 ms | 1.13× (p95 1.00×) | Slower |
| <span title="timings.wide-page.stat">Timings · wide page</span> | 12.3 ms / 41.9 ms | 10.9 ms / 37.5 ms | 0.89× | Faster |

</details>

<details class="bench-all"><summary>Data · 89 measurements</summary>

Artifact <code>bench/results/data-results.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:28 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:40 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="handsontable.1000.stats.aggregate">Handsontable · 1,000 · stats · aggregate</span> | 0.12 ms / 0.17 ms | 0.13 ms / 0.18 ms | 1.05× | Slower |
| <span title="handsontable.1000.stats.distinctHigh">Handsontable · 1,000 · stats · distinct high</span> | 0.15 ms / 0.18 ms | 0.16 ms / 0.28 ms | 1.03× (p95 1.51×) | Slower |
| <span title="handsontable.1000.stats.distinctLow">Handsontable · 1,000 · stats · distinct low</span> | 0.13 ms / 0.20 ms | 0.12 ms / 0.16 ms | 0.95× (p95 0.80×) | Faster |
| <span title="handsontable.1000.stats.edit">Handsontable · 1,000 · stats · edit</span> | 197 ms / 243 ms | 172 ms / 251 ms | 0.87× (p95 1.03×) | Faster |
| <span title="handsontable.1000.stats.filter">Handsontable · 1,000 · stats · filter</span> | 61.4 ms / 94.1 ms | 68.7 ms / 87.3 ms | 1.12× (p95 0.93×) | Slower |
| <span title="handsontable.1000.stats.ingest">Handsontable · 1,000 · stats · ingest</span> | 390 ms / 526 ms | 410 ms / 507 ms | 1.05× (p95 0.96×) | Slower |
| <span title="handsontable.1000.stats.multiFilter">Handsontable · 1,000 · stats · multi filter</span> | 125 ms / 138 ms | 149 ms / 202 ms | 1.20× (p95 1.47×) | Slower |
| <span title="handsontable.1000.stats.sort">Handsontable · 1,000 · stats · sort</span> | 150 ms / 158 ms | 171 ms / 196 ms | 1.13× (p95 1.25×) | Slower |
| <span title="handsontable.1000.stats.windowRead">Handsontable · 1,000 · stats · window read</span> | 0.17 ms / 0.21 ms | 0.17 ms / 0.20 ms | 1.02× (p95 0.96×) | Slower |
| <span title="handsontable.10000.stats.aggregate">Handsontable · 10,000 · stats · aggregate</span> | 1.02 ms / 1.42 ms | 1.04 ms / 1.40 ms | 1.02× | Slower |
| <span title="handsontable.10000.stats.distinctHigh">Handsontable · 10,000 · stats · distinct high</span> | 1.32 ms / 1.80 ms | 1.33 ms / 1.75 ms | 1.01× | Slower |
| <span title="handsontable.10000.stats.distinctLow">Handsontable · 10,000 · stats · distinct low</span> | 0.95 ms / 1.82 ms | 0.94 ms / 1.93 ms | 0.99× (p95 1.06×) | Faster |
| <span title="handsontable.10000.stats.edit">Handsontable · 10,000 · stats · edit</span> | 373 ms / 446 ms | 380 ms / 447 ms | 1.02× | Slower |
| <span title="handsontable.10000.stats.filter">Handsontable · 10,000 · stats · filter</span> | 589 ms / 627 ms | 582 ms / 617 ms | 0.99× | Faster |
| <span title="handsontable.10000.stats.ingest">Handsontable · 10,000 · stats · ingest</span> | 3.99 s / 4.30 s | 3.88 s / 4.16 s | 0.97× | Faster |
| <span title="handsontable.10000.stats.multiFilter">Handsontable · 10,000 · stats · multi filter</span> | 1.23 s / 1.32 s | 1.21 s / 1.25 s | 0.98× | Faster |
| <span title="handsontable.10000.stats.sort">Handsontable · 10,000 · stats · sort</span> | 1.44 s / 1.55 s | 1.44 s / 1.55 s | 1.00× | Unchanged |
| <span title="handsontable.10000.stats.windowRead">Handsontable · 10,000 · stats · window read</span> | 0.18 ms / 0.23 ms | 0.18 ms / 0.25 ms | 1.01× (p95 1.10×) | Slower |
| <span title="sheetwrite.1000.queries.filter-value-set-10">Sheetwrite · 1,000 · filter value set 10</span> | 0.19 ms / 0.72 ms | 0.17 ms / 0.67 ms | 0.86× (p95 0.92×) | Faster |
| <span title="sheetwrite.1000.queries.filter-value-set-1000">Sheetwrite · 1,000 · filter value set 1000</span> | 0.92 ms / 1.62 ms | 0.83 ms / 1.37 ms | 0.91× (p95 0.84×) | Faster |
| <span title="sheetwrite.1000.queries.ingest-numeric-only">Sheetwrite · 1,000 · ingest numeric only</span> | 0.30 ms / 0.43 ms | 0.24 ms / 0.35 ms | 0.77× | Faster |
| <span title="sheetwrite.1000.queries.sort-multi-key">Sheetwrite · 1,000 · sort multi key</span> | 0.24 ms / 0.39 ms | 0.17 ms / 0.32 ms | 0.72× (p95 0.81×) | Faster |
| <span title="sheetwrite.1000.queries.sort-with-candidates">Sheetwrite · 1,000 · sort with candidates</span> | 0.14 ms / 0.18 ms | 0.12 ms / 0.28 ms | 0.86× (p95 1.51×) | Faster |
| <span title="sheetwrite.1000.stats.aggregate">Sheetwrite · 1,000 · stats · aggregate</span> | 2 µs / 3 µs | 2 µs | 0.95× | Faster |
| <span title="sheetwrite.1000.stats.distinctHigh">Sheetwrite · 1,000 · stats · distinct high</span> | 0.25 ms / 0.39 ms | 0.21 ms / 1.46 ms | 0.85× (p95 3.74×) | Faster |
| <span title="sheetwrite.1000.stats.distinctLow">Sheetwrite · 1,000 · stats · distinct low</span> | 0.08 ms / 0.10 ms | 0.06 ms / 0.07 ms | 0.77× (p95 0.68×) | Faster |
| <span title="sheetwrite.1000.stats.edit">Sheetwrite · 1,000 · stats · edit</span> | 12.8 ms / 29.1 ms | 15.5 ms / 27.7 ms | 1.20× (p95 0.95×) | Slower |
| <span title="sheetwrite.1000.stats.filter">Sheetwrite · 1,000 · stats · filter</span> | 0.14 ms / 0.22 ms | 0.11 ms / 0.23 ms | 0.78× (p95 1.06×) | Faster |
| <span title="sheetwrite.1000.stats.ingest">Sheetwrite · 1,000 · stats · ingest</span> | 0.77 ms / 1.20 ms | 0.73 ms / 1.36 ms | 0.95× (p95 1.13×) | Faster |
| <span title="sheetwrite.1000.stats.multiFilter">Sheetwrite · 1,000 · stats · multi filter</span> | 0.19 ms / 0.26 ms | 0.16 ms / 0.29 ms | 0.85× (p95 1.11×) | Faster |
| <span title="sheetwrite.1000.stats.sort">Sheetwrite · 1,000 · stats · sort</span> | 0.23 ms / 0.25 ms | 0.20 ms / 0.65 ms | 0.84× (p95 2.61×) | Faster |
| <span title="sheetwrite.1000.stats.windowRead">Sheetwrite · 1,000 · stats · window read</span> | 0.01 ms / 0.03 ms | 0.01 ms / 0.02 ms | 0.89× (p95 0.78×) | Faster |
| <span title="sheetwrite.10000.queries.filter-value-set-10">Sheetwrite · 10,000 · filter value set 10</span> | 0.44 ms / 0.50 ms | 0.40 ms / 0.43 ms | 0.91× (p95 0.86×) | Faster |
| <span title="sheetwrite.10000.queries.filter-value-set-1000">Sheetwrite · 10,000 · filter value set 1000</span> | 1.13 ms / 1.17 ms | 1.03 ms / 1.12 ms | 0.91× | Faster |
| <span title="sheetwrite.10000.queries.ingest-numeric-only">Sheetwrite · 10,000 · ingest numeric only</span> | 1.88 ms / 1.99 ms | 1.48 ms / 1.53 ms | 0.79× | Faster |
| <span title="sheetwrite.10000.queries.sort-multi-key">Sheetwrite · 10,000 · sort multi key</span> | 2.69 ms / 5.39 ms | 2.64 ms / 3.42 ms | 0.98× (p95 0.64×) | Faster |
| <span title="sheetwrite.10000.queries.sort-with-candidates">Sheetwrite · 10,000 · sort with candidates</span> | 0.29 ms / 0.33 ms | 0.26 ms / 0.30 ms | 0.91× | Faster |
| <span title="sheetwrite.10000.stats.aggregate">Sheetwrite · 10,000 · stats · aggregate</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.93× (p95 0.64×) | Faster |
| <span title="sheetwrite.10000.stats.distinctHigh">Sheetwrite · 10,000 · stats · distinct high</span> | 1.37 ms / 2.55 ms | 1.31 ms / 2.25 ms | 0.96× (p95 0.88×) | Faster |
| <span title="sheetwrite.10000.stats.distinctLow">Sheetwrite · 10,000 · stats · distinct low</span> | 0.11 ms / 0.17 ms | 0.08 ms / 0.13 ms | 0.72× | Faster |
| <span title="sheetwrite.10000.stats.edit">Sheetwrite · 10,000 · stats · edit</span> | 7.54 ms / 17.5 ms | 7.96 ms / 17.6 ms | 1.06× (p95 1.00×) | Slower |
| <span title="sheetwrite.10000.stats.filter">Sheetwrite · 10,000 · stats · filter</span> | 0.13 ms / 0.16 ms | 0.12 ms / 0.16 ms | 0.98× | Faster |
| <span title="sheetwrite.10000.stats.ingest">Sheetwrite · 10,000 · stats · ingest</span> | 5.27 ms / 7.01 ms | 4.90 ms / 5.15 ms | 0.93× (p95 0.73×) | Faster |
| <span title="sheetwrite.10000.stats.multiFilter">Sheetwrite · 10,000 · stats · multi filter</span> | 0.47 ms / 0.66 ms | 0.44 ms / 0.49 ms | 0.93× (p95 0.75×) | Faster |
| <span title="sheetwrite.10000.stats.sort">Sheetwrite · 10,000 · stats · sort</span> | 0.26 ms / 0.35 ms | 0.26 ms / 0.57 ms | 0.98× (p95 1.63×) | Faster |
| <span title="sheetwrite.10000.stats.windowRead">Sheetwrite · 10,000 · stats · window read</span> | 0.01 ms | 0.01 ms | 0.90× | Faster |
| <span title="sheetwrite.100000.queries.filter-value-set-10">Sheetwrite · 100,000 · filter value set 10</span> | 3.06 ms / 3.13 ms | 2.88 ms / 3.12 ms | 0.94× (p95 1.00×) | Faster |
| <span title="sheetwrite.100000.queries.filter-value-set-1000">Sheetwrite · 100,000 · filter value set 1000</span> | 3.75 ms / 3.83 ms | 3.61 ms / 3.68 ms | 0.96× | Faster |
| <span title="sheetwrite.100000.queries.filter-value-set-50000">Sheetwrite · 100,000 · filter value set 50000</span> | 47.5 ms / 48.1 ms | 47.0 ms / 49.1 ms | 0.99× | Faster |
| <span title="sheetwrite.100000.queries.ingest-numeric-only">Sheetwrite · 100,000 · ingest numeric only</span> | 17.0 ms / 17.6 ms | 14.4 ms / 25.2 ms | 0.85× (p95 1.43×) | Faster |
| <span title="sheetwrite.100000.queries.sort-multi-key">Sheetwrite · 100,000 · sort multi key</span> | 34.8 ms / 35.2 ms | 35.7 ms / 35.9 ms | 1.03× | Slower |
| <span title="sheetwrite.100000.queries.sort-with-candidates">Sheetwrite · 100,000 · sort with candidates</span> | 2.13 ms / 2.32 ms | 2.09 ms / 2.29 ms | 0.98× | Faster |
| <span title="sheetwrite.100000.stats.aggregate">Sheetwrite · 100,000 · stats · aggregate</span> | 0.19 ms / 0.22 ms | 0.19 ms / 0.23 ms | 0.99× (p95 1.06×) | Faster |
| <span title="sheetwrite.100000.stats.distinctHigh">Sheetwrite · 100,000 · stats · distinct high</span> | 13.9 ms / 14.2 ms | 14.1 ms / 14.5 ms | 1.01× | Slower |
| <span title="sheetwrite.100000.stats.distinctLow">Sheetwrite · 100,000 · stats · distinct low</span> | 0.59 ms / 0.62 ms | 0.61 ms / 0.68 ms | 1.04× (p95 1.09×) | Slower |
| <span title="sheetwrite.100000.stats.edit">Sheetwrite · 100,000 · stats · edit</span> | 5.65 ms / 9.60 ms | 5.80 ms / 9.48 ms | 1.03× | Slower |
| <span title="sheetwrite.100000.stats.filter">Sheetwrite · 100,000 · stats · filter</span> | 0.44 ms / 0.48 ms | 0.40 ms / 0.54 ms | 0.91× (p95 1.13×) | Faster |
| <span title="sheetwrite.100000.stats.ingest">Sheetwrite · 100,000 · stats · ingest</span> | 62.3 ms / 76.1 ms | 56.3 ms / 66.8 ms | 0.90× | Faster |
| <span title="sheetwrite.100000.stats.multiFilter">Sheetwrite · 100,000 · stats · multi filter</span> | 3.71 ms / 3.86 ms | 3.52 ms / 3.75 ms | 0.95× | Faster |
| <span title="sheetwrite.100000.stats.sort">Sheetwrite · 100,000 · stats · sort</span> | 2.06 ms / 2.21 ms | 1.97 ms / 2.14 ms | 0.96× | Faster |
| <span title="sheetwrite.100000.stats.windowRead">Sheetwrite · 100,000 · stats · window read</span> | 0.01 ms / 0.02 ms | 0.01 ms | 0.89× | Faster |
| <span title="sheetwrite.1000000.queries.filter-value-set-10">Sheetwrite · 1,000,000 · filter value set 10</span> | 31.4 ms / 32.4 ms | 30.4 ms / 31.7 ms | 0.97× | Faster |
| <span title="sheetwrite.1000000.queries.filter-value-set-1000">Sheetwrite · 1,000,000 · filter value set 1000</span> | 31.5 ms / 32.5 ms | 30.7 ms / 31.0 ms | 0.98× | Faster |
| <span title="sheetwrite.1000000.queries.ingest-numeric-only">Sheetwrite · 1,000,000 · ingest numeric only</span> | 145 ms / 146 ms | 66.3 ms / 67.3 ms | 0.46× | Faster |
| <span title="sheetwrite.1000000.queries.sort-multi-key">Sheetwrite · 1,000,000 · sort multi key</span> | 537 ms / 550 ms | 503 ms / 511 ms | 0.94× | Faster |
| <span title="sheetwrite.1000000.queries.sort-with-candidates">Sheetwrite · 1,000,000 · sort with candidates</span> | 27.3 ms / 27.7 ms | 27.0 ms / 27.6 ms | 0.99× | Faster |
| <span title="sheetwrite.1000000.stats.aggregate">Sheetwrite · 1,000,000 · stats · aggregate</span> | 1.83 ms / 1.98 ms | 1.74 ms / 1.81 ms | 0.95× | Faster |
| <span title="sheetwrite.1000000.stats.distinctHigh">Sheetwrite · 1,000,000 · stats · distinct high</span> | 148 ms / 150 ms | 151 ms / 153 ms | 1.02× | Slower |
| <span title="sheetwrite.1000000.stats.distinctLow">Sheetwrite · 1,000,000 · stats · distinct low</span> | 6.16 ms / 6.43 ms | 5.22 ms / 5.44 ms | 0.85× | Faster |
| <span title="sheetwrite.1000000.stats.edit">Sheetwrite · 1,000,000 · stats · edit</span> | 6.42 ms / 8.61 ms | 6.75 ms / 24.9 ms | 1.05× (p95 2.89×) | Slower |
| <span title="sheetwrite.1000000.stats.filter">Sheetwrite · 1,000,000 · stats · filter</span> | 3.58 ms / 3.60 ms | 3.20 ms / 3.25 ms | 0.89× | Faster |
| <span title="sheetwrite.1000000.stats.ingest">Sheetwrite · 1,000,000 · stats · ingest</span> | 553 ms / 574 ms | 595 ms | 1.08× | Slower |
| <span title="sheetwrite.1000000.stats.multiFilter">Sheetwrite · 1,000,000 · stats · multi filter</span> | 38.1 ms / 38.9 ms | 37.2 ms / 37.3 ms | 0.98× | Faster |
| <span title="sheetwrite.1000000.stats.sort">Sheetwrite · 1,000,000 · stats · sort</span> | 23.3 ms / 24.1 ms | 22.4 ms / 23.4 ms | 0.96× | Faster |
| <span title="sheetwrite.1000000.stats.windowRead">Sheetwrite · 1,000,000 · stats · window read</span> | 0.02 ms | 0.02 ms | 0.86× | Faster |
| <span title="sheetwrite.500000.queries.filter-value-set-10">Sheetwrite · 500,000 · filter value set 10</span> | 15.2 ms / 16.6 ms | 14.9 ms / 16.0 ms | 0.98× | Faster |
| <span title="sheetwrite.500000.queries.filter-value-set-1000">Sheetwrite · 500,000 · filter value set 1000</span> | 16.0 ms / 16.2 ms | 16.0 ms / 16.1 ms | 1.00× | Faster |
| <span title="sheetwrite.500000.queries.ingest-numeric-only">Sheetwrite · 500,000 · ingest numeric only</span> | 67.8 ms | 72.6 ms / 73.0 ms | 1.07× | Slower |
| <span title="sheetwrite.500000.queries.sort-multi-key">Sheetwrite · 500,000 · sort multi key</span> | 214 ms / 218 ms | 221 ms / 254 ms | 1.03× (p95 1.17×) | Slower |
| <span title="sheetwrite.500000.queries.sort-with-candidates">Sheetwrite · 500,000 · sort with candidates</span> | 12.5 ms / 12.8 ms | 12.5 ms | 1.00× | Faster |
| <span title="sheetwrite.500000.stats.aggregate">Sheetwrite · 500,000 · stats · aggregate</span> | 0.89 ms / 0.95 ms | 0.88 ms / 0.92 ms | 1.00× | Faster |
| <span title="sheetwrite.500000.stats.distinctHigh">Sheetwrite · 500,000 · stats · distinct high</span> | 72.8 ms / 74.0 ms | 76.3 ms / 76.5 ms | 1.05× | Slower |
| <span title="sheetwrite.500000.stats.distinctLow">Sheetwrite · 500,000 · stats · distinct low</span> | 2.77 ms / 3.01 ms | 2.38 ms / 2.74 ms | 0.86× (p95 0.91×) | Faster |
| <span title="sheetwrite.500000.stats.edit">Sheetwrite · 500,000 · stats · edit</span> | 5.47 ms / 5.62 ms | 5.63 ms / 5.72 ms | 1.03× | Slower |
| <span title="sheetwrite.500000.stats.filter">Sheetwrite · 500,000 · stats · filter</span> | 1.75 ms / 1.79 ms | 1.56 ms / 1.61 ms | 0.90× | Faster |
| <span title="sheetwrite.500000.stats.ingest">Sheetwrite · 500,000 · stats · ingest</span> | 325 ms / 327 ms | 291 ms / 297 ms | 0.89× | Faster |
| <span title="sheetwrite.500000.stats.multiFilter">Sheetwrite · 500,000 · stats · multi filter</span> | 19.2 ms / 19.8 ms | 18.3 ms / 18.6 ms | 0.96× | Faster |
| <span title="sheetwrite.500000.stats.sort">Sheetwrite · 500,000 · stats · sort</span> | 10.0 ms / 10.1 ms | 10.0 ms / 10.1 ms | 1.00× | Unchanged |
| <span title="sheetwrite.500000.stats.windowRead">Sheetwrite · 500,000 · stats · window read</span> | 0.01 ms / 0.02 ms | 0.02 ms | 1.05× | Slower |

</details>

<details class="bench-all"><summary>Core paths · 14 measurements</summary>

Artifact <code>bench/results/core-paths-results.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-28 17:40 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:41 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="scenarios[id=command-state-select].timing">Command state select</span> | 9.18 ms / 18.0 ms | 9.84 ms / 16.4 ms | 1.07× (p95 0.91×) | Slower |
| <span title="scenarios[id=command-state-select].variants[id=with-command-state-handler].timing">Command state select · with command state handler</span> | 9.18 ms / 18.0 ms | 9.84 ms / 16.4 ms | 1.07× (p95 0.91×) | Slower |
| <span title="scenarios[id=command-state-select].variants[id=without-command-state-handler].timing">Command state select · without command state handler</span> | 7.63 ms / 11.8 ms | 7.44 ms / 12.4 ms | 0.98× (p95 1.06×) | Faster |
| <span title="scenarios[id=csv-import].timing">Csv import</span> | 231 ms / 244 ms | 218 ms / 231 ms | 0.95× | Faster |
| <span title="scenarios[id=node-cold-init].timing">Node cold init</span> | 6.36 ms / 7.57 ms | 6.84 ms / 8.08 ms | 1.08× | Slower |
| <span title="scenarios[id=paged-evicted-revisit].timing">Paged evicted revisit</span> | 8.06 ms / 10.6 ms | 14.7 ms / 17.6 ms | 1.82× (p95 1.66×) | Slower |
| <span title="scenarios[id=rebase-large].timing">Rebase large</span> | 1.73 ms / 1.83 ms | 3.76 ms / 4.90 ms | 2.18× (p95 2.67×) | Slower |
| <span title="scenarios[id=restore-near-ceiling].timing">Restore near ceiling</span> | 1.01 s | 840 ms / 896 ms | 0.84× (p95 0.89×) | Faster |
| <span title="scenarios[id=row-bridge-insert].timing">Row bridge insert</span> | 6.22 ms / 8.41 ms | 5.99 ms / 8.38 ms | 0.96× | Faster |
| <span title="scenarios[id=setblock-admission].timing">Setblock admission</span> | 546 ms / 560 ms | 545 ms / 556 ms | 1.00× | Faster |
| <span title="scenarios[id=setblock-detailed-capture].timing">Setblock detailed capture</span> | 698 ms / 782 ms | 657 ms / 766 ms | 0.94× | Faster |
| <span title="scenarios[id=sync-offline-queue].timing">Sync offline queue</span> | 0.64 ms / 1.60 ms | 0.03 ms / 1.59 ms | 0.05× (p95 0.99×) | Faster |
| <span title="scenarios[id=undo-large-clear].timing">Undo large clear</span> | 1.69 s / 1.70 s | 362 ms / 430 ms | 0.21× | Faster |
| <span title="scenarios[id=validation-sparse].timing">Validation sparse</span> | 187 ms / 194 ms | 181 ms / 182 ms | 0.97× | Faster |

</details>

<details class="bench-all"><summary>Chart tracking · 34 measurements</summary>

Artifact <code>bench/results/chart-tracking-results.json</code>. Baseline: 0.5.4, not available. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:42 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="baseline">Baseline</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=20000;source=literal].baselineMs">Inside · 20,000 · literal · baseline ms</span> | — | 6 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=20000;source=literal].commitMs">Inside · 20,000 · literal · commit ms</span> | — | 7 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=20000;source=literal].eventMs">Inside · 20,000 · literal · event ms</span> | — | 7 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=2000;source=literal].baselineMs">Inside · 2,000 · literal · baseline ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=2000;source=literal].commitMs">Inside · 2,000 · literal · commit ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=2000;source=literal].eventMs">Inside · 2,000 · literal · event ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=200;source=literal].baselineMs">Inside · 200 · literal · baseline ms</span> | — | 0.01 ms / 0.05 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=200;source=literal].commitMs">Inside · 200 · literal · commit ms</span> | — | 0.01 ms / 0.03 ms | — | New in 0.6 |
| <span title="rows[scenario=inside;chartCount=200;source=literal].eventMs">Inside · 200 · literal · event ms</span> | — | 0.01 ms / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].baselineMs">Literal dependency edit · 20,000 · formula · baseline ms</span> | — | 6 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].commitMs">Literal dependency edit · 20,000 · formula · commit ms</span> | — | 2.38 ms / 3.98 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=20000;source=formula].eventMs">Literal dependency edit · 20,000 · formula · event ms</span> | — | 2.38 ms / 3.98 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].baselineMs">Literal dependency edit · 2,000 · formula · baseline ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].commitMs">Literal dependency edit · 2,000 · formula · commit ms</span> | — | 0.17 ms / 0.29 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=2000;source=formula].eventMs">Literal dependency edit · 2,000 · formula · event ms</span> | — | 0.16 ms / 0.28 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=200;source=formula].baselineMs">Literal dependency edit · 200 · formula · baseline ms</span> | — | 0.01 ms / 0.05 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=200;source=formula].commitMs">Literal dependency edit · 200 · formula · commit ms</span> | — | 0.03 ms / 0.07 ms | — | New in 0.6 |
| <span title="rows[scenario=literal-dependency-edit;chartCount=200;source=formula].eventMs">Literal dependency edit · 200 · formula · event ms</span> | — | 0.03 ms / 0.06 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=20000;source=formula].baselineMs">Outside · 20,000 · formula · baseline ms</span> | — | 6 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=20000;source=formula].commitMs">Outside · 20,000 · formula · commit ms</span> | — | 2.35 ms / 4.18 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=20000;source=formula].eventMs">Outside · 20,000 · formula · event ms</span> | — | 2.35 ms / 4.17 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=20000;source=literal].baselineMs">Outside · 20,000 · literal · baseline ms</span> | — | 6 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=20000;source=literal].commitMs">Outside · 20,000 · literal · commit ms</span> | — | 7 µs / 0.03 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=2000;source=formula].baselineMs">Outside · 2,000 · formula · baseline ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=2000;source=formula].commitMs">Outside · 2,000 · formula · commit ms</span> | — | 0.18 ms / 0.24 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=2000;source=formula].eventMs">Outside · 2,000 · formula · event ms</span> | — | 0.18 ms / 0.23 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=2000;source=literal].baselineMs">Outside · 2,000 · literal · baseline ms</span> | — | 7 µs / 0.02 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=2000;source=literal].commitMs">Outside · 2,000 · literal · commit ms</span> | — | 6 µs / 0.01 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=200;source=formula].baselineMs">Outside · 200 · formula · baseline ms</span> | — | 0.01 ms / 0.05 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=200;source=formula].commitMs">Outside · 200 · formula · commit ms</span> | — | 0.05 ms / 0.21 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=200;source=formula].eventMs">Outside · 200 · formula · event ms</span> | — | 0.05 ms / 0.21 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=200;source=literal].baselineMs">Outside · 200 · literal · baseline ms</span> | — | 0.01 ms / 0.05 ms | — | New in 0.6 |
| <span title="rows[scenario=outside;chartCount=200;source=literal].commitMs">Outside · 200 · literal · commit ms</span> | — | 0.01 ms / 0.02 ms | — | New in 0.6 |

</details>

<details class="bench-all"><summary>Pivot · 5 measurements</summary>

Artifact <code>bench/results/pivot-results.json</code>. Baseline: 0.5.4, not available. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-28 17:42 UTC.

Threshold: **none**. No historical artifact at the base ref. The 100x incremental/full-build speedup target is an in-capture gate, not a historical comparison threshold. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="buildMs">Build ms</span> | — | 28.9 ms / 30.5 ms | — | New in 0.6 |
| <span title="donorKeyEditMs">Donor key edit ms</span> | — | 3 µs / 0.01 ms | — | New in 0.6 |
| <span title="editMs">Edit ms</span> | — | 2 µs / 0.01 ms | — | New in 0.6 |
| <span title="maxBuildMs">Max build ms</span> | — | 81.8 ms / 109 ms | — | New in 0.6 |
| <span title="maxExtremeEditMs">Max extreme edit ms</span> | — | 2 µs / 0.01 ms | — | New in 0.6 |

</details>

<details class="bench-all"><summary>Formula · 212 measurements · 1 flagged</summary>

Artifact <code>bench/results/formula-results.json</code>. Baseline: 0.5.4 engine (WASM) under 0.6 core and harness, <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:50 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes">Countif 100k · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.retainedBytes">Countif 100k · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.transientAllocations">Countif 100k · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].stat">Countif 100k · 100,000</span> | 0.94 ms / 1.06 ms | 0.87 ms / 0.91 ms | 0.92× (p95 0.86×) | Faster |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria multi range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes">Criteria multi range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations">Criteria multi range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].stat">Criteria multi range edit · 100,000</span> | 4.79 ms / 5.02 ms | 4.25 ms / 4.31 ms | 0.89× | Faster |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes">Criteria range edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations">Criteria range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].stat">Criteria range edit · 100,000</span> | 1.60 ms / 1.65 ms | 1.68 ms / 1.74 ms | 1.05× | Within budget |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes">Cross sheet range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes">Cross sheet range edit · 1,000 · allocation stat · retained bytes</span> | 624.9 KiB | 602.2 KiB | 0.96× | Smaller |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations">Cross sheet range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].stat">Cross sheet range edit · 1,000</span> | 0.51 ms / 0.54 ms | 0.25 ms / 0.26 ms | 0.49× | Faster |
| <span title="workloads[id=cycles;size=1000].allocationStat.peakTransientBytes">Cycles · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].allocationStat.retainedBytes">Cycles · 1,000 · allocation stat · retained bytes</span> | 727.5 KiB | 682.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=cycles;size=1000].allocationStat.transientAllocations">Cycles · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].stat">Cycles · 1,000</span> | 1.41 ms / 1.43 ms | 0.50 ms / 0.51 ms | 0.35× | Faster |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes">Diamond edit · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.retainedBytes">Diamond edit · 32 · allocation stat · retained bytes</span> | 42.1 KiB | 36.4 KiB | 0.87× | Smaller |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.transientAllocations">Diamond edit · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].stat">Diamond edit · 32</span> | 0.09 ms / 0.10 ms | 0.04 ms / 0.06 ms | 0.46× (p95 0.58×) | Faster |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes">Distinct range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes">Distinct range edit · 1,000 · allocation stat · retained bytes</span> | 844.8 KiB | 817.6 KiB | 0.97× | Smaller |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations">Distinct range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].stat">Distinct range edit · 1,000</span> | 0.01 ms / 0.02 ms | 0.01 ms / 0.02 ms | 0.91× | Faster |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes">Error propagation · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.retainedBytes">Error propagation · 1,000 · allocation stat · retained bytes</span> | 307.4 KiB | 276.6 KiB | 0.90× | Smaller |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.transientAllocations">Error propagation · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].stat">Error propagation · 1,000</span> | 0.73 ms / 0.75 ms | 0.25 ms / 0.26 ms | 0.34× | Faster |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes">Formula constant edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes">Formula constant edit · 100,000 · allocation stat · retained bytes</span> | 55.0 MiB | 53.3 MiB | 0.97× | Smaller |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations">Formula constant edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].stat">Formula constant edit · 100,000</span> | 0.03 ms / 0.04 ms | 0.03 ms / 0.04 ms | 1.00× (p95 1.06×) | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes">Incremental dependency closure edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes">Incremental dependency closure edit · 100,000 · allocation stat · retained bytes</span> | 72.0 MiB | 68.7 MiB | 0.95× | Smaller |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations">Incremental dependency closure edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].stat">Incremental dependency closure edit · 100,000</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.03 ms | 1.02× (p95 0.94×) | Within budget |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes">Independent first recompute · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes">Independent first recompute · 100,000 · allocation stat · retained bytes</span> | 36.6 MiB | 35.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations">Independent first recompute · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].stat">Independent first recompute · 100,000</span> | 80.3 ms / 81.5 ms | 39.5 ms / 41.3 ms | 0.49× | Faster |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes">Independent first recompute · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes">Independent first recompute · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations">Independent first recompute · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].stat">Independent first recompute · 10,000</span> | 5.65 ms / 5.72 ms | 2.71 ms / 2.82 ms | 0.48× | Faster |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes">Independent first recompute · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes">Independent first recompute · 1,000 · allocation stat · retained bytes</span> | 461.7 KiB | 434.9 KiB | 0.94× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations">Independent first recompute · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].stat">Independent first recompute · 1,000</span> | 0.61 ms / 1.06 ms | 0.45 ms / 0.47 ms | 0.74× (p95 0.44×) | Faster |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes">Independent parse load · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes">Independent parse load · 100,000 · allocation stat · retained bytes</span> | 28.5 MiB | 27.7 MiB | 0.97× | Smaller |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations">Independent parse load · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].stat">Independent parse load · 100,000</span> | 55.5 ms / 55.7 ms | 53.0 ms / 53.3 ms | 0.95× | Faster |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes">Independent parse load · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes">Independent parse load · 10,000 · allocation stat · retained bytes</span> | 3.1 MiB | 3.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations">Independent parse load · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].stat">Independent parse load · 10,000</span> | 6.06 ms / 6.43 ms | 5.97 ms / 8.62 ms | 0.99× (p95 1.34×) | **Flagged** |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes">Independent parse load · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes">Independent parse load · 1,000 · allocation stat · retained bytes</span> | 359.0 KiB | 344.3 KiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations">Independent parse load · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].stat">Independent parse load · 1,000</span> | 0.82 ms / 1.29 ms | 0.99 ms / 1.32 ms | 1.21× (p95 1.02×) | Within budget |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes">Iterative finance · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes">Iterative finance · 1,000 · allocation stat · retained bytes</span> | 878.6 KiB | 851.8 KiB | 0.97× | Smaller |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations">Iterative finance · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].stat">Iterative finance · 1,000</span> | 3.83 ms / 4.18 ms | 2.85 ms / 2.93 ms | 0.74× | Faster |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes">Let repeat · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.retainedBytes">Let repeat · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.transientAllocations">Let repeat · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].stat">Let repeat · 100,000</span> | 1.93 ms / 2.07 ms | 1.71 ms | 0.88× (p95 0.83×) | Faster |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes">Let reuse edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes">Let reuse edit · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations">Let reuse edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].stat">Let reuse edit · 100,000</span> | 0.64 ms / 0.66 ms | 0.50 ms / 0.51 ms | 0.78× | Faster |
| <span title="workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes">Linear chain · 16 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].allocationStat.retainedBytes">Linear chain · 16 · allocation stat · retained bytes</span> | 13.4 KiB | 8.4 KiB | 0.63× | Smaller |
| <span title="workloads[id=linear-chain;size=16].allocationStat.transientAllocations">Linear chain · 16 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].stat">Linear chain · 16</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.65× (p95 0.54×) | Faster |
| <span title="workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes">Linear chain · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].allocationStat.retainedBytes">Linear chain · 32 · allocation stat · retained bytes</span> | 20.5 KiB | 15.3 KiB | 0.75× | Smaller |
| <span title="workloads[id=linear-chain;size=32].allocationStat.transientAllocations">Linear chain · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].stat">Linear chain · 32</span> | 0.04 ms / 0.05 ms | 0.03 ms | 0.68× | Faster |
| <span title="workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes">Linear chain · 64 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].allocationStat.retainedBytes">Linear chain · 64 · allocation stat · retained bytes</span> | 34.7 KiB | 29.1 KiB | 0.84× | Smaller |
| <span title="workloads[id=linear-chain;size=64].allocationStat.transientAllocations">Linear chain · 64 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].stat">Linear chain · 64</span> | 0.08 ms | 0.03 ms / 0.04 ms | 0.46× | Faster |
| <span title="workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes">Linear chain · 8 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].allocationStat.retainedBytes">Linear chain · 8 · allocation stat · retained bytes</span> | 9.0 KiB | 4.2 KiB | 0.46× | Smaller |
| <span title="workloads[id=linear-chain;size=8].allocationStat.transientAllocations">Linear chain · 8 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].stat">Linear chain · 8</span> | 0.02 ms / 0.04 ms | 0.02 ms / 0.04 ms | 0.97× | Faster |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes">Lookup range edit · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes">Lookup range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations">Lookup range edit · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].stat">Lookup range edit · 100,000</span> | 1.88 ms / 2.72 ms | 1.73 ms / 1.79 ms | 0.92× (p95 0.66×) | Faster |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes">Percentile covariance · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes">Percentile covariance · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations">Percentile covariance · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].stat">Percentile covariance · 100,000</span> | 3.52 ms / 3.71 ms | 2.85 ms / 3.10 ms | 0.81× | Faster |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes">Removed sheet ref · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes">Removed sheet ref · 1,000 · allocation stat · retained bytes</span> | 230.7 KiB | 192.2 KiB | 0.83× | Smaller |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations">Removed sheet ref · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].stat">Removed sheet ref · 1,000</span> | 0.41 ms | 0.21 ms / 0.34 ms | 0.52× (p95 0.81×) | Faster |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 0 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes">Scalar edit affects 0 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations">Scalar edit affects 0 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].stat">Scalar edit affects 0 · 1,000</span> | 3 µs | 3 µs | 0.97× | Faster |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes">Scalar edit affects 100000 · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes">Scalar edit affects 100000 · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations">Scalar edit affects 100000 · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].stat">Scalar edit affects 100000 · 100,000</span> | 54.0 ms / 54.4 ms | 21.7 ms / 22.1 ms | 0.40× | Faster |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 1000 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes">Scalar edit affects 1000 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations">Scalar edit affects 1000 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].stat">Scalar edit affects 1000 · 1,000</span> | 0.30 ms / 0.31 ms | 0.17 ms / 0.19 ms | 0.55× (p95 0.60×) | Faster |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes">Scalar edit affects 1 · 1 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes">Scalar edit affects 1 · 1 · allocation stat · retained bytes</span> | 7.2 KiB | 2.4 KiB | 0.33× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations">Scalar edit affects 1 · 1 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].stat">Scalar edit affects 1 · 1</span> | 4 µs / 7 µs | 3 µs / 0.01 ms | 0.87× (p95 1.53×) | Faster |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes">Shared range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes">Shared range edit · 1,000 · allocation stat · retained bytes</span> | 518.1 KiB | 491.4 KiB | 0.95× | Smaller |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations">Shared range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].stat">Shared range edit · 1,000</span> | 0.53 ms / 0.55 ms | 0.28 ms / 0.31 ms | 0.53× | Faster |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes">Spill filter resize · 100,000 · allocation stat · peak transient bytes</span> | 4.6 MiB | 4.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes">Spill filter resize · 100,000 · allocation stat · retained bytes</span> | 6.4 MiB | 5.6 MiB | 0.88× | Smaller |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations">Spill filter resize · 100,000 · allocation stat · transient allocations</span> | 3 | 3 | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].stat">Spill filter resize · 100,000</span> | 22.3 ms / 22.6 ms | 11.8 ms / 13.5 ms | 0.53× (p95 0.60×) | Faster |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes">Spill sequence admission · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes">Spill sequence admission · 100,000 · allocation stat · retained bytes</span> | 3.9 MiB | 3.1 MiB | 0.80× | Smaller |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations">Spill sequence admission · 100,000 · allocation stat · transient allocations</span> | 1 | 1 | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].stat">Spill sequence admission · 100,000</span> | 11.4 ms / 11.6 ms | 4.38 ms / 5.27 ms | 0.38× (p95 0.45×) | Faster |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes">Sum multi range · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes">Sum multi range · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations">Sum multi range · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].stat">Sum multi range · 100,000</span> | 4.03 ms / 4.74 ms | 3.79 ms / 3.93 ms | 0.94× (p95 0.83×) | Faster |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes">Sumifs 3 criteria · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes">Sumifs 3 criteria · 100,000 · allocation stat · retained bytes</span> | 6.2 MiB | 6.2 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations">Sumifs 3 criteria · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].stat">Sumifs 3 criteria · 100,000</span> | 7.11 ms / 7.48 ms | 5.79 ms / 5.93 ms | 0.81× | Faster |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct matrix edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes">Sumproduct matrix edit · 100,000 · allocation stat · retained bytes</span> | 2.6 MiB | 2.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations">Sumproduct matrix edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].stat">Sumproduct matrix edit · 100,000</span> | 1.76 ms / 1.81 ms | 1.54 ms / 1.59 ms | 0.88× | Faster |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct vector edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes">Sumproduct vector edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations">Sumproduct vector edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].stat">Sumproduct vector edit · 100,000</span> | 1.85 ms / 1.94 ms | 1.57 ms / 2.10 ms | 0.85× (p95 1.08×) | Faster |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes">Text lookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations">Text lookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].stat">Text lookup many edit · 1,000</span> | 1.97 ms / 2.09 ms | 1.62 ms / 1.68 ms | 0.82× | Faster |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Text lookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Text lookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].stat">Text lookup many sorted edit · 1,000</span> | 3.17 ms / 3.25 ms | 3.16 ms / 3.41 ms | 1.00× (p95 1.05×) | Faster |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes">Text lookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations">Text lookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].stat">Text lookup many sorted · 1,000</span> | 3.68 ms / 4.25 ms | 3.37 ms / 3.43 ms | 0.91× (p95 0.81×) | Faster |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes">Text lookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes">Text lookup many · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations">Text lookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].stat">Text lookup many · 1,000</span> | 2.09 ms / 2.36 ms | 2.23 ms / 2.77 ms | 1.07× (p95 1.18×) | Within budget |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes">Topology remove add · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes">Topology remove add · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations">Topology remove add · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].stat">Topology remove add · 10,000</span> | 8.26 ms / 8.30 ms | 5.42 ms / 5.91 ms | 0.66× (p95 0.71×) | Faster |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes">Unicode text date edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes">Unicode text date edit · 1,000 · allocation stat · retained bytes</span> | 1.2 MiB | 1.1 MiB | 0.98× | Smaller |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations">Unicode text date edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].stat">Unicode text date edit · 1,000</span> | 1.02 ms / 1.12 ms | 0.78 ms / 0.87 ms | 0.76× | Faster |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes">Vlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations">Vlookup many edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].stat">Vlookup many edit · 1,000</span> | 1.12 ms / 1.15 ms | 0.86 ms / 0.87 ms | 0.77× | Faster |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Vlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Vlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].stat">Vlookup many sorted edit · 1,000</span> | 1.50 ms / 1.52 ms | 1.23 ms / 1.27 ms | 0.82× | Faster |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes">Vlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations">Vlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].stat">Vlookup many sorted · 1,000</span> | 1.63 ms / 1.74 ms | 1.31 ms / 1.32 ms | 0.81× | Faster |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes">Vlookup many · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes">Vlookup many · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations">Vlookup many · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].stat">Vlookup many · 1,000</span> | 1.27 ms / 1.40 ms | 0.96 ms / 1.06 ms | 0.75× | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes">Wide fan out edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes">Wide fan out edit · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations">Wide fan out edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].stat">Wide fan out edit · 100,000</span> | 53.8 ms / 55.1 ms | 22.0 ms / 22.8 ms | 0.41× | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes">Wide fan out edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes">Wide fan out edit · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations">Wide fan out edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].stat">Wide fan out edit · 1,000</span> | 0.31 ms / 0.36 ms | 0.14 ms / 0.16 ms | 0.46× | Faster |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes">Xlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations">Xlookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].stat">Xlookup many edit · 1,000</span> | 1.08 ms / 1.11 ms | 0.83 ms / 0.86 ms | 0.77× | Faster |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Xlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Xlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].stat">Xlookup many sorted edit · 1,000</span> | 1.48 ms / 1.52 ms | 1.19 ms / 1.79 ms | 0.80× (p95 1.17×) | Faster |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes">Xlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations">Xlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].stat">Xlookup many sorted · 1,000</span> | 1.64 ms / 1.79 ms | 1.32 ms / 1.35 ms | 0.81× | Faster |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes">Xlookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes">Xlookup many · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations">Xlookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].stat">Xlookup many · 1,000</span> | 1.25 ms / 1.38 ms | 0.94 ms | 0.75× (p95 0.68×) | Faster |

</details>

<details class="bench-all"><summary>Formula default · 212 measurements · 1 flagged</summary>

Artifact <code>bench/results/formula-default-results.json</code>. Baseline: 0.5.4 engine (WASM) under 0.6 core and harness, <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes">Countif 100k · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.retainedBytes">Countif 100k · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.transientAllocations">Countif 100k · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].stat">Countif 100k · 100,000</span> | 0.94 ms / 0.96 ms | 0.89 ms / 0.91 ms | 0.95× | Faster |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria multi range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes">Criteria multi range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations">Criteria multi range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].stat">Criteria multi range edit · 100,000</span> | 5.50 ms / 7.79 ms | 5.16 ms / 5.45 ms | 0.94× (p95 0.70×) | Faster |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes">Criteria range edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations">Criteria range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].stat">Criteria range edit · 100,000</span> | 1.62 ms / 1.66 ms | 1.59 ms / 1.68 ms | 0.98× | Faster |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes">Cross sheet range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes">Cross sheet range edit · 1,000 · allocation stat · retained bytes</span> | 624.9 KiB | 602.2 KiB | 0.96× | Smaller |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations">Cross sheet range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].stat">Cross sheet range edit · 1,000</span> | 0.53 ms / 0.83 ms | 0.28 ms / 0.29 ms | 0.53× (p95 0.35×) | Faster |
| <span title="workloads[id=cycles;size=1000].allocationStat.peakTransientBytes">Cycles · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].allocationStat.retainedBytes">Cycles · 1,000 · allocation stat · retained bytes</span> | 727.5 KiB | 682.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=cycles;size=1000].allocationStat.transientAllocations">Cycles · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].stat">Cycles · 1,000</span> | 1.40 ms / 1.48 ms | 0.48 ms / 0.54 ms | 0.34× | Faster |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes">Diamond edit · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.retainedBytes">Diamond edit · 32 · allocation stat · retained bytes</span> | 42.1 KiB | 36.4 KiB | 0.87× | Smaller |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.transientAllocations">Diamond edit · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].stat">Diamond edit · 32</span> | 0.09 ms / 0.10 ms | 0.04 ms / 0.05 ms | 0.49× | Faster |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes">Distinct range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes">Distinct range edit · 1,000 · allocation stat · retained bytes</span> | 844.8 KiB | 817.6 KiB | 0.97× | Smaller |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations">Distinct range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].stat">Distinct range edit · 1,000</span> | 0.01 ms / 0.02 ms | 0.01 ms / 0.02 ms | 1.05× (p95 1.16×) | Within budget |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes">Error propagation · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.retainedBytes">Error propagation · 1,000 · allocation stat · retained bytes</span> | 307.4 KiB | 276.6 KiB | 0.90× | Smaller |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.transientAllocations">Error propagation · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].stat">Error propagation · 1,000</span> | 0.73 ms / 0.75 ms | 0.25 ms / 0.26 ms | 0.35× | Faster |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes">Formula constant edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes">Formula constant edit · 100,000 · allocation stat · retained bytes</span> | 55.0 MiB | 53.3 MiB | 0.97× | Smaller |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations">Formula constant edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].stat">Formula constant edit · 100,000</span> | 0.03 ms / 0.04 ms | 0.03 ms / 0.04 ms | 1.04× (p95 0.86×) | Within budget |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes">Incremental dependency closure edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes">Incremental dependency closure edit · 100,000 · allocation stat · retained bytes</span> | 72.0 MiB | 68.7 MiB | 0.95× | Smaller |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations">Incremental dependency closure edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].stat">Incremental dependency closure edit · 100,000</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.93× | Faster |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes">Independent first recompute · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes">Independent first recompute · 100,000 · allocation stat · retained bytes</span> | 36.6 MiB | 35.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations">Independent first recompute · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].stat">Independent first recompute · 100,000</span> | 80.3 ms / 86.3 ms | 40.1 ms / 42.5 ms | 0.50× | Faster |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes">Independent first recompute · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes">Independent first recompute · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations">Independent first recompute · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].stat">Independent first recompute · 10,000</span> | 4.78 ms / 4.90 ms | 2.75 ms / 2.84 ms | 0.58× | Faster |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes">Independent first recompute · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes">Independent first recompute · 1,000 · allocation stat · retained bytes</span> | 461.7 KiB | 434.9 KiB | 0.94× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations">Independent first recompute · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].stat">Independent first recompute · 1,000</span> | 0.72 ms / 1.06 ms | 0.44 ms / 0.54 ms | 0.61× (p95 0.51×) | Faster |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes">Independent parse load · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes">Independent parse load · 100,000 · allocation stat · retained bytes</span> | 28.5 MiB | 27.7 MiB | 0.97× | Smaller |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations">Independent parse load · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].stat">Independent parse load · 100,000</span> | 54.0 ms / 54.5 ms | 59.7 ms / 59.9 ms | 1.10× | Within budget |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes">Independent parse load · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes">Independent parse load · 10,000 · allocation stat · retained bytes</span> | 3.1 MiB | 3.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations">Independent parse load · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].stat">Independent parse load · 10,000</span> | 7.21 ms / 7.60 ms | 6.33 ms / 6.63 ms | 0.88× | Faster |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes">Independent parse load · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes">Independent parse load · 1,000 · allocation stat · retained bytes</span> | 359.0 KiB | 344.3 KiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations">Independent parse load · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].stat">Independent parse load · 1,000</span> | 0.86 ms / 0.94 ms | 1.14 ms / 1.57 ms | 1.33× (p95 1.66×) | Within budget |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes">Iterative finance · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes">Iterative finance · 1,000 · allocation stat · retained bytes</span> | 878.6 KiB | 851.8 KiB | 0.97× | Smaller |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations">Iterative finance · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].stat">Iterative finance · 1,000</span> | 3.13 ms / 3.15 ms | 2.85 ms / 2.88 ms | 0.91× | Faster |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes">Let repeat · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.retainedBytes">Let repeat · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.transientAllocations">Let repeat · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].stat">Let repeat · 100,000</span> | 1.65 ms / 1.70 ms | 1.71 ms / 1.77 ms | 1.03× | Within budget |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes">Let reuse edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes">Let reuse edit · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations">Let reuse edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].stat">Let reuse edit · 100,000</span> | 0.58 ms / 0.64 ms | 0.51 ms | 0.88× (p95 0.80×) | Faster |
| <span title="workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes">Linear chain · 16 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].allocationStat.retainedBytes">Linear chain · 16 · allocation stat · retained bytes</span> | 13.4 KiB | 8.4 KiB | 0.63× | Smaller |
| <span title="workloads[id=linear-chain;size=16].allocationStat.transientAllocations">Linear chain · 16 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].stat">Linear chain · 16</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.70× | Faster |
| <span title="workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes">Linear chain · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].allocationStat.retainedBytes">Linear chain · 32 · allocation stat · retained bytes</span> | 20.5 KiB | 15.3 KiB | 0.75× | Smaller |
| <span title="workloads[id=linear-chain;size=32].allocationStat.transientAllocations">Linear chain · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].stat">Linear chain · 32</span> | 0.04 ms / 0.05 ms | 0.03 ms | 0.71× | Faster |
| <span title="workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes">Linear chain · 64 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].allocationStat.retainedBytes">Linear chain · 64 · allocation stat · retained bytes</span> | 34.7 KiB | 29.1 KiB | 0.84× | Smaller |
| <span title="workloads[id=linear-chain;size=64].allocationStat.transientAllocations">Linear chain · 64 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].stat">Linear chain · 64</span> | 0.07 ms / 0.08 ms | 0.04 ms | 0.55× | Faster |
| <span title="workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes">Linear chain · 8 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].allocationStat.retainedBytes">Linear chain · 8 · allocation stat · retained bytes</span> | 9.0 KiB | 4.2 KiB | 0.46× | Smaller |
| <span title="workloads[id=linear-chain;size=8].allocationStat.transientAllocations">Linear chain · 8 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].stat">Linear chain · 8</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.04 ms | 1.45× (p95 1.10×) | Within budget |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes">Lookup range edit · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes">Lookup range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations">Lookup range edit · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].stat">Lookup range edit · 100,000</span> | 1.73 ms / 1.79 ms | 1.71 ms / 1.77 ms | 0.99× | Faster |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes">Percentile covariance · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes">Percentile covariance · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations">Percentile covariance · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].stat">Percentile covariance · 100,000</span> | 3.15 ms / 3.18 ms | 2.83 ms / 2.86 ms | 0.90× | Faster |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes">Removed sheet ref · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes">Removed sheet ref · 1,000 · allocation stat · retained bytes</span> | 230.7 KiB | 192.2 KiB | 0.83× | Smaller |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations">Removed sheet ref · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].stat">Removed sheet ref · 1,000</span> | 0.42 ms | 0.20 ms / 0.21 ms | 0.48× | Faster |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 0 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes">Scalar edit affects 0 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations">Scalar edit affects 0 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].stat">Scalar edit affects 0 · 1,000</span> | 3 µs / 4 µs | 3 µs | 0.88× (p95 0.80×) | Faster |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes">Scalar edit affects 100000 · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes">Scalar edit affects 100000 · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations">Scalar edit affects 100000 · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].stat">Scalar edit affects 100000 · 100,000</span> | 57.5 ms / 58.6 ms | 20.7 ms / 21.6 ms | 0.36× | Faster |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 1000 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes">Scalar edit affects 1000 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations">Scalar edit affects 1000 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].stat">Scalar edit affects 1000 · 1,000</span> | 0.31 ms / 0.33 ms | 0.14 ms / 0.29 ms | 0.45× (p95 0.89×) | Faster |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes">Scalar edit affects 1 · 1 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes">Scalar edit affects 1 · 1 · allocation stat · retained bytes</span> | 7.2 KiB | 2.4 KiB | 0.33× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations">Scalar edit affects 1 · 1 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].stat">Scalar edit affects 1 · 1</span> | 3 µs / 7 µs | 4 µs | 1.14× (p95 0.58×) | Within budget |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes">Shared range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes">Shared range edit · 1,000 · allocation stat · retained bytes</span> | 518.1 KiB | 491.4 KiB | 0.95× | Smaller |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations">Shared range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].stat">Shared range edit · 1,000</span> | 0.63 ms / 0.91 ms | 0.25 ms / 0.30 ms | 0.40× (p95 0.33×) | Faster |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes">Spill filter resize · 100,000 · allocation stat · peak transient bytes</span> | 4.6 MiB | 4.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes">Spill filter resize · 100,000 · allocation stat · retained bytes</span> | 6.4 MiB | 5.6 MiB | 0.88× | Smaller |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations">Spill filter resize · 100,000 · allocation stat · transient allocations</span> | 3 | 3 | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].stat">Spill filter resize · 100,000</span> | 22.3 ms / 22.8 ms | 10.6 ms / 11.4 ms | 0.48× | Faster |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes">Spill sequence admission · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes">Spill sequence admission · 100,000 · allocation stat · retained bytes</span> | 3.9 MiB | 3.1 MiB | 0.80× | Smaller |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations">Spill sequence admission · 100,000 · allocation stat · transient allocations</span> | 1 | 1 | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].stat">Spill sequence admission · 100,000</span> | 11.0 ms / 11.3 ms | 4.36 ms / 4.44 ms | 0.39× | Faster |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes">Sum multi range · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes">Sum multi range · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations">Sum multi range · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].stat">Sum multi range · 100,000</span> | 3.90 ms / 4.19 ms | 4.36 ms / 4.39 ms | 1.12× (p95 1.05×) | Within budget |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes">Sumifs 3 criteria · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes">Sumifs 3 criteria · 100,000 · allocation stat · retained bytes</span> | 6.2 MiB | 6.2 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations">Sumifs 3 criteria · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].stat">Sumifs 3 criteria · 100,000</span> | 6.14 ms / 6.20 ms | 5.61 ms / 5.83 ms | 0.91× | Faster |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct matrix edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes">Sumproduct matrix edit · 100,000 · allocation stat · retained bytes</span> | 2.6 MiB | 2.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations">Sumproduct matrix edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].stat">Sumproduct matrix edit · 100,000</span> | 1.72 ms / 3.01 ms | 1.83 ms / 1.86 ms | 1.06× (p95 0.62×) | Within budget |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct vector edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes">Sumproduct vector edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations">Sumproduct vector edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].stat">Sumproduct vector edit · 100,000</span> | 1.82 ms / 2.94 ms | 1.88 ms / 1.90 ms | 1.03× (p95 0.65×) | Within budget |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes">Text lookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations">Text lookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].stat">Text lookup many edit · 1,000</span> | 1.93 ms / 2.01 ms | 1.94 ms / 1.96 ms | 1.01× | Within budget |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Text lookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Text lookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].stat">Text lookup many sorted edit · 1,000</span> | 3.26 ms / 3.31 ms | 3.39 ms / 3.43 ms | 1.04× | Within budget |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes">Text lookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations">Text lookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].stat">Text lookup many sorted · 1,000</span> | 3.20 ms / 3.29 ms | 4.02 ms / 4.45 ms | 1.26× (p95 1.35×) | **Flagged** |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes">Text lookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes">Text lookup many · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations">Text lookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].stat">Text lookup many · 1,000</span> | 2.11 ms / 2.14 ms | 2.58 ms / 2.65 ms | 1.22× | Within budget |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes">Topology remove add · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes">Topology remove add · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations">Topology remove add · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].stat">Topology remove add · 10,000</span> | 8.12 ms / 8.30 ms | 6.02 ms / 6.15 ms | 0.74× | Faster |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes">Unicode text date edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes">Unicode text date edit · 1,000 · allocation stat · retained bytes</span> | 1.2 MiB | 1.1 MiB | 0.98× | Smaller |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations">Unicode text date edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].stat">Unicode text date edit · 1,000</span> | 1.01 ms / 1.09 ms | 0.80 ms / 0.86 ms | 0.79× | Faster |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes">Vlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations">Vlookup many edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].stat">Vlookup many edit · 1,000</span> | 1.14 ms / 1.16 ms | 0.82 ms / 0.83 ms | 0.72× | Faster |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Vlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Vlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].stat">Vlookup many sorted edit · 1,000</span> | 1.52 ms / 1.54 ms | 1.25 ms / 1.29 ms | 0.82× | Faster |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes">Vlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations">Vlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].stat">Vlookup many sorted · 1,000</span> | 1.65 ms / 1.67 ms | 1.31 ms / 2.02 ms | 0.79× (p95 1.21×) | Faster |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes">Vlookup many · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes">Vlookup many · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations">Vlookup many · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].stat">Vlookup many · 1,000</span> | 1.30 ms / 1.38 ms | 0.92 ms / 1.05 ms | 0.71× (p95 0.76×) | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes">Wide fan out edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes">Wide fan out edit · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations">Wide fan out edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].stat">Wide fan out edit · 100,000</span> | 52.2 ms / 55.3 ms | 21.9 ms / 22.4 ms | 0.42× | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes">Wide fan out edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes">Wide fan out edit · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations">Wide fan out edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].stat">Wide fan out edit · 1,000</span> | 0.31 ms / 0.35 ms | 0.15 ms / 0.16 ms | 0.49× | Faster |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes">Xlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations">Xlookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].stat">Xlookup many edit · 1,000</span> | 1.11 ms / 1.14 ms | 0.83 ms / 0.85 ms | 0.74× | Faster |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Xlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Xlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].stat">Xlookup many sorted edit · 1,000</span> | 1.55 ms / 1.68 ms | 1.25 ms / 1.32 ms | 0.81× | Faster |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes">Xlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations">Xlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].stat">Xlookup many sorted · 1,000</span> | 1.66 ms / 1.87 ms | 1.35 ms / 1.46 ms | 0.81× | Faster |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes">Xlookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes">Xlookup many · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations">Xlookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].stat">Xlookup many · 1,000</span> | 1.28 ms / 1.29 ms | 0.90 ms / 0.91 ms | 0.70× | Faster |

</details>

<details class="bench-all"><summary>Formula full · 212 measurements · 2 flagged</summary>

Artifact <code>bench/results/formula-full-results.json</code>. Baseline: 0.5.4 engine (WASM) under 0.6 core and harness, <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:25 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes">Countif 100k · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.retainedBytes">Countif 100k · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].allocationStat.transientAllocations">Countif 100k · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=countif-100k;size=100000].stat">Countif 100k · 100,000</span> | 1.09 ms / 1.13 ms | 0.91 ms / 0.97 ms | 0.84× | Faster |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria multi range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes">Criteria multi range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations">Criteria multi range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-multi-range-edit;size=100000].stat">Criteria multi range edit · 100,000</span> | 5.45 ms / 5.54 ms | 4.84 ms / 4.97 ms | 0.89× | Faster |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes">Criteria range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes">Criteria range edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations">Criteria range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=criteria-range-edit;size=100000].stat">Criteria range edit · 100,000</span> | 1.62 ms / 1.64 ms | 1.56 ms / 1.60 ms | 0.97× | Faster |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes">Cross sheet range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes">Cross sheet range edit · 1,000 · allocation stat · retained bytes</span> | 624.9 KiB | 602.2 KiB | 0.96× | Smaller |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations">Cross sheet range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cross-sheet-range-edit;size=1000].stat">Cross sheet range edit · 1,000</span> | 0.51 ms / 0.52 ms | 0.26 ms / 0.31 ms | 0.51× (p95 0.59×) | Faster |
| <span title="workloads[id=cycles;size=1000].allocationStat.peakTransientBytes">Cycles · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].allocationStat.retainedBytes">Cycles · 1,000 · allocation stat · retained bytes</span> | 727.5 KiB | 682.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=cycles;size=1000].allocationStat.transientAllocations">Cycles · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=cycles;size=1000].stat">Cycles · 1,000</span> | 1.36 ms / 1.43 ms | 0.46 ms / 0.47 ms | 0.34× | Faster |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes">Diamond edit · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.retainedBytes">Diamond edit · 32 · allocation stat · retained bytes</span> | 42.1 KiB | 36.4 KiB | 0.87× | Smaller |
| <span title="workloads[id=diamond-edit;size=32].allocationStat.transientAllocations">Diamond edit · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=diamond-edit;size=32].stat">Diamond edit · 32</span> | 0.10 ms / 0.11 ms | 0.04 ms / 0.06 ms | 0.44× (p95 0.60×) | Faster |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes">Distinct range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes">Distinct range edit · 1,000 · allocation stat · retained bytes</span> | 844.8 KiB | 817.6 KiB | 0.97× | Smaller |
| <span title="workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations">Distinct range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=distinct-range-edit;size=1000].stat">Distinct range edit · 1,000</span> | 0.01 ms / 0.02 ms | 0.02 ms / 0.03 ms | 1.58× (p95 1.29×) | Within budget |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes">Error propagation · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.retainedBytes">Error propagation · 1,000 · allocation stat · retained bytes</span> | 307.4 KiB | 276.6 KiB | 0.90× | Smaller |
| <span title="workloads[id=error-propagation;size=1000].allocationStat.transientAllocations">Error propagation · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=error-propagation;size=1000].stat">Error propagation · 1,000</span> | 0.74 ms / 0.91 ms | 0.25 ms | 0.33× (p95 0.28×) | Faster |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes">Formula constant edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes">Formula constant edit · 100,000 · allocation stat · retained bytes</span> | 55.0 MiB | 53.3 MiB | 0.97× | Smaller |
| <span title="workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations">Formula constant edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=formula-constant-edit;size=100000].stat">Formula constant edit · 100,000</span> | 0.03 ms / 0.04 ms | 0.03 ms / 0.04 ms | 0.96× | Faster |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes">Incremental dependency closure edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes">Incremental dependency closure edit · 100,000 · allocation stat · retained bytes</span> | 72.0 MiB | 68.7 MiB | 0.95× | Smaller |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations">Incremental dependency closure edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=incremental-dependency-closure-edit;size=100000].stat">Incremental dependency closure edit · 100,000</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.03 ms | 0.93× | Faster |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes">Independent first recompute · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes">Independent first recompute · 100,000 · allocation stat · retained bytes</span> | 36.6 MiB | 35.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations">Independent first recompute · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=100000].stat">Independent first recompute · 100,000</span> | 80.1 ms / 86.7 ms | 39.0 ms / 40.5 ms | 0.49× | Faster |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes">Independent first recompute · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes">Independent first recompute · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations">Independent first recompute · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=10000].stat">Independent first recompute · 10,000</span> | 4.94 ms / 5.39 ms | 2.29 ms / 2.33 ms | 0.46× | Faster |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes">Independent first recompute · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes">Independent first recompute · 1,000 · allocation stat · retained bytes</span> | 461.7 KiB | 434.9 KiB | 0.94× | Smaller |
| <span title="workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations">Independent first recompute · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-first-recompute;size=1000].stat">Independent first recompute · 1,000</span> | 0.63 ms / 0.93 ms | 0.44 ms / 0.47 ms | 0.69× (p95 0.50×) | Faster |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes">Independent parse load · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes">Independent parse load · 100,000 · allocation stat · retained bytes</span> | 28.5 MiB | 27.7 MiB | 0.97× | Smaller |
| <span title="workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations">Independent parse load · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=100000].stat">Independent parse load · 100,000</span> | 53.6 ms / 54.6 ms | 53.5 ms / 53.9 ms | 1.00× | Faster |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes">Independent parse load · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes">Independent parse load · 10,000 · allocation stat · retained bytes</span> | 3.1 MiB | 3.0 MiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations">Independent parse load · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=10000].stat">Independent parse load · 10,000</span> | 5.98 ms / 6.75 ms | 5.80 ms / 7.12 ms | 0.97× (p95 1.05×) | Faster |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes">Independent parse load · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes">Independent parse load · 1,000 · allocation stat · retained bytes</span> | 359.0 KiB | 344.3 KiB | 0.96× | Smaller |
| <span title="workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations">Independent parse load · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=independent-parse-load;size=1000].stat">Independent parse load · 1,000</span> | 0.83 ms / 0.96 ms | 1.21 ms / 1.57 ms | 1.46× (p95 1.64×) | **Flagged** |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes">Iterative finance · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes">Iterative finance · 1,000 · allocation stat · retained bytes</span> | 878.6 KiB | 851.8 KiB | 0.97× | Smaller |
| <span title="workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations">Iterative finance · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=iterative-finance;size=1000].stat">Iterative finance · 1,000</span> | 3.60 ms / 5.36 ms | 3.02 ms / 3.38 ms | 0.84× (p95 0.63×) | Faster |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes">Let repeat · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.retainedBytes">Let repeat · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].allocationStat.transientAllocations">Let repeat · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=let-repeat;size=100000].stat">Let repeat · 100,000</span> | 1.88 ms / 1.99 ms | 1.80 ms / 2.10 ms | 0.96× (p95 1.05×) | Faster |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes">Let reuse edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes">Let reuse edit · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations">Let reuse edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=let-reuse-edit;size=100000].stat">Let reuse edit · 100,000</span> | 0.55 ms / 0.59 ms | 0.51 ms / 0.58 ms | 0.92× (p95 0.99×) | Faster |
| <span title="workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes">Linear chain · 16 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].allocationStat.retainedBytes">Linear chain · 16 · allocation stat · retained bytes</span> | 13.4 KiB | 8.4 KiB | 0.63× | Smaller |
| <span title="workloads[id=linear-chain;size=16].allocationStat.transientAllocations">Linear chain · 16 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=16].stat">Linear chain · 16</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.69× (p95 0.75×) | Faster |
| <span title="workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes">Linear chain · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].allocationStat.retainedBytes">Linear chain · 32 · allocation stat · retained bytes</span> | 20.5 KiB | 15.3 KiB | 0.75× | Smaller |
| <span title="workloads[id=linear-chain;size=32].allocationStat.transientAllocations">Linear chain · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=32].stat">Linear chain · 32</span> | 0.06 ms / 0.07 ms | 0.03 ms | 0.49× | Faster |
| <span title="workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes">Linear chain · 64 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].allocationStat.retainedBytes">Linear chain · 64 · allocation stat · retained bytes</span> | 34.7 KiB | 29.1 KiB | 0.84× | Smaller |
| <span title="workloads[id=linear-chain;size=64].allocationStat.transientAllocations">Linear chain · 64 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=64].stat">Linear chain · 64</span> | 0.11 ms / 0.12 ms | 0.04 ms | 0.32× | Faster |
| <span title="workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes">Linear chain · 8 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].allocationStat.retainedBytes">Linear chain · 8 · allocation stat · retained bytes</span> | 9.0 KiB | 4.2 KiB | 0.46× | Smaller |
| <span title="workloads[id=linear-chain;size=8].allocationStat.transientAllocations">Linear chain · 8 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=linear-chain;size=8].stat">Linear chain · 8</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.03 ms | 1.06× (p95 0.95×) | Within budget |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes">Lookup range edit · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes">Lookup range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations">Lookup range edit · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=lookup-range-edit;size=100000].stat">Lookup range edit · 100,000</span> | 1.76 ms / 1.87 ms | 1.67 ms / 1.72 ms | 0.95× | Faster |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes">Percentile covariance · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes">Percentile covariance · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations">Percentile covariance · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=percentile-covariance;size=100000].stat">Percentile covariance · 100,000</span> | 3.64 ms / 3.74 ms | 2.93 ms / 3.06 ms | 0.81× | Faster |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes">Removed sheet ref · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes">Removed sheet ref · 1,000 · allocation stat · retained bytes</span> | 230.7 KiB | 192.2 KiB | 0.83× | Smaller |
| <span title="workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations">Removed sheet ref · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=removed-sheet-ref;size=1000].stat">Removed sheet ref · 1,000</span> | 0.41 ms / 0.42 ms | 0.20 ms / 0.21 ms | 0.50× | Faster |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 0 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes">Scalar edit affects 0 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations">Scalar edit affects 0 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-0;size=1000].stat">Scalar edit affects 0 · 1,000</span> | 3 µs | 3 µs / 4 µs | 1.01× (p95 1.18×) | Within budget |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes">Scalar edit affects 100000 · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes">Scalar edit affects 100000 · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations">Scalar edit affects 100000 · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-100000;size=100000].stat">Scalar edit affects 100000 · 100,000</span> | 52.5 ms / 53.4 ms | 20.7 ms / 21.0 ms | 0.39× | Faster |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes">Scalar edit affects 1000 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes">Scalar edit affects 1000 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations">Scalar edit affects 1000 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1000;size=1000].stat">Scalar edit affects 1000 · 1,000</span> | 0.31 ms / 0.33 ms | 0.19 ms / 0.26 ms | 0.60× (p95 0.80×) | Faster |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes">Scalar edit affects 1 · 1 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes">Scalar edit affects 1 · 1 · allocation stat · retained bytes</span> | 7.2 KiB | 2.4 KiB | 0.33× | Smaller |
| <span title="workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations">Scalar edit affects 1 · 1 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=scalar-edit-affects-1;size=1].stat">Scalar edit affects 1 · 1</span> | 4 µs / 7 µs | 4 µs / 6 µs | 1.07× (p95 0.83×) | Within budget |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes">Shared range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes">Shared range edit · 1,000 · allocation stat · retained bytes</span> | 518.1 KiB | 491.4 KiB | 0.95× | Smaller |
| <span title="workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations">Shared range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=shared-range-edit;size=1000].stat">Shared range edit · 1,000</span> | 0.50 ms / 0.52 ms | 0.25 ms / 0.28 ms | 0.50× | Faster |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes">Spill filter resize · 100,000 · allocation stat · peak transient bytes</span> | 4.6 MiB | 4.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes">Spill filter resize · 100,000 · allocation stat · retained bytes</span> | 6.4 MiB | 5.6 MiB | 0.88× | Smaller |
| <span title="workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations">Spill filter resize · 100,000 · allocation stat · transient allocations</span> | 3 | 3 | 1.00× | Unchanged |
| <span title="workloads[id=spill-filter-resize;size=100000].stat">Spill filter resize · 100,000</span> | 21.8 ms / 21.9 ms | 10.5 ms / 10.6 ms | 0.48× | Faster |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes">Spill sequence admission · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes">Spill sequence admission · 100,000 · allocation stat · retained bytes</span> | 3.9 MiB | 3.1 MiB | 0.80× | Smaller |
| <span title="workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations">Spill sequence admission · 100,000 · allocation stat · transient allocations</span> | 1 | 1 | 1.00× | Unchanged |
| <span title="workloads[id=spill-sequence-admission;size=100000].stat">Spill sequence admission · 100,000</span> | 11.3 ms / 11.5 ms | 5.34 ms / 5.43 ms | 0.47× | Faster |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes">Sum multi range · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes">Sum multi range · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations">Sum multi range · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sum-multi-range;size=100000].stat">Sum multi range · 100,000</span> | 3.94 ms / 4.18 ms | 3.79 ms / 3.93 ms | 0.96× | Faster |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes">Sumifs 3 criteria · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes">Sumifs 3 criteria · 100,000 · allocation stat · retained bytes</span> | 6.2 MiB | 6.2 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations">Sumifs 3 criteria · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumifs-3-criteria;size=100000].stat">Sumifs 3 criteria · 100,000</span> | 6.46 ms / 6.80 ms | 5.99 ms / 6.04 ms | 0.93× | Faster |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct matrix edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes">Sumproduct matrix edit · 100,000 · allocation stat · retained bytes</span> | 2.6 MiB | 2.6 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations">Sumproduct matrix edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-matrix-edit;size=100000].stat">Sumproduct matrix edit · 100,000</span> | 1.70 ms / 1.76 ms | 1.58 ms / 1.63 ms | 0.93× | Faster |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes">Sumproduct vector edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes">Sumproduct vector edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations">Sumproduct vector edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=sumproduct-vector-edit;size=100000].stat">Sumproduct vector edit · 100,000</span> | 2.20 ms / 2.34 ms | 2.00 ms / 2.08 ms | 0.91× | Faster |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes">Text lookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations">Text lookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-edit;size=1000].stat">Text lookup many edit · 1,000</span> | 2.19 ms / 2.96 ms | 1.67 ms / 1.68 ms | 0.76× (p95 0.57×) | Faster |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Text lookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Text lookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted-edit;size=1000].stat">Text lookup many sorted edit · 1,000</span> | 3.14 ms / 3.27 ms | 2.79 ms / 2.89 ms | 0.89× | Faster |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Text lookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes">Text lookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations">Text lookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many-sorted;size=1000].stat">Text lookup many sorted · 1,000</span> | 3.18 ms / 3.83 ms | 3.31 ms / 3.37 ms | 1.04× (p95 0.88×) | Within budget |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes">Text lookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes">Text lookup many · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations">Text lookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=text-lookup-many;size=1000].stat">Text lookup many · 1,000</span> | 2.12 ms / 2.17 ms | 2.45 ms / 3.22 ms | 1.16× (p95 1.48×) | **Flagged** |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes">Topology remove add · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes">Topology remove add · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations">Topology remove add · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=topology-remove-add;size=10000].stat">Topology remove add · 10,000</span> | 8.29 ms / 8.90 ms | 5.35 ms / 5.40 ms | 0.65× | Faster |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes">Unicode text date edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes">Unicode text date edit · 1,000 · allocation stat · retained bytes</span> | 1.2 MiB | 1.1 MiB | 0.98× | Smaller |
| <span title="workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations">Unicode text date edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=unicode-text-date-edit;size=1000].stat">Unicode text date edit · 1,000</span> | 1.09 ms / 1.27 ms | 0.95 ms / 0.98 ms | 0.88× (p95 0.77×) | Faster |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes">Vlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations">Vlookup many edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-edit;size=1000].stat">Vlookup many edit · 1,000</span> | 1.13 ms / 1.15 ms | 0.81 ms / 0.82 ms | 0.72× | Faster |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Vlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Vlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted-edit;size=1000].stat">Vlookup many sorted edit · 1,000</span> | 1.50 ms / 1.55 ms | 1.21 ms / 1.22 ms | 0.81× | Faster |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Vlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes">Vlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations">Vlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many-sorted;size=1000].stat">Vlookup many sorted · 1,000</span> | 1.62 ms | 1.29 ms / 1.30 ms | 0.80× | Faster |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes">Vlookup many · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes">Vlookup many · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations">Vlookup many · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="workloads[id=vlookup-many;size=1000].stat">Vlookup many · 1,000</span> | 1.29 ms / 1.37 ms | 0.90 ms / 0.99 ms | 0.70× | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes">Wide fan out edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes">Wide fan out edit · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations">Wide fan out edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=100000].stat">Wide fan out edit · 100,000</span> | 53.5 ms / 56.8 ms | 21.3 ms / 21.4 ms | 0.40× | Faster |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes">Wide fan out edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes">Wide fan out edit · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations">Wide fan out edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="workloads[id=wide-fan-out-edit;size=1000].stat">Wide fan out edit · 1,000</span> | 0.53 ms / 0.54 ms | 0.13 ms / 0.15 ms | 0.25× | Faster |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes">Xlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations">Xlookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-edit;size=1000].stat">Xlookup many edit · 1,000</span> | 1.12 ms / 1.14 ms | 0.83 ms | 0.74× | Faster |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Xlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Xlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted-edit;size=1000].stat">Xlookup many sorted edit · 1,000</span> | 1.56 ms / 1.57 ms | 1.30 ms / 1.31 ms | 0.83× | Faster |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Xlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes">Xlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations">Xlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many-sorted;size=1000].stat">Xlookup many sorted · 1,000</span> | 1.70 ms / 1.71 ms | 1.35 ms / 1.36 ms | 0.79× | Faster |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes">Xlookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes">Xlookup many · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations">Xlookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="workloads[id=xlookup-many;size=1000].stat">Xlookup many · 1,000</span> | 1.25 ms / 1.28 ms | 0.91 ms / 0.94 ms | 0.73× | Faster |

</details>

<details class="bench-all"><summary>Full engine · 458 measurements</summary>

Artifact <code>bench/results/full-engine-results.json</code>. Baseline: 0.5.4 engine (WASM) under 0.6 core and harness, <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:24 UTC.

Threshold: **formula-release-limit**. Release limits: max(baseline × 1.25, baseline + 0.1 ms) for median and p95; baseline medians below 1 ms gate median only with a 0.3 ms floor. Attributed allocation summaries may not grow. Independent release comparison, not a paired gate verdict. Source: <code>bench/src/formula-bench.ts; bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="analysis[id=dsum;size=1000].allocationStat.peakTransientBytes">Dsum · 1,000 · allocation stat · peak transient bytes</span> | 3.2 KiB | 3.2 KiB | 1.00× | Unchanged |
| <span title="analysis[id=dsum;size=1000].allocationStat.retainedBytes">Dsum · 1,000 · allocation stat · retained bytes</span> | 599.7 KiB | 572.8 KiB | 0.96× | Smaller |
| <span title="analysis[id=dsum;size=1000].allocationStat.transientAllocations">Dsum · 1,000 · allocation stat · transient allocations</span> | 2,000 | 2,000 | 1.00× | Unchanged |
| <span title="analysis[id=dsum;size=1000].stat">Dsum · 1,000</span> | 3.00 ms / 4.96 ms | 2.96 ms / 3.18 ms | 0.99× (p95 0.64×) | Faster |
| <span title="analysis[id=linest;size=1000].allocationStat.peakTransientBytes">Linest · 1,000 · allocation stat · peak transient bytes</span> | 3.2 KiB | 3.2 KiB | 1.00× | Unchanged |
| <span title="analysis[id=linest;size=1000].allocationStat.retainedBytes">Linest · 1,000 · allocation stat · retained bytes</span> | 780.2 KiB | 753.4 KiB | 0.97× | Smaller |
| <span title="analysis[id=linest;size=1000].allocationStat.transientAllocations">Linest · 1,000 · allocation stat · transient allocations</span> | 3,000 | 3,000 | 1.00× | Unchanged |
| <span title="analysis[id=linest;size=1000].stat">Linest · 1,000</span> | 4.43 ms / 6.30 ms | 3.80 ms / 6.00 ms | 0.86× (p95 0.95×) | Faster |
| <span title="analysis[id=map-reduce;size=1000].allocationStat.peakTransientBytes">Map reduce · 1,000 · allocation stat · peak transient bytes</span> | 3.1 KiB | 3.1 KiB | 1.00× | Unchanged |
| <span title="analysis[id=map-reduce;size=1000].allocationStat.retainedBytes">Map reduce · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="analysis[id=map-reduce;size=1000].allocationStat.transientAllocations">Map reduce · 1,000 · allocation stat · transient allocations</span> | 3,000 | 3,000 | 1.00× | Unchanged |
| <span title="analysis[id=map-reduce;size=1000].stat">Map reduce · 1,000</span> | 22.6 ms / 22.8 ms | 22.6 ms / 23.1 ms | 1.00× | Faster |
| <span title="analysis[id=mmult;size=1000].allocationStat.peakTransientBytes">Mmult · 1,000 · allocation stat · peak transient bytes</span> | 64 B | 64 B | 1.00× | Unchanged |
| <span title="analysis[id=mmult;size=1000].allocationStat.retainedBytes">Mmult · 1,000 · allocation stat · retained bytes</span> | 775.3 KiB | 748.5 KiB | 0.97× | Smaller |
| <span title="analysis[id=mmult;size=1000].allocationStat.transientAllocations">Mmult · 1,000 · allocation stat · transient allocations</span> | 3,000 | 3,000 | 1.00× | Unchanged |
| <span title="analysis[id=mmult;size=1000].stat">Mmult · 1,000</span> | 1.14 ms / 1.18 ms | 0.82 ms / 0.92 ms | 0.72× (p95 0.78×) | Faster |
| <span title="analysis[id=mode-mult;size=1000].allocationStat.peakTransientBytes">Mode mult · 1,000 · allocation stat · peak transient bytes</span> | 64 B | 64 B | 1.00× | Unchanged |
| <span title="analysis[id=mode-mult;size=1000].allocationStat.retainedBytes">Mode mult · 1,000 · allocation stat · retained bytes</span> | 862.5 KiB | 835.6 KiB | 0.97× | Smaller |
| <span title="analysis[id=mode-mult;size=1000].allocationStat.transientAllocations">Mode mult · 1,000 · allocation stat · transient allocations</span> | 6,000 | 6,000 | 1.00× | Unchanged |
| <span title="analysis[id=mode-mult;size=1000].stat">Mode mult · 1,000</span> | 1.04 ms / 1.05 ms | 0.81 ms / 0.84 ms | 0.78× | Faster |
| <span title="analysis[id=sortby;size=1000].allocationStat.peakTransientBytes">Sortby · 1,000 · allocation stat · peak transient bytes</span> | 4.7 KiB | 4.7 KiB | 1.00× | Unchanged |
| <span title="analysis[id=sortby;size=1000].allocationStat.retainedBytes">Sortby · 1,000 · allocation stat · retained bytes</span> | 835.9 KiB | 809.0 KiB | 0.97× | Smaller |
| <span title="analysis[id=sortby;size=1000].allocationStat.transientAllocations">Sortby · 1,000 · allocation stat · transient allocations</span> | 3,000 | 3,000 | 1.00× | Unchanged |
| <span title="analysis[id=sortby;size=1000].stat">Sortby · 1,000</span> | 3.39 ms / 3.80 ms | 3.46 ms / 4.40 ms | 1.02× (p95 1.16×) | Within budget |
| <span title="analysis[id=textsplit-regexreplace;size=1000].allocationStat.peakTransientBytes">Textsplit regexreplace · 1,000 · allocation stat · peak transient bytes</span> | 48 B | 48 B | 1.00× | Unchanged |
| <span title="analysis[id=textsplit-regexreplace;size=1000].allocationStat.retainedBytes">Textsplit regexreplace · 1,000 · allocation stat · retained bytes</span> | 918.1 KiB | 891.2 KiB | 0.97× | Smaller |
| <span title="analysis[id=textsplit-regexreplace;size=1000].allocationStat.transientAllocations">Textsplit regexreplace · 1,000 · allocation stat · transient allocations</span> | 2,000 | 2,000 | 1.00× | Unchanged |
| <span title="analysis[id=textsplit-regexreplace;size=1000].stat">Textsplit regexreplace · 1,000</span> | 2.47 ms / 2.51 ms | 2.77 ms / 2.84 ms | 1.12× | Within budget |
| <span title="analysis[id=xirr;size=1000].allocationStat.peakTransientBytes">Xirr · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="analysis[id=xirr;size=1000].allocationStat.retainedBytes">Xirr · 1,000 · allocation stat · retained bytes</span> | 582.0 KiB | 555.1 KiB | 0.95× | Smaller |
| <span title="analysis[id=xirr;size=1000].allocationStat.transientAllocations">Xirr · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="analysis[id=xirr;size=1000].stat">Xirr · 1,000</span> | 1.36 ms / 2.05 ms | 0.92 ms / 1.33 ms | 0.67× | Faster |
| <span title="engines[engine=default].initialization.stat">Default · initialization</span> | — | 4.28 ms / 4.73 ms | — | New in 0.6 · 0.6-only: timed current-core path; no version ratio |
| <span title="engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes">Default · countif 100k · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.retainedBytes">Default · countif 100k · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=countif-100k;size=100000].allocationStat.transientAllocations">Default · countif 100k · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=countif-100k;size=100000].stat">Default · countif 100k · 100,000</span> | 0.94 ms / 0.96 ms | 0.89 ms / 0.91 ms | 0.95× | Faster |
| <span title="engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes">Default · criteria multi range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes">Default · criteria multi range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations">Default · criteria multi range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-multi-range-edit;size=100000].stat">Default · criteria multi range edit · 100,000</span> | 5.50 ms / 7.79 ms | 5.16 ms / 5.45 ms | 0.94× (p95 0.70×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes">Default · criteria range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes">Default · criteria range edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations">Default · criteria range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=criteria-range-edit;size=100000].stat">Default · criteria range edit · 100,000</span> | 1.62 ms / 1.66 ms | 1.59 ms / 1.68 ms | 0.98× | Faster |
| <span title="engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes">Default · cross sheet range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes">Default · cross sheet range edit · 1,000 · allocation stat · retained bytes</span> | 624.9 KiB | 602.2 KiB | 0.96× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations">Default · cross sheet range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=cross-sheet-range-edit;size=1000].stat">Default · cross sheet range edit · 1,000</span> | 0.53 ms / 0.83 ms | 0.28 ms / 0.29 ms | 0.53× (p95 0.35×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.peakTransientBytes">Default · cycles · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.retainedBytes">Default · cycles · 1,000 · allocation stat · retained bytes</span> | 727.5 KiB | 682.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=cycles;size=1000].allocationStat.transientAllocations">Default · cycles · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=cycles;size=1000].stat">Default · cycles · 1,000</span> | 1.40 ms / 1.48 ms | 0.48 ms / 0.54 ms | 0.34× | Faster |
| <span title="engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes">Default · diamond edit · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.retainedBytes">Default · diamond edit · 32 · allocation stat · retained bytes</span> | 42.1 KiB | 36.4 KiB | 0.87× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=diamond-edit;size=32].allocationStat.transientAllocations">Default · diamond edit · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=diamond-edit;size=32].stat">Default · diamond edit · 32</span> | 0.09 ms / 0.10 ms | 0.04 ms / 0.05 ms | 0.49× | Faster |
| <span title="engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes">Default · distinct range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes">Default · distinct range edit · 1,000 · allocation stat · retained bytes</span> | 844.8 KiB | 817.6 KiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations">Default · distinct range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=distinct-range-edit;size=1000].stat">Default · distinct range edit · 1,000</span> | 0.01 ms / 0.02 ms | 0.01 ms / 0.02 ms | 1.05× (p95 1.16×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes">Default · error propagation · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.retainedBytes">Default · error propagation · 1,000 · allocation stat · retained bytes</span> | 307.4 KiB | 276.6 KiB | 0.90× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=error-propagation;size=1000].allocationStat.transientAllocations">Default · error propagation · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=error-propagation;size=1000].stat">Default · error propagation · 1,000</span> | 0.73 ms / 0.75 ms | 0.25 ms / 0.26 ms | 0.35× | Faster |
| <span title="engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes">Default · formula constant edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes">Default · formula constant edit · 100,000 · allocation stat · retained bytes</span> | 55.0 MiB | 53.3 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations">Default · formula constant edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=formula-constant-edit;size=100000].stat">Default · formula constant edit · 100,000</span> | 0.03 ms / 0.04 ms | 0.03 ms / 0.04 ms | 1.04× (p95 0.86×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes">Default · incremental dependency closure edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes">Default · incremental dependency closure edit · 100,000 · allocation stat · retained bytes</span> | 72.0 MiB | 68.7 MiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations">Default · incremental dependency closure edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=incremental-dependency-closure-edit;size=100000].stat">Default · incremental dependency closure edit · 100,000</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.93× | Faster |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes">Default · independent first recompute · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes">Default · independent first recompute · 100,000 · allocation stat · retained bytes</span> | 36.6 MiB | 35.0 MiB | 0.96× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations">Default · independent first recompute · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=100000].stat">Default · independent first recompute · 100,000</span> | 80.3 ms / 86.3 ms | 40.1 ms / 42.5 ms | 0.50× | Faster |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes">Default · independent first recompute · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes">Default · independent first recompute · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations">Default · independent first recompute · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=10000].stat">Default · independent first recompute · 10,000</span> | 4.78 ms / 4.90 ms | 2.75 ms / 2.84 ms | 0.58× | Faster |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes">Default · independent first recompute · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes">Default · independent first recompute · 1,000 · allocation stat · retained bytes</span> | 461.7 KiB | 434.9 KiB | 0.94× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations">Default · independent first recompute · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-first-recompute;size=1000].stat">Default · independent first recompute · 1,000</span> | 0.72 ms / 1.06 ms | 0.44 ms / 0.54 ms | 0.61× (p95 0.51×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes">Default · independent parse load · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes">Default · independent parse load · 100,000 · allocation stat · retained bytes</span> | 28.5 MiB | 27.7 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations">Default · independent parse load · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=100000].stat">Default · independent parse load · 100,000</span> | 54.0 ms / 54.5 ms | 59.7 ms / 59.9 ms | 1.10× | Within budget |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes">Default · independent parse load · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes">Default · independent parse load · 10,000 · allocation stat · retained bytes</span> | 3.1 MiB | 3.0 MiB | 0.96× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations">Default · independent parse load · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=10000].stat">Default · independent parse load · 10,000</span> | 7.21 ms / 7.60 ms | 6.33 ms / 6.63 ms | 0.88× | Faster |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes">Default · independent parse load · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes">Default · independent parse load · 1,000 · allocation stat · retained bytes</span> | 359.0 KiB | 344.3 KiB | 0.96× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations">Default · independent parse load · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=independent-parse-load;size=1000].stat">Default · independent parse load · 1,000</span> | 0.86 ms / 0.94 ms | 1.14 ms / 1.57 ms | 1.33× (p95 1.66×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes">Default · iterative finance · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes">Default · iterative finance · 1,000 · allocation stat · retained bytes</span> | 878.6 KiB | 851.8 KiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations">Default · iterative finance · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=iterative-finance;size=1000].stat">Default · iterative finance · 1,000</span> | 3.13 ms / 3.15 ms | 2.85 ms / 2.88 ms | 0.91× | Faster |
| <span title="engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes">Default · let repeat · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.retainedBytes">Default · let repeat · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-repeat;size=100000].allocationStat.transientAllocations">Default · let repeat · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-repeat;size=100000].stat">Default · let repeat · 100,000</span> | 1.65 ms / 1.70 ms | 1.71 ms / 1.77 ms | 1.03× | Within budget |
| <span title="engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes">Default · let reuse edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes">Default · let reuse edit · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations">Default · let reuse edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=let-reuse-edit;size=100000].stat">Default · let reuse edit · 100,000</span> | 0.58 ms / 0.64 ms | 0.51 ms | 0.88× (p95 0.80×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes">Default · linear chain · 16 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.retainedBytes">Default · linear chain · 16 · allocation stat · retained bytes</span> | 13.4 KiB | 8.4 KiB | 0.63× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=16].allocationStat.transientAllocations">Default · linear chain · 16 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=16].stat">Default · linear chain · 16</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.70× | Faster |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes">Default · linear chain · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.retainedBytes">Default · linear chain · 32 · allocation stat · retained bytes</span> | 20.5 KiB | 15.3 KiB | 0.75× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=32].allocationStat.transientAllocations">Default · linear chain · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=32].stat">Default · linear chain · 32</span> | 0.04 ms / 0.05 ms | 0.03 ms | 0.71× | Faster |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes">Default · linear chain · 64 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.retainedBytes">Default · linear chain · 64 · allocation stat · retained bytes</span> | 34.7 KiB | 29.1 KiB | 0.84× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=64].allocationStat.transientAllocations">Default · linear chain · 64 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=64].stat">Default · linear chain · 64</span> | 0.07 ms / 0.08 ms | 0.04 ms | 0.55× | Faster |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes">Default · linear chain · 8 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.retainedBytes">Default · linear chain · 8 · allocation stat · retained bytes</span> | 9.0 KiB | 4.2 KiB | 0.46× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=8].allocationStat.transientAllocations">Default · linear chain · 8 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=linear-chain;size=8].stat">Default · linear chain · 8</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.04 ms | 1.45× (p95 1.10×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes">Default · lookup range edit · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes">Default · lookup range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations">Default · lookup range edit · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=lookup-range-edit;size=100000].stat">Default · lookup range edit · 100,000</span> | 1.73 ms / 1.79 ms | 1.71 ms / 1.77 ms | 0.99× | Faster |
| <span title="engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes">Default · percentile covariance · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes">Default · percentile covariance · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations">Default · percentile covariance · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=percentile-covariance;size=100000].stat">Default · percentile covariance · 100,000</span> | 3.15 ms / 3.18 ms | 2.83 ms / 2.86 ms | 0.90× | Faster |
| <span title="engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes">Default · removed sheet ref · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes">Default · removed sheet ref · 1,000 · allocation stat · retained bytes</span> | 230.7 KiB | 192.2 KiB | 0.83× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations">Default · removed sheet ref · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=removed-sheet-ref;size=1000].stat">Default · removed sheet ref · 1,000</span> | 0.42 ms | 0.20 ms / 0.21 ms | 0.48× | Faster |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes">Default · scalar edit affects 0 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes">Default · scalar edit affects 0 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations">Default · scalar edit affects 0 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-0;size=1000].stat">Default · scalar edit affects 0 · 1,000</span> | 3 µs / 4 µs | 3 µs | 0.88× (p95 0.80×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes">Default · scalar edit affects 100000 · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes">Default · scalar edit affects 100000 · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations">Default · scalar edit affects 100000 · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-100000;size=100000].stat">Default · scalar edit affects 100000 · 100,000</span> | 57.5 ms / 58.6 ms | 20.7 ms / 21.6 ms | 0.36× | Faster |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes">Default · scalar edit affects 1000 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes">Default · scalar edit affects 1000 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations">Default · scalar edit affects 1000 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1000;size=1000].stat">Default · scalar edit affects 1000 · 1,000</span> | 0.31 ms / 0.33 ms | 0.14 ms / 0.29 ms | 0.45× (p95 0.89×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes">Default · scalar edit affects 1 · 1 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes">Default · scalar edit affects 1 · 1 · allocation stat · retained bytes</span> | 7.2 KiB | 2.4 KiB | 0.33× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations">Default · scalar edit affects 1 · 1 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=scalar-edit-affects-1;size=1].stat">Default · scalar edit affects 1 · 1</span> | 3 µs / 7 µs | 4 µs | 1.14× (p95 0.58×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes">Default · shared range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes">Default · shared range edit · 1,000 · allocation stat · retained bytes</span> | 518.1 KiB | 491.4 KiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations">Default · shared range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=shared-range-edit;size=1000].stat">Default · shared range edit · 1,000</span> | 0.63 ms / 0.91 ms | 0.25 ms / 0.30 ms | 0.40× (p95 0.33×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes">Default · spill filter resize · 100,000 · allocation stat · peak transient bytes</span> | 4.6 MiB | 4.6 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes">Default · spill filter resize · 100,000 · allocation stat · retained bytes</span> | 6.4 MiB | 5.6 MiB | 0.88× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations">Default · spill filter resize · 100,000 · allocation stat · transient allocations</span> | 3 | 3 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=spill-filter-resize;size=100000].stat">Default · spill filter resize · 100,000</span> | 22.3 ms / 22.8 ms | 10.6 ms / 11.4 ms | 0.48× | Faster |
| <span title="engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes">Default · spill sequence admission · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes">Default · spill sequence admission · 100,000 · allocation stat · retained bytes</span> | 3.9 MiB | 3.1 MiB | 0.80× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations">Default · spill sequence admission · 100,000 · allocation stat · transient allocations</span> | 1 | 1 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=spill-sequence-admission;size=100000].stat">Default · spill sequence admission · 100,000</span> | 11.0 ms / 11.3 ms | 4.36 ms / 4.44 ms | 0.39× | Faster |
| <span title="engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes">Default · sum multi range · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes">Default · sum multi range · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations">Default · sum multi range · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sum-multi-range;size=100000].stat">Default · sum multi range · 100,000</span> | 3.90 ms / 4.19 ms | 4.36 ms / 4.39 ms | 1.12× (p95 1.05×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes">Default · sumifs 3 criteria · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes">Default · sumifs 3 criteria · 100,000 · allocation stat · retained bytes</span> | 6.2 MiB | 6.2 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations">Default · sumifs 3 criteria · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumifs-3-criteria;size=100000].stat">Default · sumifs 3 criteria · 100,000</span> | 6.14 ms / 6.20 ms | 5.61 ms / 5.83 ms | 0.91× | Faster |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes">Default · sumproduct matrix edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes">Default · sumproduct matrix edit · 100,000 · allocation stat · retained bytes</span> | 2.6 MiB | 2.6 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations">Default · sumproduct matrix edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-matrix-edit;size=100000].stat">Default · sumproduct matrix edit · 100,000</span> | 1.72 ms / 3.01 ms | 1.83 ms / 1.86 ms | 1.06× (p95 0.62×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes">Default · sumproduct vector edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes">Default · sumproduct vector edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations">Default · sumproduct vector edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=sumproduct-vector-edit;size=100000].stat">Default · sumproduct vector edit · 100,000</span> | 1.82 ms / 2.94 ms | 1.88 ms / 1.90 ms | 1.03× (p95 0.65×) | Within budget |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes">Default · text lookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes">Default · text lookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations">Default · text lookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-edit;size=1000].stat">Default · text lookup many edit · 1,000</span> | 1.93 ms / 2.01 ms | 1.94 ms / 1.96 ms | 1.01× | Within budget |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Default · text lookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Default · text lookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Default · text lookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].stat">Default · text lookup many sorted edit · 1,000</span> | 3.26 ms / 3.31 ms | 3.39 ms / 3.43 ms | 1.04× | Within budget |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Default · text lookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes">Default · text lookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations">Default · text lookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many-sorted;size=1000].stat">Default · text lookup many sorted · 1,000</span> | 3.20 ms / 3.29 ms | 4.02 ms / 4.45 ms | 1.26× (p95 1.35×) | **Flagged** |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes">Default · text lookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes">Default · text lookup many · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations">Default · text lookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=text-lookup-many;size=1000].stat">Default · text lookup many · 1,000</span> | 2.11 ms / 2.14 ms | 2.58 ms / 2.65 ms | 1.22× | Within budget |
| <span title="engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes">Default · topology remove add · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes">Default · topology remove add · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations">Default · topology remove add · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=topology-remove-add;size=10000].stat">Default · topology remove add · 10,000</span> | 8.12 ms / 8.30 ms | 6.02 ms / 6.15 ms | 0.74× | Faster |
| <span title="engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes">Default · unicode text date edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes">Default · unicode text date edit · 1,000 · allocation stat · retained bytes</span> | 1.2 MiB | 1.1 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations">Default · unicode text date edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=unicode-text-date-edit;size=1000].stat">Default · unicode text date edit · 1,000</span> | 1.01 ms / 1.09 ms | 0.80 ms / 0.86 ms | 0.79× | Faster |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Default · vlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes">Default · vlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations">Default · vlookup many edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-edit;size=1000].stat">Default · vlookup many edit · 1,000</span> | 1.14 ms / 1.16 ms | 0.82 ms / 0.83 ms | 0.72× | Faster |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Default · vlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Default · vlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Default · vlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted-edit;size=1000].stat">Default · vlookup many sorted edit · 1,000</span> | 1.52 ms / 1.54 ms | 1.25 ms / 1.29 ms | 0.82× | Faster |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Default · vlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes">Default · vlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations">Default · vlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many-sorted;size=1000].stat">Default · vlookup many sorted · 1,000</span> | 1.65 ms / 1.67 ms | 1.31 ms / 2.02 ms | 0.79× (p95 1.21×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes">Default · vlookup many · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes">Default · vlookup many · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations">Default · vlookup many · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=vlookup-many;size=1000].stat">Default · vlookup many · 1,000</span> | 1.30 ms / 1.38 ms | 0.92 ms / 1.05 ms | 0.71× (p95 0.76×) | Faster |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes">Default · wide fan out edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes">Default · wide fan out edit · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations">Default · wide fan out edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=100000].stat">Default · wide fan out edit · 100,000</span> | 52.2 ms / 55.3 ms | 21.9 ms / 22.4 ms | 0.42× | Faster |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes">Default · wide fan out edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes">Default · wide fan out edit · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations">Default · wide fan out edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=wide-fan-out-edit;size=1000].stat">Default · wide fan out edit · 1,000</span> | 0.31 ms / 0.35 ms | 0.15 ms / 0.16 ms | 0.49× | Faster |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Default · xlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes">Default · xlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations">Default · xlookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-edit;size=1000].stat">Default · xlookup many edit · 1,000</span> | 1.11 ms / 1.14 ms | 0.83 ms / 0.85 ms | 0.74× | Faster |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Default · xlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Default · xlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Default · xlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted-edit;size=1000].stat">Default · xlookup many sorted edit · 1,000</span> | 1.55 ms / 1.68 ms | 1.25 ms / 1.32 ms | 0.81× | Faster |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Default · xlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes">Default · xlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations">Default · xlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many-sorted;size=1000].stat">Default · xlookup many sorted · 1,000</span> | 1.66 ms / 1.87 ms | 1.35 ms / 1.46 ms | 0.81× | Faster |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes">Default · xlookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes">Default · xlookup many · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations">Default · xlookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=default].shared.workloads[id=xlookup-many;size=1000].stat">Default · xlookup many · 1,000</span> | 1.28 ms / 1.29 ms | 0.90 ms / 0.91 ms | 0.70× | Faster |
| <span title="engines[engine=full].initialization.stat">Full · initialization</span> | — | 5.77 ms / 6.26 ms | — | New in 0.6 · 0.6-only: timed current-core path; no version ratio |
| <span title="engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.peakTransientBytes">Full · countif 100k · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.retainedBytes">Full · countif 100k · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=countif-100k;size=100000].allocationStat.transientAllocations">Full · countif 100k · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=countif-100k;size=100000].stat">Full · countif 100k · 100,000</span> | 1.09 ms / 1.13 ms | 0.91 ms / 0.97 ms | 0.84× | Faster |
| <span title="engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.peakTransientBytes">Full · criteria multi range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.retainedBytes">Full · criteria multi range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].allocationStat.transientAllocations">Full · criteria multi range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-multi-range-edit;size=100000].stat">Full · criteria multi range edit · 100,000</span> | 5.45 ms / 5.54 ms | 4.84 ms / 4.97 ms | 0.89× | Faster |
| <span title="engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.peakTransientBytes">Full · criteria range edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.retainedBytes">Full · criteria range edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].allocationStat.transientAllocations">Full · criteria range edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=criteria-range-edit;size=100000].stat">Full · criteria range edit · 100,000</span> | 1.62 ms / 1.64 ms | 1.56 ms / 1.60 ms | 0.97× | Faster |
| <span title="engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.peakTransientBytes">Full · cross sheet range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.retainedBytes">Full · cross sheet range edit · 1,000 · allocation stat · retained bytes</span> | 624.9 KiB | 602.2 KiB | 0.96× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].allocationStat.transientAllocations">Full · cross sheet range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=cross-sheet-range-edit;size=1000].stat">Full · cross sheet range edit · 1,000</span> | 0.51 ms / 0.52 ms | 0.26 ms / 0.31 ms | 0.51× (p95 0.59×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.peakTransientBytes">Full · cycles · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.retainedBytes">Full · cycles · 1,000 · allocation stat · retained bytes</span> | 727.5 KiB | 682.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=cycles;size=1000].allocationStat.transientAllocations">Full · cycles · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=cycles;size=1000].stat">Full · cycles · 1,000</span> | 1.36 ms / 1.43 ms | 0.46 ms / 0.47 ms | 0.34× | Faster |
| <span title="engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.peakTransientBytes">Full · diamond edit · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.retainedBytes">Full · diamond edit · 32 · allocation stat · retained bytes</span> | 42.1 KiB | 36.4 KiB | 0.87× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=diamond-edit;size=32].allocationStat.transientAllocations">Full · diamond edit · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=diamond-edit;size=32].stat">Full · diamond edit · 32</span> | 0.10 ms / 0.11 ms | 0.04 ms / 0.06 ms | 0.44× (p95 0.60×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.peakTransientBytes">Full · distinct range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.retainedBytes">Full · distinct range edit · 1,000 · allocation stat · retained bytes</span> | 844.8 KiB | 817.6 KiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].allocationStat.transientAllocations">Full · distinct range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=distinct-range-edit;size=1000].stat">Full · distinct range edit · 1,000</span> | 0.01 ms / 0.02 ms | 0.02 ms / 0.03 ms | 1.58× (p95 1.29×) | Within budget |
| <span title="engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.peakTransientBytes">Full · error propagation · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.retainedBytes">Full · error propagation · 1,000 · allocation stat · retained bytes</span> | 307.4 KiB | 276.6 KiB | 0.90× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=error-propagation;size=1000].allocationStat.transientAllocations">Full · error propagation · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=error-propagation;size=1000].stat">Full · error propagation · 1,000</span> | 0.74 ms / 0.91 ms | 0.25 ms | 0.33× (p95 0.28×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.peakTransientBytes">Full · formula constant edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.retainedBytes">Full · formula constant edit · 100,000 · allocation stat · retained bytes</span> | 55.0 MiB | 53.3 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].allocationStat.transientAllocations">Full · formula constant edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=formula-constant-edit;size=100000].stat">Full · formula constant edit · 100,000</span> | 0.03 ms / 0.04 ms | 0.03 ms / 0.04 ms | 0.96× | Faster |
| <span title="engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.peakTransientBytes">Full · incremental dependency closure edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.retainedBytes">Full · incremental dependency closure edit · 100,000 · allocation stat · retained bytes</span> | 72.0 MiB | 68.7 MiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].allocationStat.transientAllocations">Full · incremental dependency closure edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=incremental-dependency-closure-edit;size=100000].stat">Full · incremental dependency closure edit · 100,000</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.03 ms | 0.93× | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.peakTransientBytes">Full · independent first recompute · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.retainedBytes">Full · independent first recompute · 100,000 · allocation stat · retained bytes</span> | 36.6 MiB | 35.0 MiB | 0.96× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].allocationStat.transientAllocations">Full · independent first recompute · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=100000].stat">Full · independent first recompute · 100,000</span> | 80.1 ms / 86.7 ms | 39.0 ms / 40.5 ms | 0.49× | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.peakTransientBytes">Full · independent first recompute · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.retainedBytes">Full · independent first recompute · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].allocationStat.transientAllocations">Full · independent first recompute · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=10000].stat">Full · independent first recompute · 10,000</span> | 4.94 ms / 5.39 ms | 2.29 ms / 2.33 ms | 0.46× | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.peakTransientBytes">Full · independent first recompute · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.retainedBytes">Full · independent first recompute · 1,000 · allocation stat · retained bytes</span> | 461.7 KiB | 434.9 KiB | 0.94× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].allocationStat.transientAllocations">Full · independent first recompute · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-first-recompute;size=1000].stat">Full · independent first recompute · 1,000</span> | 0.63 ms / 0.93 ms | 0.44 ms / 0.47 ms | 0.69× (p95 0.50×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.peakTransientBytes">Full · independent parse load · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.retainedBytes">Full · independent parse load · 100,000 · allocation stat · retained bytes</span> | 28.5 MiB | 27.7 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].allocationStat.transientAllocations">Full · independent parse load · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=100000].stat">Full · independent parse load · 100,000</span> | 53.6 ms / 54.6 ms | 53.5 ms / 53.9 ms | 1.00× | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.peakTransientBytes">Full · independent parse load · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.retainedBytes">Full · independent parse load · 10,000 · allocation stat · retained bytes</span> | 3.1 MiB | 3.0 MiB | 0.96× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].allocationStat.transientAllocations">Full · independent parse load · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=10000].stat">Full · independent parse load · 10,000</span> | 5.98 ms / 6.75 ms | 5.80 ms / 7.12 ms | 0.97× (p95 1.05×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.peakTransientBytes">Full · independent parse load · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.retainedBytes">Full · independent parse load · 1,000 · allocation stat · retained bytes</span> | 359.0 KiB | 344.3 KiB | 0.96× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].allocationStat.transientAllocations">Full · independent parse load · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=independent-parse-load;size=1000].stat">Full · independent parse load · 1,000</span> | 0.83 ms / 0.96 ms | 1.21 ms / 1.57 ms | 1.46× (p95 1.64×) | **Flagged** |
| <span title="engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.peakTransientBytes">Full · iterative finance · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.retainedBytes">Full · iterative finance · 1,000 · allocation stat · retained bytes</span> | 878.6 KiB | 851.8 KiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=iterative-finance;size=1000].allocationStat.transientAllocations">Full · iterative finance · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=iterative-finance;size=1000].stat">Full · iterative finance · 1,000</span> | 3.60 ms / 5.36 ms | 3.02 ms / 3.38 ms | 0.84× (p95 0.63×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.peakTransientBytes">Full · let repeat · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.retainedBytes">Full · let repeat · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-repeat;size=100000].allocationStat.transientAllocations">Full · let repeat · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-repeat;size=100000].stat">Full · let repeat · 100,000</span> | 1.88 ms / 1.99 ms | 1.80 ms / 2.10 ms | 0.96× (p95 1.05×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.peakTransientBytes">Full · let reuse edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.retainedBytes">Full · let reuse edit · 100,000 · allocation stat · retained bytes</span> | 2.5 MiB | 2.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].allocationStat.transientAllocations">Full · let reuse edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=let-reuse-edit;size=100000].stat">Full · let reuse edit · 100,000</span> | 0.55 ms / 0.59 ms | 0.51 ms / 0.58 ms | 0.92× (p95 0.99×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.peakTransientBytes">Full · linear chain · 16 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.retainedBytes">Full · linear chain · 16 · allocation stat · retained bytes</span> | 13.4 KiB | 8.4 KiB | 0.63× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=16].allocationStat.transientAllocations">Full · linear chain · 16 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=16].stat">Full · linear chain · 16</span> | 0.02 ms / 0.03 ms | 0.02 ms | 0.69× (p95 0.75×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.peakTransientBytes">Full · linear chain · 32 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.retainedBytes">Full · linear chain · 32 · allocation stat · retained bytes</span> | 20.5 KiB | 15.3 KiB | 0.75× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=32].allocationStat.transientAllocations">Full · linear chain · 32 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=32].stat">Full · linear chain · 32</span> | 0.06 ms / 0.07 ms | 0.03 ms | 0.49× | Faster |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.peakTransientBytes">Full · linear chain · 64 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.retainedBytes">Full · linear chain · 64 · allocation stat · retained bytes</span> | 34.7 KiB | 29.1 KiB | 0.84× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=64].allocationStat.transientAllocations">Full · linear chain · 64 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=64].stat">Full · linear chain · 64</span> | 0.11 ms / 0.12 ms | 0.04 ms | 0.32× | Faster |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.peakTransientBytes">Full · linear chain · 8 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.retainedBytes">Full · linear chain · 8 · allocation stat · retained bytes</span> | 9.0 KiB | 4.2 KiB | 0.46× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=8].allocationStat.transientAllocations">Full · linear chain · 8 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=linear-chain;size=8].stat">Full · linear chain · 8</span> | 0.02 ms / 0.03 ms | 0.02 ms / 0.03 ms | 1.06× (p95 0.95×) | Within budget |
| <span title="engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.peakTransientBytes">Full · lookup range edit · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.retainedBytes">Full · lookup range edit · 100,000 · allocation stat · retained bytes</span> | 5.0 MiB | 5.0 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].allocationStat.transientAllocations">Full · lookup range edit · 100,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=lookup-range-edit;size=100000].stat">Full · lookup range edit · 100,000</span> | 1.76 ms / 1.87 ms | 1.67 ms / 1.72 ms | 0.95× | Faster |
| <span title="engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.peakTransientBytes">Full · percentile covariance · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.retainedBytes">Full · percentile covariance · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].allocationStat.transientAllocations">Full · percentile covariance · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=percentile-covariance;size=100000].stat">Full · percentile covariance · 100,000</span> | 3.64 ms / 3.74 ms | 2.93 ms / 3.06 ms | 0.81× | Faster |
| <span title="engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.peakTransientBytes">Full · removed sheet ref · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.retainedBytes">Full · removed sheet ref · 1,000 · allocation stat · retained bytes</span> | 230.7 KiB | 192.2 KiB | 0.83× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].allocationStat.transientAllocations">Full · removed sheet ref · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=removed-sheet-ref;size=1000].stat">Full · removed sheet ref · 1,000</span> | 0.41 ms / 0.42 ms | 0.20 ms / 0.21 ms | 0.50× | Faster |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.peakTransientBytes">Full · scalar edit affects 0 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.retainedBytes">Full · scalar edit affects 0 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].allocationStat.transientAllocations">Full · scalar edit affects 0 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-0;size=1000].stat">Full · scalar edit affects 0 · 1,000</span> | 3 µs | 3 µs / 4 µs | 1.01× (p95 1.18×) | Within budget |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.peakTransientBytes">Full · scalar edit affects 100000 · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.retainedBytes">Full · scalar edit affects 100000 · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].allocationStat.transientAllocations">Full · scalar edit affects 100000 · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-100000;size=100000].stat">Full · scalar edit affects 100000 · 100,000</span> | 52.5 ms / 53.4 ms | 20.7 ms / 21.0 ms | 0.39× | Faster |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.peakTransientBytes">Full · scalar edit affects 1000 · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.retainedBytes">Full · scalar edit affects 1000 · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].allocationStat.transientAllocations">Full · scalar edit affects 1000 · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1000;size=1000].stat">Full · scalar edit affects 1000 · 1,000</span> | 0.31 ms / 0.33 ms | 0.19 ms / 0.26 ms | 0.60× (p95 0.80×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.peakTransientBytes">Full · scalar edit affects 1 · 1 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.retainedBytes">Full · scalar edit affects 1 · 1 · allocation stat · retained bytes</span> | 7.2 KiB | 2.4 KiB | 0.33× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].allocationStat.transientAllocations">Full · scalar edit affects 1 · 1 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=scalar-edit-affects-1;size=1].stat">Full · scalar edit affects 1 · 1</span> | 4 µs / 7 µs | 4 µs / 6 µs | 1.07× (p95 0.83×) | Within budget |
| <span title="engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.peakTransientBytes">Full · shared range edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.retainedBytes">Full · shared range edit · 1,000 · allocation stat · retained bytes</span> | 518.1 KiB | 491.4 KiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].allocationStat.transientAllocations">Full · shared range edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=shared-range-edit;size=1000].stat">Full · shared range edit · 1,000</span> | 0.50 ms / 0.52 ms | 0.25 ms / 0.28 ms | 0.50× | Faster |
| <span title="engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.peakTransientBytes">Full · spill filter resize · 100,000 · allocation stat · peak transient bytes</span> | 4.6 MiB | 4.6 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.retainedBytes">Full · spill filter resize · 100,000 · allocation stat · retained bytes</span> | 6.4 MiB | 5.6 MiB | 0.88× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].allocationStat.transientAllocations">Full · spill filter resize · 100,000 · allocation stat · transient allocations</span> | 3 | 3 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=spill-filter-resize;size=100000].stat">Full · spill filter resize · 100,000</span> | 21.8 ms / 21.9 ms | 10.5 ms / 10.6 ms | 0.48× | Faster |
| <span title="engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.peakTransientBytes">Full · spill sequence admission · 100,000 · allocation stat · peak transient bytes</span> | 1.5 MiB | 1.5 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.retainedBytes">Full · spill sequence admission · 100,000 · allocation stat · retained bytes</span> | 3.9 MiB | 3.1 MiB | 0.80× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].allocationStat.transientAllocations">Full · spill sequence admission · 100,000 · allocation stat · transient allocations</span> | 1 | 1 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=spill-sequence-admission;size=100000].stat">Full · spill sequence admission · 100,000</span> | 11.3 ms / 11.5 ms | 5.34 ms / 5.43 ms | 0.47× | Faster |
| <span title="engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.peakTransientBytes">Full · sum multi range · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.retainedBytes">Full · sum multi range · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].allocationStat.transientAllocations">Full · sum multi range · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sum-multi-range;size=100000].stat">Full · sum multi range · 100,000</span> | 3.94 ms / 4.18 ms | 3.79 ms / 3.93 ms | 0.96× | Faster |
| <span title="engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.peakTransientBytes">Full · sumifs 3 criteria · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.retainedBytes">Full · sumifs 3 criteria · 100,000 · allocation stat · retained bytes</span> | 6.2 MiB | 6.2 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].allocationStat.transientAllocations">Full · sumifs 3 criteria · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumifs-3-criteria;size=100000].stat">Full · sumifs 3 criteria · 100,000</span> | 6.46 ms / 6.80 ms | 5.99 ms / 6.04 ms | 0.93× | Faster |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.peakTransientBytes">Full · sumproduct matrix edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.retainedBytes">Full · sumproduct matrix edit · 100,000 · allocation stat · retained bytes</span> | 2.6 MiB | 2.6 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].allocationStat.transientAllocations">Full · sumproduct matrix edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-matrix-edit;size=100000].stat">Full · sumproduct matrix edit · 100,000</span> | 1.70 ms / 1.76 ms | 1.58 ms / 1.63 ms | 0.93× | Faster |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.peakTransientBytes">Full · sumproduct vector edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.retainedBytes">Full · sumproduct vector edit · 100,000 · allocation stat · retained bytes</span> | 3.7 MiB | 3.7 MiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].allocationStat.transientAllocations">Full · sumproduct vector edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=sumproduct-vector-edit;size=100000].stat">Full · sumproduct vector edit · 100,000</span> | 2.20 ms / 2.34 ms | 2.00 ms / 2.08 ms | 0.91× | Faster |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.peakTransientBytes">Full · text lookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.retainedBytes">Full · text lookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].allocationStat.transientAllocations">Full · text lookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-edit;size=1000].stat">Full · text lookup many edit · 1,000</span> | 2.19 ms / 2.96 ms | 1.67 ms / 1.68 ms | 0.76× (p95 0.57×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Full · text lookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Full · text lookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Full · text lookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted-edit;size=1000].stat">Full · text lookup many sorted edit · 1,000</span> | 3.14 ms / 3.27 ms | 2.79 ms / 2.89 ms | 0.89× | Faster |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Full · text lookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.retainedBytes">Full · text lookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].allocationStat.transientAllocations">Full · text lookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many-sorted;size=1000].stat">Full · text lookup many sorted · 1,000</span> | 3.18 ms / 3.83 ms | 3.31 ms / 3.37 ms | 1.04× (p95 0.88×) | Within budget |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.peakTransientBytes">Full · text lookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.retainedBytes">Full · text lookup many · 1,000 · allocation stat · retained bytes</span> | 1.6 MiB | 1.6 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].allocationStat.transientAllocations">Full · text lookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=text-lookup-many;size=1000].stat">Full · text lookup many · 1,000</span> | 2.12 ms / 2.17 ms | 2.45 ms / 3.22 ms | 1.16× (p95 1.48×) | **Flagged** |
| <span title="engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.peakTransientBytes">Full · topology remove add · 10,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.retainedBytes">Full · topology remove add · 10,000 · allocation stat · retained bytes</span> | 4.0 MiB | 3.8 MiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].allocationStat.transientAllocations">Full · topology remove add · 10,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=topology-remove-add;size=10000].stat">Full · topology remove add · 10,000</span> | 8.29 ms / 8.90 ms | 5.35 ms / 5.40 ms | 0.65× | Faster |
| <span title="engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.peakTransientBytes">Full · unicode text date edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.retainedBytes">Full · unicode text date edit · 1,000 · allocation stat · retained bytes</span> | 1.2 MiB | 1.1 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].allocationStat.transientAllocations">Full · unicode text date edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=unicode-text-date-edit;size=1000].stat">Full · unicode text date edit · 1,000</span> | 1.09 ms / 1.27 ms | 0.95 ms / 0.98 ms | 0.88× (p95 0.77×) | Faster |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Full · vlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.retainedBytes">Full · vlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].allocationStat.transientAllocations">Full · vlookup many edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-edit;size=1000].stat">Full · vlookup many edit · 1,000</span> | 1.13 ms / 1.15 ms | 0.81 ms / 0.82 ms | 0.72× | Faster |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Full · vlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Full · vlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Full · vlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted-edit;size=1000].stat">Full · vlookup many sorted edit · 1,000</span> | 1.50 ms / 1.55 ms | 1.21 ms / 1.22 ms | 0.81× | Faster |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Full · vlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.retainedBytes">Full · vlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].allocationStat.transientAllocations">Full · vlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many-sorted;size=1000].stat">Full · vlookup many sorted · 1,000</span> | 1.62 ms | 1.29 ms / 1.30 ms | 0.80× | Faster |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.peakTransientBytes">Full · vlookup many · 1,000 · allocation stat · peak transient bytes</span> | 312.5 KiB | 312.5 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.retainedBytes">Full · vlookup many · 1,000 · allocation stat · retained bytes</span> | 1.0 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many;size=1000].allocationStat.transientAllocations">Full · vlookup many · 1,000 · allocation stat · transient allocations</span> | 2 | 2 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=vlookup-many;size=1000].stat">Full · vlookup many · 1,000</span> | 1.29 ms / 1.37 ms | 0.90 ms / 0.99 ms | 0.70× | Faster |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.peakTransientBytes">Full · wide fan out edit · 100,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.retainedBytes">Full · wide fan out edit · 100,000 · allocation stat · retained bytes</span> | 32.2 MiB | 30.6 MiB | 0.95× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].allocationStat.transientAllocations">Full · wide fan out edit · 100,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=100000].stat">Full · wide fan out edit · 100,000</span> | 53.5 ms / 56.8 ms | 21.3 ms / 21.4 ms | 0.40× | Faster |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.peakTransientBytes">Full · wide fan out edit · 1,000 · allocation stat · peak transient bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.retainedBytes">Full · wide fan out edit · 1,000 · allocation stat · retained bytes</span> | 413.6 KiB | 386.7 KiB | 0.94× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].allocationStat.transientAllocations">Full · wide fan out edit · 1,000 · allocation stat · transient allocations</span> | 0 | 0 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=wide-fan-out-edit;size=1000].stat">Full · wide fan out edit · 1,000</span> | 0.53 ms / 0.54 ms | 0.13 ms / 0.15 ms | 0.25× | Faster |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.peakTransientBytes">Full · xlookup many edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.retainedBytes">Full · xlookup many edit · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].allocationStat.transientAllocations">Full · xlookup many edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-edit;size=1000].stat">Full · xlookup many edit · 1,000</span> | 1.12 ms / 1.14 ms | 0.83 ms | 0.74× | Faster |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.peakTransientBytes">Full · xlookup many sorted edit · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.retainedBytes">Full · xlookup many sorted edit · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].allocationStat.transientAllocations">Full · xlookup many sorted edit · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted-edit;size=1000].stat">Full · xlookup many sorted edit · 1,000</span> | 1.56 ms / 1.57 ms | 1.30 ms / 1.31 ms | 0.83× | Faster |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.peakTransientBytes">Full · xlookup many sorted · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.retainedBytes">Full · xlookup many sorted · 1,000 · allocation stat · retained bytes</span> | 1.3 MiB | 1.3 MiB | 0.98× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].allocationStat.transientAllocations">Full · xlookup many sorted · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many-sorted;size=1000].stat">Full · xlookup many sorted · 1,000</span> | 1.70 ms / 1.71 ms | 1.35 ms / 1.36 ms | 0.79× | Faster |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.peakTransientBytes">Full · xlookup many · 1,000 · allocation stat · peak transient bytes</span> | 156.3 KiB | 156.3 KiB | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.retainedBytes">Full · xlookup many · 1,000 · allocation stat · retained bytes</span> | 1.1 MiB | 1.0 MiB | 0.97× | Smaller |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many;size=1000].allocationStat.transientAllocations">Full · xlookup many · 1,000 · allocation stat · transient allocations</span> | 4 | 4 | 1.00× | Unchanged |
| <span title="engines[engine=full].shared.workloads[id=xlookup-many;size=1000].stat">Full · xlookup many · 1,000</span> | 1.25 ms / 1.28 ms | 0.91 ms / 0.94 ms | 0.73× | Faster |

</details>

<details class="bench-all"><summary>Full engine matched · 24 measurements</summary>

Artifact <code>bench/results/full-engine-matched-results.json</code>. Baseline: 0.5.4 engine (WASM) under 0.6 core and harness, <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:25 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:26 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="rows[id=independent-first-recompute;size=10000].defaultStat">Independent first recompute · 10,000 · default stat</span> | 6.08 ms / 7.08 ms | 3.05 ms / 3.62 ms | 0.50× | Faster |
| <span title="rows[id=independent-first-recompute;size=10000].fullStat">Independent first recompute · 10,000 · full stat</span> | 5.27 ms / 6.66 ms | 2.78 ms / 3.05 ms | 0.53× (p95 0.46×) | Faster |
| <span title="rows[id=independent-first-recompute;size=10000].ratioStat">Independent first recompute · 10,000 · ratio stat</span> | 0.875 / 1.114 | 0.908 / 1.051 | 1.04× (p95 0.94×) | Slower |
| <span title="rows[id=independent-first-recompute;size=1000].defaultStat">Independent first recompute · 1,000 · default stat</span> | 0.61 ms / 0.67 ms | 0.25 ms / 0.30 ms | 0.42× | Faster |
| <span title="rows[id=independent-first-recompute;size=1000].fullStat">Independent first recompute · 1,000 · full stat</span> | 0.51 ms / 0.62 ms | 0.23 ms / 0.26 ms | 0.45× | Faster |
| <span title="rows[id=independent-first-recompute;size=1000].ratioStat">Independent first recompute · 1,000 · ratio stat</span> | 0.874 / 1.041 | 0.892 / 1.089 | 1.02× | Slower |
| <span title="rows[id=independent-parse-load;size=10000].defaultStat">Independent parse load · 10,000 · default stat</span> | 6.56 ms / 7.09 ms | 6.35 ms / 7.16 ms | 0.97× | Faster |
| <span title="rows[id=independent-parse-load;size=10000].fullStat">Independent parse load · 10,000 · full stat</span> | 6.28 ms / 7.02 ms | 6.42 ms / 6.82 ms | 1.02× (p95 0.97×) | Slower |
| <span title="rows[id=independent-parse-load;size=10000].ratioStat">Independent parse load · 10,000 · ratio stat</span> | 0.981 / 1.129 | 0.999 / 1.081 | 1.02× (p95 0.96×) | Slower |
| <span title="rows[id=independent-parse-load;size=1000].defaultStat">Independent parse load · 1,000 · default stat</span> | 0.66 ms / 0.73 ms | 0.61 ms / 0.73 ms | 0.92× (p95 1.00×) | Faster |
| <span title="rows[id=independent-parse-load;size=1000].fullStat">Independent parse load · 1,000 · full stat</span> | 0.64 ms / 0.73 ms | 0.64 ms / 0.73 ms | 0.99× | Faster |
| <span title="rows[id=independent-parse-load;size=1000].ratioStat">Independent parse load · 1,000 · ratio stat</span> | 0.972 / 1.134 | 1.019 / 1.178 | 1.05× | Slower |
| <span title="rows[id=linear-chain;size=8].defaultStat">Linear chain · 8 · default stat</span> | 0.01 ms | 5 µs | 0.48× | Faster |
| <span title="rows[id=linear-chain;size=8].fullStat">Linear chain · 8 · full stat</span> | 9 µs / 0.01 ms | 5 µs | 0.50× | Faster |
| <span title="rows[id=linear-chain;size=8].ratioStat">Linear chain · 8 · ratio stat</span> | 0.940 / 1.083 | 0.947 / 1.008 | 1.01× (p95 0.93×) | Slower |
| <span title="rows[id=scalar-edit-affects-0;size=1000].defaultStat">Scalar edit affects 0 · 1,000 · default stat</span> | 1 µs | 1 µs | 0.85× (p95 0.79×) | Faster |
| <span title="rows[id=scalar-edit-affects-0;size=1000].fullStat">Scalar edit affects 0 · 1,000 · full stat</span> | 1 µs | 1 µs | 0.93× (p95 0.87×) | Faster |
| <span title="rows[id=scalar-edit-affects-0;size=1000].ratioStat">Scalar edit affects 0 · 1,000 · ratio stat</span> | 0.965 / 1.195 | 1.059 / 1.181 | 1.10× (p95 0.99×) | Slower |
| <span title="rows[id=vlookup-many;size=1000].defaultStat">Vlookup many · 1,000 · default stat</span> | 1.64 ms / 1.77 ms | 1.18 ms / 1.33 ms | 0.72× | Faster |
| <span title="rows[id=vlookup-many;size=1000].fullStat">Vlookup many · 1,000 · full stat</span> | 1.42 ms / 1.59 ms | 1.03 ms / 1.11 ms | 0.72× | Faster |
| <span title="rows[id=vlookup-many;size=1000].ratioStat">Vlookup many · 1,000 · ratio stat</span> | 0.855 / 1.027 | 0.853 / 1.017 | 1.00× | Faster |
| <span title="rows[id=wide-fan-out-edit;size=1000].defaultStat">Wide fan out edit · 1,000 · default stat</span> | 0.40 ms / 0.44 ms | 0.17 ms / 0.19 ms | 0.43× | Faster |
| <span title="rows[id=wide-fan-out-edit;size=1000].fullStat">Wide fan out edit · 1,000 · full stat</span> | 0.37 ms / 0.42 ms | 0.14 ms / 0.16 ms | 0.38× | Faster |
| <span title="rows[id=wide-fan-out-edit;size=1000].ratioStat">Wide fan out edit · 1,000 · ratio stat</span> | 0.917 / 1.168 | 0.855 / 0.992 | 0.93× (p95 0.85×) | Faster |

</details>

<details class="bench-all"><summary>Xlsx · 48 measurements</summary>

Artifact <code>bench/results/xlsx-results.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:39 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 03:40 UTC.

Threshold: **none**. No documented historical-capture noise threshold. The XLSX 1.25 baseline ratio is an in-capture codec gate, not a historical/new comparison limit. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="summaries[engine=baseline;scenario=combined;operation=import].durationMs">Baseline · combined · import · duration ms</span> | 10.0 s / 10.6 s | 10.1 s / 10.8 s | 1.01× | Slower |
| <span title="summaries[engine=baseline;scenario=combined;operation=import].maxRssBytes">Baseline · combined · import · max rss bytes</span> | 3,395.0 MiB / 3,403.9 MiB | 3,402.0 MiB / 3,437.5 MiB | 1.00× | Larger |
| <span title="summaries[engine=baseline;scenario=combined;operation=import].processWallMs">Baseline · combined · import · process wall ms</span> | 10.3 s / 10.8 s | 10.3 s / 11.1 s | 1.01× | Slower |
| <span title="summaries[engine=baseline;scenario=combined;operation=import].retainedAllocationDeltaBytes">Baseline · combined · import · retained allocation delta bytes</span> | 1,552.0 MiB / 1,600.4 MiB | 1,474.2 MiB / 1,608.6 MiB | 0.95× (p95 1.01×) | Smaller |
| <span title="summaries[engine=baseline;scenario=rich;operation=export].durationMs">Baseline · rich · export · duration ms</span> | 723 ms / 728 ms | 697 ms / 711 ms | 0.97× | Faster |
| <span title="summaries[engine=baseline;scenario=rich;operation=export].maxRssBytes">Baseline · rich · export · max rss bytes</span> | 171.9 MiB / 173.1 MiB | 171.8 MiB / 173.9 MiB | 1.00× | Smaller |
| <span title="summaries[engine=baseline;scenario=rich;operation=export].processWallMs">Baseline · rich · export · process wall ms</span> | 879 ms / 888 ms | 855 ms / 871 ms | 0.97× | Faster |
| <span title="summaries[engine=baseline;scenario=rich;operation=export].retainedAllocationDeltaBytes">Baseline · rich · export · retained allocation delta bytes</span> | 24.6 MiB / 24.8 MiB | 14.5 MiB / 24.7 MiB | 0.59× (p95 1.00×) | Smaller |
| <span title="summaries[engine=baseline;scenario=scalar;operation=export].durationMs">Baseline · scalar · export · duration ms</span> | 596 ms / 600 ms | 601 ms / 605 ms | 1.01× | Slower |
| <span title="summaries[engine=baseline;scenario=scalar;operation=export].maxRssBytes">Baseline · scalar · export · max rss bytes</span> | 198.1 MiB / 201.0 MiB | 197.2 MiB / 198.7 MiB | 1.00× | Smaller |
| <span title="summaries[engine=baseline;scenario=scalar;operation=export].processWallMs">Baseline · scalar · export · process wall ms</span> | 754 ms / 758 ms | 760 ms / 767 ms | 1.01× | Slower |
| <span title="summaries[engine=baseline;scenario=scalar;operation=export].retainedAllocationDeltaBytes">Baseline · scalar · export · retained allocation delta bytes</span> | 54.0 MiB / 55.0 MiB | 54.2 MiB / 54.3 MiB | 1.00× | Larger |
| <span title="summaries[engine=baseline;scenario=shared-style;operation=export].durationMs">Baseline · shared style · export · duration ms</span> | 1.22 s / 1.25 s | 1.25 s / 1.31 s | 1.02× | Slower |
| <span title="summaries[engine=baseline;scenario=shared-style;operation=export].maxRssBytes">Baseline · shared style · export · max rss bytes</span> | 277.6 MiB / 280.9 MiB | 281.2 MiB / 283.1 MiB | 1.01× | Larger |
| <span title="summaries[engine=baseline;scenario=shared-style;operation=export].processWallMs">Baseline · shared style · export · process wall ms</span> | 1.39 s / 1.42 s | 1.42 s / 1.49 s | 1.02× | Slower |
| <span title="summaries[engine=baseline;scenario=shared-style;operation=export].retainedAllocationDeltaBytes">Baseline · shared style · export · retained allocation delta bytes</span> | 85.4 MiB / 91.5 MiB | 79.8 MiB / 86.8 MiB | 0.93× | Smaller |
| <span title="summaries[engine=baseline;scenario=sparse;operation=export].durationMs">Baseline · sparse · export · duration ms</span> | 181 ms / 182 ms | 185 ms / 188 ms | 1.02× | Slower |
| <span title="summaries[engine=baseline;scenario=sparse;operation=export].maxRssBytes">Baseline · sparse · export · max rss bytes</span> | 105.4 MiB / 106.1 MiB | 106.9 MiB / 107.6 MiB | 1.01× | Larger |
| <span title="summaries[engine=baseline;scenario=sparse;operation=export].processWallMs">Baseline · sparse · export · process wall ms</span> | 327 ms / 329 ms | 330 ms / 338 ms | 1.01× | Slower |
| <span title="summaries[engine=baseline;scenario=sparse;operation=export].retainedAllocationDeltaBytes">Baseline · sparse · export · retained allocation delta bytes</span> | 1.4 MiB | 1.4 MiB | 1.00× | Unchanged |
| <span title="summaries[engine=current;scenario=combined;operation=import].durationMs">Current · combined · import · duration ms</span> | 1.37 s / 1.38 s | 1.23 s / 1.25 s | 0.90× | Faster |
| <span title="summaries[engine=current;scenario=combined;operation=import].maxRssBytes">Current · combined · import · max rss bytes</span> | 310.4 MiB / 313.3 MiB | 206.7 MiB / 207.8 MiB | 0.67× | Smaller |
| <span title="summaries[engine=current;scenario=combined;operation=import].processWallMs">Current · combined · import · process wall ms</span> | 1.44 s / 1.47 s | 1.31 s / 1.33 s | 0.91× | Faster |
| <span title="summaries[engine=current;scenario=combined;operation=import].retainedAllocationDeltaBytes">Current · combined · import · retained allocation delta bytes</span> | 111.0 MiB / 115.9 MiB | 36.2 MiB / 36.9 MiB | 0.33× | Smaller |
| <span title="summaries[engine=current;scenario=compression-ratio;operation=reject].durationMs">Current · compression ratio · reject · duration ms</span> | 1.36 ms / 1.42 ms | 2.69 ms / 2.99 ms | 1.98× (p95 2.11×) | Slower |
| <span title="summaries[engine=current;scenario=compression-ratio;operation=reject].maxRssBytes">Current · compression ratio · reject · max rss bytes</span> | 42.7 MiB / 43.9 MiB | 43.9 MiB / 44.4 MiB | 1.03× | Larger |
| <span title="summaries[engine=current;scenario=compression-ratio;operation=reject].processWallMs">Current · compression ratio · reject · process wall ms</span> | 46.1 ms / 46.4 ms | 53.0 ms / 53.7 ms | 1.15× | Slower |
| <span title="summaries[engine=current;scenario=compression-ratio;operation=reject].retainedAllocationDeltaBytes">Current · compression ratio · reject · retained allocation delta bytes</span> | 0 B | 0 B | 1.00× | Unchanged |
| <span title="summaries[engine=current;scenario=deep-xml;operation=reject].durationMs">Current · deep xml · reject · duration ms</span> | 5.94 ms / 6.50 ms | 8.78 ms / 9.58 ms | 1.48× | Slower |
| <span title="summaries[engine=current;scenario=deep-xml;operation=reject].maxRssBytes">Current · deep xml · reject · max rss bytes</span> | 44.5 MiB / 44.7 MiB | 46.7 MiB / 47.4 MiB | 1.05× | Larger |
| <span title="summaries[engine=current;scenario=deep-xml;operation=reject].processWallMs">Current · deep xml · reject · process wall ms</span> | 51.2 ms / 51.6 ms | 59.4 ms / 60.1 ms | 1.16× | Slower |
| <span title="summaries[engine=current;scenario=deep-xml;operation=reject].retainedAllocationDeltaBytes">Current · deep xml · reject · retained allocation delta bytes</span> | 1.3 MiB | 1.3 MiB | 1.00× | Unchanged |
| <span title="summaries[engine=current;scenario=rich;operation=export].durationMs">Current · rich · export · duration ms</span> | 357 ms / 380 ms | 370 ms / 387 ms | 1.04× | Slower |
| <span title="summaries[engine=current;scenario=rich;operation=export].maxRssBytes">Current · rich · export · max rss bytes</span> | 133.1 MiB / 133.7 MiB | 138.9 MiB / 141.0 MiB | 1.04× | Larger |
| <span title="summaries[engine=current;scenario=rich;operation=export].processWallMs">Current · rich · export · process wall ms</span> | 451 ms / 477 ms | 470 ms / 489 ms | 1.04× | Slower |
| <span title="summaries[engine=current;scenario=rich;operation=export].retainedAllocationDeltaBytes">Current · rich · export · retained allocation delta bytes</span> | 2.2 MiB | 21.7 MiB / 21.9 MiB | 9.79× (p95 9.90×) | Larger |
| <span title="summaries[engine=current;scenario=scalar;operation=export].durationMs">Current · scalar · export · duration ms</span> | 455 ms / 463 ms | 442 ms / 458 ms | 0.97× | Faster |
| <span title="summaries[engine=current;scenario=scalar;operation=export].maxRssBytes">Current · scalar · export · max rss bytes</span> | 148.4 MiB / 151.0 MiB | 157.4 MiB / 159.2 MiB | 1.06× | Larger |
| <span title="summaries[engine=current;scenario=scalar;operation=export].processWallMs">Current · scalar · export · process wall ms</span> | 552 ms / 560 ms | 548 ms / 563 ms | 0.99× | Faster |
| <span title="summaries[engine=current;scenario=scalar;operation=export].retainedAllocationDeltaBytes">Current · scalar · export · retained allocation delta bytes</span> | 10.7 MiB | 26.8 MiB / 27.2 MiB | 2.52× | Larger |
| <span title="summaries[engine=current;scenario=shared-style;operation=export].durationMs">Current · shared style · export · duration ms</span> | 664 ms / 673 ms | 688 ms / 709 ms | 1.04× | Slower |
| <span title="summaries[engine=current;scenario=shared-style;operation=export].maxRssBytes">Current · shared style · export · max rss bytes</span> | 147.6 MiB / 155.0 MiB | 164.0 MiB / 165.6 MiB | 1.11× | Larger |
| <span title="summaries[engine=current;scenario=shared-style;operation=export].processWallMs">Current · shared style · export · process wall ms</span> | 770 ms / 779 ms | 802 ms / 823 ms | 1.04× | Slower |
| <span title="summaries[engine=current;scenario=shared-style;operation=export].retainedAllocationDeltaBytes">Current · shared style · export · retained allocation delta bytes</span> | 10.6 MiB | 13.5 MiB / 15.1 MiB | 1.27× (p95 1.42×) | Larger |
| <span title="summaries[engine=current;scenario=sparse;operation=export].durationMs">Current · sparse · export · duration ms</span> | 59.9 ms / 61.1 ms | 65.3 ms / 67.8 ms | 1.09× | Slower |
| <span title="summaries[engine=current;scenario=sparse;operation=export].maxRssBytes">Current · sparse · export · max rss bytes</span> | 84.3 MiB / 84.6 MiB | 90.5 MiB / 91.5 MiB | 1.07× | Larger |
| <span title="summaries[engine=current;scenario=sparse;operation=export].processWallMs">Current · sparse · export · process wall ms</span> | 146 ms / 147 ms | 158 ms / 159 ms | 1.08× | Slower |
| <span title="summaries[engine=current;scenario=sparse;operation=export].retainedAllocationDeltaBytes">Current · sparse · export · retained allocation delta bytes</span> | 343.3 KiB | 1.3 MiB | 3.81× | Larger |

</details>

<details class="bench-all"><summary>Render baseline raw · 28 measurements</summary>

Artifact <code>bench/results/render-baseline-raw.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:46 UTC. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 04:05 UTC.

Threshold: **none**. No documented historical-capture noise threshold for this suite; increases/decreases are reported without a regression claim. Source: <code>bench/README.md</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="results[engine=handsontable;rows=100000;scenarioId=altering.insert-5-rows-top]">Handsontable · 100,000 rows · altering · insert 5 rows top</span> | 14.5 ms / 15.6 ms | 17.3 ms / 18.3 ms | 1.19× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=altering.remove-5-rows-top]">Handsontable · 100,000 rows · altering · remove 5 rows top</span> | 12.5 ms / 13.8 ms | 15.1 ms / 15.5 ms | 1.20× (p95 1.12×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=arrow-down.top-left]">Handsontable · 100,000 rows · arrow down · top left</span> | 1.46 ms / 1.54 ms | 1.45 ms / 1.51 ms | 0.99× | Faster |
| <span title="results[engine=handsontable;rows=100000;scenarioId=arrow-right.middle]">Handsontable · 100,000 rows · arrow right · middle</span> | 1.38 ms / 1.39 ms | 1.38 ms / 1.42 ms | 1.00× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-commit.middle]">Handsontable · 100,000 rows · edit commit · middle</span> | 4.95 ms / 5.22 ms | 7.81 ms / 7.98 ms | 1.58× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.bottom-right]">Handsontable · 100,000 rows · edit open · bottom right</span> | 1.46 ms / 1.85 ms | 1.44 ms / 1.59 ms | 0.99× (p95 0.86×) | Faster |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.middle]">Handsontable · 100,000 rows · edit open · middle</span> | 1.04 ms / 1.08 ms | 1.04 ms / 1.07 ms | 1.01× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=edit-open.top-left]">Handsontable · 100,000 rows · edit open · top left</span> | 1.09 ms / 1.15 ms | 1.14 ms / 1.30 ms | 1.04× (p95 1.14×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=formatted-paint.top-left]">Handsontable · 100,000 rows · formatted paint · top left</span> | 3.31 ms / 3.53 ms | 6.15 ms / 6.25 ms | 1.86× (p95 1.77×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=merge-heavy.paint]">Handsontable · 100,000 rows · merge heavy · paint</span> | 3.48 ms / 3.62 ms | 6.34 ms / 6.43 ms | 1.82× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-down.middle]">Handsontable · 100,000 rows · scroll down · middle</span> | 4.00 ms / 4.42 ms | 6.84 ms / 8.34 ms | 1.71× (p95 1.89×) | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-down.top-left]">Handsontable · 100,000 rows · scroll down · top left</span> | 15.8 ms / 15.9 ms | 21.4 ms / 21.8 ms | 1.36× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-right.top-left]">Handsontable · 100,000 rows · scroll right · top left</span> | 10.5 ms / 10.6 ms | 16.4 ms / 17.0 ms | 1.56× | Slower |
| <span title="results[engine=handsontable;rows=100000;scenarioId=scroll-smooth.same-window]">Handsontable · 100,000 rows · scroll smooth · same window</span> | 7.71 ms / 8.10 ms | 10.5 ms / 10.7 ms | 1.36× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=altering.insert-5-rows-top]">Sheetwrite · 100,000 rows · altering · insert 5 rows top</span> | 1.90 ms / 2.01 ms | 1.97 ms / 2.17 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=altering.remove-5-rows-top]">Sheetwrite · 100,000 rows · altering · remove 5 rows top</span> | 1.64 ms / 1.73 ms | 1.64 ms / 1.75 ms | 1.00× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=arrow-down.top-left]">Sheetwrite · 100,000 rows · arrow down · top left</span> | 0.69 ms / 0.76 ms | 0.71 ms / 0.75 ms | 1.03× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=arrow-right.middle]">Sheetwrite · 100,000 rows · arrow right · middle</span> | 0.70 ms / 0.78 ms | 0.69 ms / 0.78 ms | 0.99× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-commit.middle]">Sheetwrite · 100,000 rows · edit commit · middle</span> | 0.96 ms / 1.06 ms | 1.03 ms / 1.15 ms | 1.07× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.bottom-right]">Sheetwrite · 100,000 rows · edit open · bottom right</span> | 0.58 ms / 0.59 ms | 0.58 ms / 0.61 ms | 1.00× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.middle]">Sheetwrite · 100,000 rows · edit open · middle</span> | 0.66 ms / 0.72 ms | 0.64 ms / 0.75 ms | 0.98× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=edit-open.top-left]">Sheetwrite · 100,000 rows · edit open · top left</span> | 0.60 ms / 0.67 ms | 0.63 ms / 0.68 ms | 1.05× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=formatted-paint.top-left]">Sheetwrite · 100,000 rows · formatted paint · top left</span> | 0.48 ms / 0.51 ms | 4 µs | 0.01× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=merge-heavy.paint]">Sheetwrite · 100,000 rows · merge heavy · paint</span> | 3 µs | 3 µs | 0.98× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.middle]">Sheetwrite · 100,000 rows · scroll down · middle</span> | 1.16 ms / 1.27 ms | 1.16 ms / 1.26 ms | 1.00× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-down.top-left]">Sheetwrite · 100,000 rows · scroll down · top left</span> | 1.38 ms / 1.48 ms | 1.41 ms / 1.54 ms | 1.02× | Slower |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-right.top-left]">Sheetwrite · 100,000 rows · scroll right · top left</span> | 0.26 ms / 0.29 ms | 0.26 ms / 0.28 ms | 0.99× | Faster |
| <span title="results[engine=sheetwrite;rows=100000;scenarioId=scroll-smooth.same-window]">Sheetwrite · 100,000 rows · scroll smooth · same window</span> | 0.41 ms / 0.44 ms | 0.40 ms / 0.43 ms | 0.96× | Faster |

</details>

<details class="bench-all"><summary>Render baseline · 28 measurements</summary>

Artifact <code>bench/results/render-baseline.json</code>. Baseline: 0.5.4, <code title="685c9c920f89860ffff96531a3d18b6845808444">685c9c920f89</code> · 2026-10-29 03:40 UTC · scope start. Candidate: <code title="ac4ab632d80abf8d0c2986685c04ebce7747e5fa">ac4ab632d80a</code> · 2026-10-29 03:59 UTC · scope start.

Threshold: **bootstrap-median-delta**. Independent raw-sample median bootstrap; 99% familywise confidence, 20,000 resamples, maximum regression 0 ms. Historical/candidate harnesses are not asserted identical; descriptive release evidence, not bench:check approval. Source: <code>bench/src/controlled-baseline.ts</code>.

| Measurement | 0.5.4 median / p95 | 0.6.0 median / p95 | Change | Result |
| --- | ---: | ---: | ---: | --- |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=altering.insert-5-rows-top]">Handsontable · 100,000 rows · altering · insert 5 rows top</span> | 14.5 ms / 21.2 ms | 17.3 ms / 18.8 ms | 1.19× (p95 0.89×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=altering.remove-5-rows-top]">Handsontable · 100,000 rows · altering · remove 5 rows top</span> | 12.5 ms / 15.5 ms | 15.0 ms / 15.8 ms | 1.20× (p95 1.02×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=arrow-down.top-left]">Handsontable · 100,000 rows · arrow down · top left</span> | 1.46 ms / 2.11 ms | 1.47 ms / 1.69 ms | 1.01× (p95 0.80×) | Within budget |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=arrow-right.middle]">Handsontable · 100,000 rows · arrow right · middle</span> | 1.37 ms / 1.46 ms | 1.38 ms / 1.48 ms | 1.00× | Within budget |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=edit-commit.middle]">Handsontable · 100,000 rows · edit commit · middle</span> | 4.95 ms / 5.52 ms | 7.80 ms / 8.18 ms | 1.58× (p95 1.48×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=edit-open.bottom-right]">Handsontable · 100,000 rows · edit open · bottom right</span> | 1.46 ms / 2.06 ms | 1.44 ms / 1.77 ms | 0.99× (p95 0.86×) | Within budget |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=edit-open.middle]">Handsontable · 100,000 rows · edit open · middle</span> | 1.04 ms / 1.10 ms | 1.04 ms / 1.12 ms | 1.00× | Within budget |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=edit-open.top-left]">Handsontable · 100,000 rows · edit open · top left</span> | 1.09 ms / 1.19 ms | 1.14 ms / 1.36 ms | 1.04× (p95 1.15×) | Within budget |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=formatted-paint.top-left]">Handsontable · 100,000 rows · formatted paint · top left</span> | 3.36 ms / 3.72 ms | 6.14 ms / 7.65 ms | 1.83× (p95 2.05×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=merge-heavy.paint]">Handsontable · 100,000 rows · merge heavy · paint</span> | 3.48 ms / 3.76 ms | 6.37 ms / 6.54 ms | 1.83× (p95 1.74×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-down.middle]">Handsontable · 100,000 rows · scroll down · middle</span> | 4.00 ms / 4.98 ms | 6.86 ms / 9.86 ms | 1.71× (p95 1.98×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-down.top-left]">Handsontable · 100,000 rows · scroll down · top left</span> | 15.8 ms / 16.0 ms | 21.3 ms / 21.9 ms | 1.35× | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-right.top-left]">Handsontable · 100,000 rows · scroll right · top left</span> | 10.6 ms / 10.7 ms | 16.4 ms / 17.8 ms | 1.56× (p95 1.66×) | **Flagged** |
| <span title="cells[key=engine=handsontable;rows=100000;scenario=scroll-smooth.same-window]">Handsontable · 100,000 rows · scroll smooth · same window</span> | 7.72 ms / 8.33 ms | 10.5 ms / 11.3 ms | 1.36× | **Flagged** |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=altering.insert-5-rows-top]">Sheetwrite · 100,000 rows · altering · insert 5 rows top</span> | 1.87 ms / 2.19 ms | 1.97 ms / 2.33 ms | 1.05× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=altering.remove-5-rows-top]">Sheetwrite · 100,000 rows · altering · remove 5 rows top</span> | 1.66 ms / 1.80 ms | 1.64 ms / 1.84 ms | 0.99× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=arrow-down.top-left]">Sheetwrite · 100,000 rows · arrow down · top left</span> | 0.69 ms / 0.80 ms | 0.71 ms / 0.78 ms | 1.03× (p95 0.98×) | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=arrow-right.middle]">Sheetwrite · 100,000 rows · arrow right · middle</span> | 0.69 ms / 0.81 ms | 0.69 ms / 0.82 ms | 1.00× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=edit-commit.middle]">Sheetwrite · 100,000 rows · edit commit · middle</span> | 0.96 ms / 1.15 ms | 1.05 ms / 1.24 ms | 1.09× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.bottom-right]">Sheetwrite · 100,000 rows · edit open · bottom right</span> | 0.56 ms / 0.63 ms | 0.58 ms / 0.64 ms | 1.02× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.middle]">Sheetwrite · 100,000 rows · edit open · middle</span> | 0.65 ms / 0.79 ms | 0.65 ms / 0.79 ms | 1.00× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=edit-open.top-left]">Sheetwrite · 100,000 rows · edit open · top left</span> | 0.60 ms / 0.94 ms | 0.63 ms / 0.92 ms | 1.05× (p95 0.98×) | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=formatted-paint.top-left]">Sheetwrite · 100,000 rows · formatted paint · top left</span> | 0.47 ms / 0.55 ms | 4 µs | 0.01× | Faster beyond noise |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=merge-heavy.paint]">Sheetwrite · 100,000 rows · merge heavy · paint</span> | 3 µs / 4 µs | 3 µs | 0.98× (p95 0.79×) | Faster beyond noise |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=scroll-down.middle]">Sheetwrite · 100,000 rows · scroll down · middle</span> | 1.18 ms / 1.30 ms | 1.15 ms / 1.32 ms | 0.98× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=scroll-down.top-left]">Sheetwrite · 100,000 rows · scroll down · top left</span> | 1.36 ms / 1.59 ms | 1.41 ms / 1.59 ms | 1.04× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=scroll-right.top-left]">Sheetwrite · 100,000 rows · scroll right · top left</span> | 0.26 ms / 0.31 ms | 0.26 ms / 0.31 ms | 1.00× | Within budget |
| <span title="cells[key=engine=sheetwrite;rows=100000;scenario=scroll-smooth.same-window]">Sheetwrite · 100,000 rows · scroll smooth · same window</span> | 0.41 ms / 0.46 ms | 0.40 ms / 0.47 ms | 0.97× | Within budget |

</details>

Generate from captured artifacts without running benchmarks:

```sh verify title="Release comparison artifact"
cd bench
bun src/release-comparison.ts --base-ref release/version-0.5.4 --baseline-results-dir results/releases/0.5.4 --output results/release-comparison.json
```
