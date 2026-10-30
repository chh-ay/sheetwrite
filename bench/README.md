# Sheetwrite vs Handsontable — performance benchmarks

A rigorous, reproducible comparison between **Sheetwrite** (`@sheetwrite/core` — a
canvas-rendered grid over a Rust→WASM columnar store) and **Handsontable**
(`handsontable`, the popular JS data grid) across the operations that decide how
a grid feels at scale: load, read, edit, sort, filter, aggregate, scroll, and
navigate.

Release captures always measure the latest released version of each comparison engine; artifacts record the exact installed versions (and the XLSX baseline commit) measured.

Two benchmarks, run independently:

| Benchmark | Where | What it answers |
|---|---|---|
| **Data layer** (`bun run bench:data`) | headless (Bun) | How fast is each engine's *data* model — ingest, windowed read, edit, sort, filter, aggregate — and how much memory does Sheetwrite's columnar store use? |
| **Render** (`bun run bench:render`) | real browser | How does each engine *render and respond* at 100k–1M rows — initial paint, sustained scroll, edit latency, row altering, keyboard navigation? |

The split is deliberate and honest: Handsontable is a DOM grid and **cannot
virtualize without a browser layout engine**. Headless (happy-dom) it renders
*every* row — a single 100k construct measured ~26 s, materializing ~131k
`<tr>`s — so the at-scale, apples-to-apples comparison must happen in a real
browser. The data-layer bench therefore runs Handsontable only where it
completes headlessly (1k/10k) and pushes Sheetwrite to 1M to show its scaling;
the browser bench carries the at-scale head-to-head.

The formula benchmark also exposes `bun run bench:formula --grid-constant-edit`.
It loads 100,000 formulas and measures single-cell `SheetwriteStore.applyTransaction`
edits, the same source-replacement path that Grid uses. The edit alternates two
constants, checks the computed value after each edit, and reports ten samples
after two warmups. The scalar `formula-constant-edit` workload remains available
through `--sample formula-constant-edit 100000` for comparison.

### Engine memory-release gate

From the repository root, run `bun bench/src/engine-memory-release-bench.ts --compare <detached-base-worktree> --engine wasm --output <artifact.json>` under the machine's benchmark runner. Repeat with `--engine formulas`, keeping one CPU slot for all rounds. Both worktrees need release-built engines.

The harness discards forty warmups and records twenty-one samples for edit, read, ingest, and recalculation. Each sample covers 1,024 edits, 2,048 scrolling windows, one 100,000-row ingest, or 32 recalculations, respectively, so JSC tier-up and finalizer scheduling do not dominate a short batch. It runs three A/A controls, then five alternating ABBA/BAAB rounds; the artifact retains every sample, per-round medians, the A/A noise band, and the median-of-round-medians verdict. Ordinary paths may not exceed a 3% slowdown beyond the measured A/A spread. Use `--metric read` with Bun's `--cpu-prof` to isolate read-loop profiles on either worktree.

Use `--mode memory --engine wasm --output <artifact.json>` (and `formulas`) for million-row dense-clear, paged dirty-edit, and large-clear history scenarios. It checks preserved values, undo/redo, no history materialization during migration, a cleared WeakRef to the retired memory, and lower committed WASM/process memory. JavaScript heap is JSC's non-external heap (`heapSize - extraMemorySize`); external accounting is retained separately because JSC counts WASM/ArrayBuffer backing allocations there. Process memory is RSS after five full-GC/event-loop turns, not an estimate from that external counter.

The ordinary-path captures below compare `5a16a55` with the memory-release stack on Bun 1.4.3, using runner slot 4. The read profiles and longer warmed batches are retained in `results/engine-memory-release-{read-profiles,paths-wasm,paths-formulas}.json`. The memory observations below use the formula/spill overlay transfer on Bun 1.4.3 and runner slot 8.

Memory observations below are MiB before → after, after five GC/event-loop turns. Empty-dense is a new million-row, three-column dense store with no data. Dense-clear keeps ten populated rows of the same store. Paged-dirty has a million logical rows, a transient 200,000-row page load under a 64 KiB clean-cache budget, and two dirty edits. Large-clear-history keeps the compact inverse of a three-column million-row clear. The fresh floor is the WASM memory of a store newly built with the same surviving content and row count, plus the compact history bytes. The scenarios run in sequence in one engine.

| Engine | Scenario | WASM MiB | Fresh floor MiB | Non-external JS heap MiB | Process RSS MiB | Pause ms |
| --- | --- | --- | --- | --- | --- | --- |
| wasm | empty-dense | 38.44 → 38.44 | 38.44 | 5.61 → 5.62 | 111.01 → 109.31 | 47.39 |
| wasm | dense-clear | 101.06 → 38.44 | 38.44 | 5.63 → 5.64 | 180.89 → 118.54 | 43.34 |
| wasm | paged-dirty | 38.44 → 1.19 | 1.19 | 5.65 → 5.66 | 136.68 → 82.93 | 3.73 |
| wasm | large-clear-history | 101.12 → 75.75 | 75.75 (38.56 + 37.19 history) | 7.81 → 7.83 | 197.33 → 160.97 | 223.57 |
| formulas | empty-dense | 38.44 → 38.44 | 38.44 | 5.68 → 5.69 | 109.84 → 109.77 | 45.38 |
| formulas | dense-clear | 101.06 → 38.44 | 38.44 | 5.71 → 5.72 | 178.77 → 116.39 | 42.98 |
| formulas | paged-dirty | 38.44 → 1.19 | 1.19 | 5.72 → 5.73 | 134.92 → 81.89 | 3.22 |
| formulas | large-clear-history | 101.12 → 75.75 | 75.75 (38.56 + 37.19 history) | 7.89 → 7.90 | 197.34 → 162.70 | 251.62 |

Release never grows the WASM memory, and every scenario lands on its fresh floor. The transfer is sized by content, not row count: runs of empty or default values are encoded as runs, and the new instance decodes from a JavaScript buffer through a bounded 64 KiB reader straight into its final vectors, so no full transfer image stays in its heap. All eight retired-memory WeakRefs cleared. Raw bytes and pause measurements are in `results/engine-memory-release-memory-{wasm,formulas}.json`. These local captures are not portable memory ceilings.

| Engine | Baseline raw B | Changed raw B | Baseline Brotli B | Changed Brotli B | Brotli increase B |
| --- | --- | --- | --- | --- | --- |
| wasm | 848920 | 868980 | 250156 | 253254 | 3098 |
| formulas | 1131855 | 1152337 | 338151 | 341843 | 3692 |

Brotli uses quality 11; the size baseline is stack top `89222d66` (#102), rebuilt with the same toolchain. Exact byte counts are retained in `results/formula-spill-transfer-sizes.json`. Dense calculated overlays encode absent slots as runs; paged overlays transfer only occupied slots, including their compact error codes. Core boot creates only its collectible instance. The published synchronous exports initialize once, on first use, from the module that instance compiled, and the first instance marks the published loader ready. A fresh-process regression counts real instances to guard against a second eager boot instance.

Ordinary-path verdicts (milliseconds per operation; 3 A/A controls, then 5 ABBA rounds on slot 4; the A/A spread is the maximum absolute paired-control delta):

| Engine | Path | A median ms | B median ms | Delta | A/A spread | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| wasm | edit | 0.0031 | 0.0032 | +3.05% | 12.11% | pass |
| wasm | scroll/read | 0.0059 | 0.0059 | +0.64% | 1.19% | pass |
| wasm | ingest | 33.108 | 33.337 | +0.69% | 1.39% | pass |
| wasm | recalculation | 0.6959 | 0.6996 | +0.53% | 2.13% | pass |
| formulas | edit | 0.0031 | 0.0030 | −1.59% | 5.77% | pass |
| formulas | scroll/read | 0.0058 | 0.0059 | +1.91% | 5.39% | pass |
| formulas | ingest | 33.463 | 33.313 | −0.45% | 0.53% | pass |
| formulas | recalculation | 0.6956 | 0.6941 | −0.22% | 1.25% | pass |

Every path is within the A/A noise plus 3 points; these measurements do not show a speedup. Every unrounded per-round median, raw sample and A/A control is in `results/engine-memory-release-paths-{wasm,formulas}.json`.

The adapter lifetime microbenchmark measures real React, Vue, and Svelte
mount/unmount and mount/reset/unmount commits, with direct Grid mounting and
selection controls. Each workload runs in a fresh process to prevent queued
rendering from contaminating other workloads. Initialization is excluded; each
workload discards 30 warmup iterations and reports the median of seven
150-iteration samples in microseconds. Run from the repository root (increase
`ADAPTER_BENCH_ITERATIONS` to reduce noise, or set `ADAPTER_BENCH_WORKLOAD` to run
one named workload):

```sh
taskset -c <idle-core> timeout 1200 bun \
  --preload ./test-setup.ts --preload ./test-setup-svelte.ts \
  bench/src/adapter-lifetime-bench.ts
```

Compare the same harness on both revisions using A/A control captures followed
by alternating ABBA rounds; compare medians of each round's paired medians.
Use the same Svelte client-runtime preload in the baseline checkout: a server
`untrack` implementation changes reactive scheduling and invalidates comparison.
The recorded gate in `results/adapter-lifetime-gate.json` includes two A/A controls
and five alternating ABBA rounds on CPU 4. Control medians changed by -0.1% and
-0.5%; adapter medians improved by 15.8–37.8%. A/A spread reached 16.2%, so these
captures establish no regression rather than a precise speedup claim.


─────────────────────────────────────────────────────────────────────────────

## Methodology

### Dataset (`src/dataset.ts`)

A single **seeded, deterministic** generator (`mulberry32(seed)`) produces
`N` rows × 5 columns — `id` (number), `date` (text), `customer` (text), `city`
(text), `amount` (number). A given `(rows, seed)` always yields byte-identical
content, so every workload runs over the *same* data on both engines and results
reproduce across machines and runs. Only the in-memory representation differs:
Sheetwrite ingests a **columnar** shape (a typed array per column — the layout
its WASM store consumes); Handsontable ingests the same logical rows as a
**row-major array-of-arrays**.

### Statistics (`src/stats.ts`)

Every workload is **warmed up** (untimed iterations to reach JIT/allocator/cache
steady state), then a larger set of **timed iterations** is collected and reduced
to **median + p95** (nearest-rank) rather than a mean — a single GC pause or
scheduler hiccup cannot dominate the headline number. Cheap operations sample
hundreds of times; expensive ones (1M-row ingest) fewer. Iteration counts are
encoded in `plan()` (data bench) and per scenario (render bench).

### What's measured, and why

| Workload | Why it matters | Sheetwrite path | Handsontable path |
|---|---|---|---|
| Ingest | first-load cost | `new SheetwriteStore(workbook, columnar)` | `new Handsontable(el, { data, … })` |
| Window read | the per-frame render read | `store.getVisibleWindow(50×5)` | `hot.getData(r1,c1,r2,c2)` over the same range |
| Edit ×1000 | interactive typing | 1000 `applyTransaction` set patches | 1000 `setDataAtCell` (in `suspendRender`/`resumeRender`) |
| Sort | column sort | `store.sortBy(amount)` (WASM) | `columnSorting` plugin |
| Filter | text filter | `store.filterBy(city, "Tokyo")` (WASM) | `filters` plugin (`contains`) |
| Aggregate | column math | `store.aggregate(amount, "sum")` (WASM) | plain-JS sum over `getSourceDataAtCol` |

Both engines agree on the data (e.g. the `city = "Tokyo"` filter selects 146 of
1000 rows, and `sum(amount)` matches to the cent on both), confirming the
workloads are equivalent.

### Formula-engine protocol

`bun run --filter '@sheetwrite/bench' bench:formula` measures deterministic
formula topologies from `src/formula-dataset.ts`; the reduced CI check is
`bench:formula:smoke`. Every fixture runs one untimed correctness pass before
sampling, validates representative results/errors after every timed iteration,
and preserves all five raw samples plus median/p95 in
`results/formula-results.json`. Formula memory is the exact WASM linear-memory
delta from isolated 1K/10K/100K-formula subprocesses.

`bench:formula:engines` runs the same full workload matrix on the default and
full engines in separate processes. It writes `formula-default-results.json`,
`formula-full-results.json`, and `full-engine-results.json` under `results/`.
The last file adds an engine dimension, checked analysis workloads, WASM raw
and Brotli quality 11 sizes, and five fresh Node initialization samples.
The shared captures keep the schema-v2 validator and use output mode. Their
baseline gates stay blocked. These results are local measurements, not a
passed timing regression gate. The legacy shared source keys name the WASM
role; their hashes use the selected engine. The outer artifact records the
physical paths and binds each engine to its captured WASM hash.

Build the packages first. Run one capture at a time from `bench/` on an
otherwise idle machine, pinned to one CPU. Do not run concurrent builds or
timing captures: competing work adds scheduler and CPU noise. For example,
on Linux with CPU 4:

```sh
taskset -c 4 bun run src/full-engine-bench.ts
```

`bench:formula:matched` checks the eight shared rows that were slower in the
first sequential capture. It runs 25 default/full pairs per row (`--rounds`
changes that count, minimum 2). Each timed sample uses a fresh Bun process,
runs three untimed warm-up fixtures, then repeats the fixture until at least
50 ms of measured time and records the per-iteration mean. Repeating a short
operation is what makes the paired ratio usable: a single cold run of a 2 ms
workload drifted by more than 4x between fresh processes, while the aggregated
sample stays inside a few percent. The artifact retains all samples and
checksums, every sample's iteration count and total, median paired ratios, and
the p10 to p90 ratio spread; the evidence page marks any row whose spread is
too wide to support a ratio claim.
Edit samples build the fixture once per process, including the warmups. After
every checked edit, an untimed restore writes the original source and
recalculates it. The timed edit therefore always starts from the same values;
it never becomes a same-value write or a clean recomputation. Load and first-
recompute samples still need fresh fixtures because their operation consumes
the state being measured. A reused fixture times a warmer edit than a fresh
one, so absolute matched means captured before this change are not comparable
with later ones; the default/full ratios remain comparable.
The single-sample runner is
`bun run src/formula-bench.ts --sample ID SIZE [--aggregate-ms 50] [--warmup-fixtures 3]`.
It supports the matched workload set. Use the same pinned-runner command as
above with `src/matched-engine-bench.ts`. `--results-dir <dir>` redirects every
artifact write of the engine captures, so a rehearsal never overwrites tracked
evidence.

The suite covers independent parse/load and first recompute, safe-depth linear
chains, 100K fan-out, diamonds, shared/distinct ranges, cross-sheet ranges,
scalar edits affecting 0/1/1K/100K formulas, topology removal/addition, cycles,
removed-sheet `#REF!`, and error propagation. Gates are deliberately broad:
100K parse/load and recompute p95 must stay below 5 seconds and 100K formulas
below 256 MiB; timer-floor workloads are recorded but never ratio-gated.

A release capture, `bench:formula`, compares one fresh capture with the
committed `results/formula-results.json` on a quiet, pinned machine. It keeps
that absolute baseline for release evidence and writes the tracked file when
it passes. Its timing limits are `max(baseline × 1.25, baseline + 0.1 ms)` for
median and p95 rows at or above 1 ms, and `max(baseline × 1.25, baseline +
0.3 ms)` for sub-millisecond medians. Bytes may not grow.

### Formula gate for changes on a shared machine

Before an engine change merges, compare its built engine with a base build.
Do not use the absolute release baseline for this: other work on a shared
machine can make an unchanged commit 1.3-2.8x slower than its quiet capture.
From the candidate checkout:

```sh
taskset -c <idle-core> bun bench/src/formula-gate.ts \
  --base <base-checkout> --output <gate-report.json>
```

`taskset -c <idle-core>` pins the run to one idle core on Linux; use the
equivalent on other systems, or drop it.

The harness, its fixtures and their sampling always come from the checkout
that runs the gate. `--base` and `--candidate` (default: this checkout) only
supply built engine packages, `packages/wasm/pkg` and its loader, so any older
base works without this benchmark code. Build both engines first. The gate
therefore measures the engine only: changes to TypeScript callers in
`packages/core` are invisible to it. If a fixture calls a `CellStore` export
that an older base lacks, that row is reported as skipped on the base; any
other error fails the capture, and a row the candidate cannot run fails the
gate.

Each capture is a fresh process that runs every full-matrix workload once as
an aggregated sample: three checked warm-up fixtures, then timed runs until
they add up to at least 50 ms, reported as the per-run mean. Edit workloads
restore their fixture, untimed, between runs; load and first-recalculation
workloads build a fresh fixture per run. The first and last runs are checked.
Allocation comes from the first run, so byte counters do not depend on how many
runs fit into 50 ms. Captures took 11 s each across four 7-pair gates (14
captures, about 2.6 minutes per gate) on the shared laptop; one capture during
heavier load took 60 s.

The gate runs 7 pairs (`--pairs <n>` may add more, never fewer: the limits below
were measured at 7) in AB, BA, AB order, so machine drift affects both sides.
For each row it takes the median of the paired candidate/base ratios and
fails when it exceeds the row's ratio limit. There is no absolute floor:
aggregation makes microsecond rows measurable, so they are gated too. If any
row fails, the gate captures as many pairs again and judges every row on all
of them: a noisy window rarely repeats, a real slowdown does. A gate that
confirms therefore takes twice as long.

The limits come from 56 same-engine pairs from eight gates on a shared
20-thread laptop, in quiet and loaded windows. Each row's pair ratios were
resampled 20,000 times into seven-pair medians. The limit is
`1 + 1.2 × (q99.9 − 1)`, at least 1.15, rounded up to 0.05. A true slowdown
`r` can measure as low as `r × q0.1`, so a regression reliably fails only at
`limit / q0.1`, the minimum detectable ratio below; smaller slowdowns may pass.
The 1K and 10K load and first-recompute rows build a fresh store for every
run, so they are the noisiest; the 100K rows are the reliable load signal.

| Workload | Ratio limit | q99.9 | q0.1 | Minimum detectable ratio |
| --- | ---: | ---: | ---: | ---: |
| independent-parse-load/1000 | 1.55 | 1.429 | 0.740 | 2.10 |
| independent-first-recompute/1000 | 1.70 | 1.552 | 0.710 | 2.40 |
| independent-parse-load/10000 | 1.65 | 1.518 | 0.817 | 2.05 |
| independent-first-recompute/10000 | 1.30 | 1.247 | 0.908 | 1.45 |
| independent-parse-load/100000 | 1.20 | 1.166 | 0.945 | 1.30 |
| independent-first-recompute/100000 | 1.25 | 1.169 | 0.873 | 1.45 |
| linear-chain/8 | 1.45 | 1.358 | 0.711 | 2.05 |
| linear-chain/16 | 1.30 | 1.218 | 0.884 | 1.50 |
| linear-chain/32 | 1.30 | 1.225 | 0.909 | 1.45 |
| linear-chain/64 | 1.20 | 1.147 | 0.892 | 1.35 |
| wide-fan-out-edit/1000 | 1.25 | 1.191 | 0.905 | 1.40 |
| wide-fan-out-edit/100000 | 1.20 | 1.156 | 0.923 | 1.30 |
| diamond-edit/32 | 1.25 | 1.207 | 0.932 | 1.35 |
| shared-range-edit/1000 | 1.30 | 1.234 | 0.948 | 1.40 |
| distinct-range-edit/1000 | 1.30 | 1.244 | 0.925 | 1.45 |
| cross-sheet-range-edit/1000 | 1.30 | 1.220 | 0.937 | 1.40 |
| scalar-edit-affects-0/1000 | 1.35 | 1.280 | 0.857 | 1.60 |
| scalar-edit-affects-1/1 | 1.20 | 1.146 | 0.951 | 1.30 |
| scalar-edit-affects-1000/1000 | 1.25 | 1.170 | 0.976 | 1.30 |
| scalar-edit-affects-100000/100000 | 1.20 | 1.130 | 0.954 | 1.30 |
| formula-constant-edit/100000 | 1.25 | 1.180 | 0.913 | 1.40 |
| topology-remove-add/10000 | 1.20 | 1.161 | 0.965 | 1.25 |
| cycles/1000 | 1.25 | 1.177 | 0.977 | 1.30 |
| removed-sheet-ref/1000 | 1.30 | 1.212 | 0.871 | 1.50 |
| error-propagation/1000 | 1.20 | 1.146 | 0.953 | 1.30 |
| criteria-range-edit/100000 | 1.25 | 1.185 | 0.982 | 1.30 |
| lookup-range-edit/100000 | 1.20 | 1.140 | 0.926 | 1.30 |
| vlookup-many/1000 | 1.15 | 1.073 | 0.946 | 1.25 |
| vlookup-many-edit/1000 | 1.15 | 1.082 | 0.980 | 1.20 |
| vlookup-many-sorted/1000 | 1.15 | 1.060 | 0.964 | 1.20 |
| vlookup-many-sorted-edit/1000 | 1.20 | 1.154 | 0.926 | 1.30 |
| xlookup-many/1000 | 1.20 | 1.158 | 0.948 | 1.30 |
| xlookup-many-edit/1000 | 1.25 | 1.173 | 0.936 | 1.35 |
| xlookup-many-sorted/1000 | 1.20 | 1.145 | 0.959 | 1.30 |
| xlookup-many-sorted-edit/1000 | 1.20 | 1.158 | 0.937 | 1.30 |
| text-lookup-many/1000 | 1.20 | 1.161 | 0.922 | 1.35 |
| text-lookup-many-edit/1000 | 1.15 | 1.105 | 0.958 | 1.25 |
| text-lookup-many-sorted/1000 | 1.20 | 1.153 | 0.940 | 1.30 |
| text-lookup-many-sorted-edit/1000 | 1.20 | 1.151 | 0.949 | 1.30 |
| spill-filter-resize/100000 | 1.15 | 1.065 | 0.946 | 1.25 |
| sumproduct-vector-edit/100000 | 1.15 | 1.082 | 0.932 | 1.25 |
| sumproduct-matrix-edit/100000 | 1.15 | 1.046 | 0.957 | 1.25 |
| criteria-multi-range-edit/100000 | 1.15 | 1.063 | 0.939 | 1.25 |
| sum-multi-range/100000 | 1.15 | 1.081 | 0.959 | 1.20 |
| sumifs-3-criteria/100000 | 1.15 | 1.076 | 0.957 | 1.25 |
| countif-100k/100000 | 1.15 | 1.066 | 0.943 | 1.25 |
| unicode-text-date-edit/1000 | 1.15 | 1.050 | 0.944 | 1.25 |
| percentile-covariance/100000 | 1.15 | 1.078 | 0.926 | 1.25 |
| let-reuse-edit/100000 | 1.15 | 1.086 | 0.902 | 1.30 |
| let-repeat/100000 | 1.20 | 1.158 | 0.892 | 1.35 |
| iterative-finance/1000 | 1.15 | 1.064 | 0.910 | 1.30 |
| incremental-dependency-closure-edit/100000 | 1.15 | 1.111 | 0.940 | 1.25 |
| spill-sequence-admission/100000 | 1.15 | 1.110 | 0.917 | 1.30 |

Recalibrate these limits when the matrix, the sampling or the default pair
count changes, from fresh same-engine pairs that are not the acceptance runs.

Retained bytes, peak transient bytes, transient allocation counts, and the
isolated WASM deltas are nearly deterministic: one row differed by 105 B in one
of 14 same-engine captures. The gate compares the middle candidate capture with
the middle base capture, so growth that appears in most captures fails even
at one byte. A reviewed trade-off may pass `--accept-bytes <file>` for that
exact candidate engine:

```json
{
  "candidateEngineDigest": "<engineDigest from the candidate captures>",
  "rows": [
    {
      "key": "workload=vlookup-many;size=1000.allocation.retainedBytes",
      "maximum": 520000,
      "reason": "lookup cache: +8 B per formula; paired median -20%"
    }
  ]
}
```

The gate accepts only the listed rows, prints each accepted row and reason, and
rejects a file for another engine build or a row that no longer grows. Once the
change merges, the next base includes the new bytes, so the file lapses.

On a shared machine, pin both sides of a comparison to the same idle core.
Never run two comparisons on that core at once, and never run a capture while a
build is using it.

Latest checked capture: `bench:formula:smoke` at
`2026-07-13T08:56:07Z`, core commit `844da4e`, Bun 1.3.14, linux/x64,
12th Gen Intel Core i9-12900H (14 cores / 20 logical CPUs). Times are local-run
regression evidence, not cross-machine latency guarantees:

| 100K-formula workload | median ms | p95 ms |
| --- | ---: | ---: |
| parse/load | 75.58 | 87.92 |
| first recompute | 172.71 | 227.22 |
| fan-out edit | 136.17 | 146.28 |
| scalar edit affecting 100K | 114.65 | 123.81 |
| criteria range edit | 5.59 | 5.75 |
| lookup range edit | 6.18 | 6.71 |

Isolated WASM growth was 0.88 MiB (1K), 7.31 MiB (10K), and 62.00 MiB
(100K). The capture passed the declared gates. Raw samples, means, deviations,
and gate metadata remain in `results/formula-results.json`; the generated
`results/formula-results.md` is the matching human-readable report.

### Honest asymmetries (declared, not hidden)

- **Sheetwrite** keeps all cell data in **WASM linear memory** (a Rust columnar
  store) and, headless, does **no painting**. Its JS-side retained state is
  `O(columns + unique styles + active view)`, never `O(cells)`.
- **Handsontable** keeps data in **JS arrays coupled to a DOM view**. Its edit
  loop is bracketed by `suspendRender`/`resumeRender` to isolate the data path
  (it otherwise repaints on every edit), and it has **no native column
  aggregate**, so the sum is computed in idiomatic plain JS over its source
  array. Both facts are reported in the results.
- **Memory** is sampled in **isolated subprocesses** so each figure reflects a
  clean process. For Sheetwrite the meaningful figure is the **WASM
  `memory.buffer` byteLength delta** (exact); Bun's `process.heapUsed` conflates
  the WASM `ArrayBuffer` with the JS heap and is *not* used. Handsontable's
  representative memory is captured in the browser bench — its headless heap is
  dominated by the non-virtualized all-rows DOM and is not comparable.

### Render bench scenarios — adapted from Handsontable's own suite

The browser bench adapts the four scenario families in Handsontable's official
performance suite, [`handsontable/performance-lab`](https://github.com/handsontable/performance-lab)
(`master`), but uses Sheetwrite's versioned auditable protocol. Each measured
sample repeats one logical action until its aggregate measured duration reaches
at least 100 ms. Declared aggregate warmups are excluded; every measured sample
is retained, and median, linearly interpolated p95, and MAD use all valid samples.

| Adapted spec | What we mirror |
|---|---|
| [`test/spec/view-scrolling.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/view-scrolling.spec.js) | scroll the master viewport by `SCROLL_STEP = 50px` repeatedly (down from top-left, down from middle, right from top-left); per-operation timing plus logical scroll checkpoints |
| [`test/spec/editing.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/editing.spec.js) | select + scroll a cell into view at top-left / middle / bottom-right, then open the editor (edit-open latency) and commit (edit-commit latency) |
| [`test/spec/altering.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/altering.spec.js) | insert / remove 5 rows at the top |
| [`test/spec/arrow-keys-navigation.spec.js`](https://github.com/handsontable/performance-lab/blob/master/test/spec/arrow-keys-navigation.spec.js) | move the selection one cell (arrow-down from top-left, arrow-right from middle) |

Sheetwrite's viewport is driven via its `.sheetwrite-scroller` element and its
keyboard path (`Enter` → editor, arrows → navigation, `applyTransaction` with
`addRows`/`removeRows` → altering); Handsontable uses `.ht_master .wtHolder`,
`getActiveEditor()`, `alter()`, and its selection API. Scroll samples force each
engine's paint inside the timed operation (`grid.refresh()` / `hot.render()`), so
deferred work cannot make event dispatch look like a completed frame. Each engine
runs in a separate fresh Chromium process with the same deterministic dataset,
columns, 640×480 stage, scenario actions, correctness checkpoints, and virtualization.

### Current benchmark scope and missing coverage

The render benchmark mounts Sheetwrite through `@sheetwrite/core`'s direct
`createGrid(...)` path. That is the right engine baseline: it measures the
canvas renderer, store reads, editing path, row altering, and keyboard navigation
without framework noise.

It does **not** currently measure framework adapter overhead. React, Vue, and
Svelte wrappers do not render cells — cells are still painted by canvas — so the
expected overhead is around mount/unmount, event forwarding, parent re-renders,
and app-side `onGridChange` work rather than per-cell rendering. A separate adapter
benchmark should cover:

- vanilla `createGrid` vs. React, Vue, and Svelte `<SheetwriteGrid>` mount time;
- first paint after framework mount;
- parent re-render with a stable `workbook` identity;
- `onGridChange` callback latency with and without app state updates;
- unmount/remount cost.

The current benchmark also excludes validation-enabled edit workloads,
network/API submission, durable retry, and conflict-resolution UX. Core
validation can be benchmarked separately; transport and conflict policy belong
in an application benchmark.

### How to run

```sh
# Headless data-layer benchmark — prints a Markdown report and writes
# results/data-results.{md,json}
bun run bench:data

# Build the supported WASM loader and core package once from a clean checkout:
bun run bench:render:prepare

# Full counterbalanced browser run; writes results/render-results.{json,md}:
bun run bench:render

# Isolated engine smokes:
bun run bench:render:smoke -- --engine sheetwrite
bun run bench:render:smoke -- --engine handsontable

# Fail-closed schema, completeness, and byte-stable Markdown validation:
bun run bench:render:validate

# Core write-path evidence (packed block writes, CSV import, large restore,
# paged residency); writes results/core-paths-results.json
bun run bench:core-paths
```

The Performance pages in `docs/src/content/docs/performance/` publish every
artifact above. `bench:release` captures render-scale, the interaction
evidence, paged storage, data, core paths, formula, formula engines, matched
engines, and XLSX, then records the render regression baseline last. Every
capture stamps its artifact with the commit, tree state, and timestamp.
Run unpinned on an otherwise idle machine, with no concurrent builds or timing
captures. The 0.4.0 and 0.5.0 captures both ran unpinned on the same machine.

```sh
# Build first: every capture needs the built packages and WASM binaries.
bun run build:packages

# Then, from bench/, with the prepared XLSX comparison checkout:
bun run bench:release --xlsx-baseline-root /path/to/sheetwrite-xlsx-baseline
```

`bench:release` refuses a dirty tree, runs the captures in page order, stops at
the first failure, and rejects an artifact that does not stamp the current
clean commit. The XLSX capture compares the current tree against the
pre-0.5.0 codec, so the run needs a prepared checkout of that commit
(`git worktree add ../sheetwrite-xlsx-baseline 87fadb72`, then
`bun install --frozen-lockfile && bun run build:packages` inside it) passed as
`--xlsx-baseline-root <checkout path>`. `bench:release:smoke`
rehearses the same order with the smoke
matrices of the suites that have one, writing to `results/smoke/` (ignored by
git) so a rehearsal never overwrites published evidence. Regenerate the page
after a release capture with `bun run docs:generate`.

Render captures retain structured failures, but only Handsontable's million-row
`altering.insert-5-rows-top` and `altering.remove-5-rows-top` RangeErrors with
`Maximum call stack size exceeded` are allowed to complete the capture. These
same comparison-engine overflows occurred in 0.4.0; every other failed cell,
including every Sheetwrite failure, still fails the run.

The core-paths cold Node metric imports core before timing and measures
`initSheetwrite()` through construction of the first store, rather than the
published WASM singleton's `load()`. Core-backed memory probes observe core's
own engine instance; raw formula-engine probes continue to observe their own
published singleton.

The performance showcase reads `results/paged-results.json` and
`results/interaction-results.json`. `bench:paged` writes the paged capture;
`bench:interaction` measures the current values of the four interaction metrics
on the current build — packed inverse-index lookup latency, inverse-index
backing bytes, retained bytes after 100 distant edits, and the cold-route long
task owned by Sheetwrite — with raw samples, their summary, and the runner.
Those four metrics are held to the absolute release ceilings recorded in
`src/interaction-gate.ts`, not to a comparison with another build: the version 1
artifact was a one-off before/after pair, and a release cannot re-measure a
baseline build. `bench:release` refreshes both captures, and
`bench:interaction:smoke` rehearses the interaction one.

`bench:interaction-sessions` supplements that browser capture with synchronous
Grid-interface timings under happy-dom: row and column resize with twenty move
events followed by release, editor open/commit, pointer selection, and two
untouched controls (one hundred cell-input reads and a column aggregate).
It reports eleven raw samples in milliseconds per operation after three discarded
warmups. Each sample runs two thousand resize/edit operations, ten thousand
selection/read operations, or two hundred thousand aggregates. Garbage collection
and fixture restoration are outside the timed interval; resize includes admission
and history, but not undo. Longer samples keep sub-millisecond paths from turning
process startup and scheduling noise into an apparent regression.
These are imperative-path timings, not browser paint or input-to-frame latency.
For comparisons, build each checkout's packages first. Run five A/A ABBA control
rounds with the same baseline in both slots, then five actual ABBA rounds on the
same CPU under an exclusive lock. Compare medians of the per-round medians and
retain every raw round. A broad noise band makes a changed-path comparison
inconclusive; it does not excuse a slower result. Leave fifteen seconds between
locked commands so other checkouts can acquire the shared lock.

```sh
taskset -c <idle-core> bun run bench:interaction-sessions
```

A change to a harness source file, to the sampling flags, or to the protocol
version invalidates the committed render baseline: `bench:check` compares the
harness hashes, the declared sampling, and the runner (OS, CPU, Bun, Node,
Chromium, power mode, concurrency) of the fresh capture against
`results/render-baseline.json` and fails closed on any mismatch. `bench:release`
therefore ends by re-recording it on the frozen harness: ten controlled rounds
into `results/render-baseline-raw.json`, then the promotion of that raw artifact
over the committed baseline. Commit both in the release change; the promotion
diff is baseline-only and reviewable on its own.

### Fail-closed gate policy

Ordinary CI runs the deterministic gate, not a timing comparison:

```sh
# Runs exact data, paged, formula, and Sheetwrite-renderer smoke matrices.
# Raw stdout/stderr/JSON/Markdown evidence is retained under
# ../test-results/performance-gates/ and uploaded when CI fails.
bun run bench:verify

# Focused schema, completeness, statistics, CLI, and artifact tests:
bun test test
```

Each family has distinct versioned full and smoke matrix identifiers
(`data-*-v1`, `paged-*-v1`, `formula-*-v1`, and `render-*-v1`). A smoke result
cannot satisfy a full validator. The validators reject missing, duplicate,
unexpected, failed, empty-sample, malformed, stale-protocol, and non-finite
records before applying broad time or resource ceilings. Formula full mode
requires all declared 100K parse, recompute, criteria, lookup, and isolated
memory cells. Comparative renderer evidence requires complete successful cells
for both engines; a competitor crash is structured failure evidence, never a
Sheetwrite win.
Paged full mode also checks the exact chunk/cell evidence left by a complete
cache-bounded traversal; renderer success cells require internally consistent,
finite heap samples below broad safety ceilings.

Relative wall-clock comparisons are a separate controlled operation:

```sh
# Strict by default. Baseline, fresh typed renderer artifact, current harness
# hashes, OS/architecture/CPU/runtime/browser, power mode, and concurrency must
# all match. Every mismatch or regression exits nonzero.
bun run bench:check -- \
  --baseline results/render-baseline.json \
  --fresh results/render-fresh.json \
  --power-mode balanced \
  --concurrency 1

# Explicit local diagnosis only. This prints a conspicuous NON-GATING banner
# and exact fingerprint-field mismatches; CI rejects this flag.
bun run bench:check -- \
  --baseline results/render-baseline.json \
  --fresh results/render-fresh.json \
  --power-mode balanced \
  --concurrency 1 \
  --report-only
```

The numeric comparator consumes every valid post-warmup raw sample, reports
median, p95, and MAD, and never selects a fastest round. A cell regresses only
when its reviewed ratio limit **and** its recorded absolute noise floor are both
exceeded.

The approved baseline is machine-pinned and local; CI intentionally runs only
deterministic smoke matrices and broad safety ceilings, not wall-clock timing
comparisons. `bench:check` fails closed whenever the current harness, runner, or
declared controls differ from that baseline.

Generate reviewed baseline evidence separately from product optimizations:

```sh
# Refuses a dirty tree; runs at least ten full controlled rounds; writes a
# candidate and retains the typed raw-round artifact. It does not touch the
# approved baseline.
bun run bench:baseline:candidate -- \
  --power-mode balanced \
  --concurrency 1

# Promotion is intentionally explicit and must be reviewed as a standalone
# baseline-only diff:
bun run bench:baseline:candidate -- \
  --power-mode balanced \
  --concurrency 1 \
  --write-baseline
```

For deterministic review/testing, `--input path/to/raw-render.json` derives a
candidate from an existing artifact containing at least ten complete rounds.
`--diagnostic` permits a dirty-tree candidate but can never write the approved
baseline. Raw samples, observed MAD, absolute floors, source hashes, commit, and
the full runner fingerprint remain in the candidate for review.

─────────────────────────────────────────────────────────────────────────────

## Results — data layer (fresh generated capture)

Captured by `bun run bench:data` on 2026-07-13 at 22:47 UTC+07, core commit
`844da4e`, Bun 1.3.14, linux/x64, 12th Gen Intel Core i9-12900H (14 cores /
20 logical CPUs). The run uses the seeded dataset and warmed median/p95 protocol
above. Absolute times and ratios are runner-specific.

The command generates both authoritative views from the same in-memory result:

- [`results/data-results.md`](./results/data-results.md) — all tables, including
  both-engine 1K/10K comparisons, 1K→1M scaling, derived ratios, and caveats;
- [`results/data-results.json`](./results/data-results.json) — raw statistics,
  iteration counts, memory bytes, environment, and workload metadata.

Do not copy the generated tables back into this file: one generated report avoids
stale ratios after a rerun. In this capture, Sheetwrite's 1M-row medians were
283 ms ingest, 0.011 ms for a 50×5 window, 23.45 ms sort, 3.38 ms filter, and
1.80 ms aggregate. Exact isolated WASM growth was 207.13 MiB (217 bytes/row)
for the five-column dataset. See the generated report for p95 values,
Handsontable comparisons, asymmetry notes, and smaller sizes.

### Memory — 1M-row paged datasource store (exact, isolated processes)

`bun run --filter '@sheetwrite/bench' bench:paged` spawns a clean process for
each scenario and records both WASM linear-memory growth and live chunk bytes in
`results/paged-results.json`. The five numeric columns isolate cell storage from
string-pool growth.

| scenario | WASM delta | live chunk bytes | chunks | loaded cells | dirty cells |
|---|---:|---:|---:|---:|---:|
| empty datasource | 0.06 MiB | 0.00 MiB | 0 | 0 | 0 |
| +15 virtual padding columns | 0.06 MiB | 0.00 MiB | 0 | 0 | 0 |
| 30-row viewport | 0.31 MiB | 0.26 MiB | 5 | 150 | 0 |
| sequential scroll through 1% | 0.81 MiB | 0.78 MiB | 15 | 50,000 | 0 |
| sequential scroll through 10% | 6.56 MiB | 6.47 MiB | 125 | 500,000 | 0 |
| sequential scroll through 100% | 32.19 MiB | 31.99 MiB | 618 | 2,513,728 | 0 |
| 100 edits in unloaded chunks | 5.25 MiB | 5.18 MiB | 100 | 100 | 100 |

The empty store and virtual padding allocate no chunks. A complete sequential
scan stays at the configured 32 MiB clean-chunk budget; dirty chunks remain
resident until acknowledgement and may exceed that budget by design. Repeated
12-run samples captured on the same runner measured 1M-row construction at
0.072 ms median (1.44 ms p95), first-page load at 0.813 ms (4.53 ms p95), and a
distant-page load at 0.756 ms (2.17 ms p95).

### Notes & caveats

- Handsontable edits are wrapped in `suspendRender`/`resumeRender` to isolate the
  data path; in interactive use it also repaints per edit.
- Handsontable has no native column aggregate; its sum is plain JS over
  `getSourceDataAtCol`.
- Handsontable headless ceiling: one 100k construct ≈ 26 s (renders ~131k
  `<tr>`s); it cannot virtualize without browser layout, hence 100k–1M live in
  the browser bench.
- Sheetwrite memory is the exact WASM `memory.buffer` byteLength delta. Bun's
  `process.heapUsed` conflates the WASM `ArrayBuffer` with the JS heap, so it is
  not used. Handsontable's headless heap is dominated by the non-virtualized
  all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not a
  comparable figure — see the browser bench.

─────────────────────────────────────────────────────────────────────────────

## Results — render (generated, auditable capture)

The authoritative renderer evidence is
[`results/render-results.json`](./results/render-results.json). It contains the
protocol and environment metadata, counterbalanced process order, every raw
sample and operation count, validation observations, memory deltas, launch
attempts, structured failures, and the complete expected/observed matrix.

[`results/render-results.md`](./results/render-results.md) is generated from that
JSON and visibly marks failed or incomplete cells. Never edit it by hand. Run
`bun run bench:render:validate` to prove the JSON schema, matrix completeness,
run IDs, finite samples, summaries, and byte-stable derived Markdown.

Absolute timings are machine-specific characterization data, not statistical
significance claims. Inspect raw samples and validation/failure envelopes before
quoting a result; do not treat an unavailable comparator as a Sheetwrite win.

─────────────────────────────────────────────────────────────────────────────

## Interpretation boundaries

- The generated data report computes every comparison from one capture. Rerun
  it before quoting a ratio; do not mix numbers from different machines or
  commits.
- The headless ingest paths are intentionally asymmetric: Sheetwrite constructs
  its store without rendering, while Handsontable construction includes its
  happy-dom view. Browser render results are the at-scale UI comparison.
- The browser table is a single local capture, not a product-wide or
  cross-device guarantee. Median, p95, dropped frames, viewport, sample count,
  runtime, host, and failure state are part of the result.
- Sheetwrite's observed window-read scaling follows its bulk visible-window
  API. That architectural fact does not imply every operation is constant-time:
  ingest, sort, filter, formulas, structural edits, and memory still scale with
  affected data.
- Google Sheets is not benchmarked here. Hosted service, network, account,
  browser, and product behavior prevent a controlled library comparison, so no
  relative performance claim is made.

─────────────────────────────────────────────────────────────────────────────

## String-pool lifetime controls

`src/string-pool-bench.ts` measures a 1M-row repeated-text ingest, 100k
committed edits, packed window reads, and distinct-value scans. Set
`STRING_POOL_BENCH_MODE=lifetime` for the 1M-distinct-string all-live rebuild
and retained text ownership after clearing and unique edits. That mode records
the cold sweep and seven additional sweeps; its maximum includes the cold
sample. `src/string-pool-read-bench.ts` independently measures 1M distinct-row
ingest and the public cached `getVisibleWindow` path.

Run each sample in a fresh process. To select a built baseline without changing
its checkout, set `STRING_POOL_WASM_ROOT` to its `packages/wasm` directory for
the first harness, and `STRING_POOL_CHECKOUT` to its checkout for the public
read harness. For example, from the repository root:

```sh
bun bench/src/string-pool-bench.ts
STRING_POOL_BENCH_MODE=lifetime bun bench/src/string-pool-bench.ts
bun bench/src/string-pool-read-bench.ts
```

The architecture review capture in
[`results/string-pool-lifetime-results.json`](./results/string-pool-lifetime-results.json)
used exclusive, memory-capped execution pinned to one CPU, three A/A control
rounds, and five alternating ABBA/BAAB rounds. Each process discarded one
warmup before seven samples. Reported comparisons use medians of per-round
medians; the evidence records the raw round reductions and A/A noise bands.
The maximum observed 1M-distinct all-live sweep was **68.62 ms**, not a
cross-device latency guarantee. Post-loop text/index allocation fell from
84,312,948 bytes to 353,024 bytes; this excludes dense cell buffers and does
not claim that committed WebAssembly memory shrinks.

## Files

```
bench/
  package.json            # data, paged, range, formula, render, and check scripts
  src/
    dataset.ts            # seeded deterministic comparison data
    formula-dataset.ts    # deterministic formula topologies
    stats.ts              # warm-up, aggregate timing, median/p95/MAD, ordering
    dom-setup.ts           # happy-dom bootstrap for headless Handsontable
    range-bench.ts         # large-range mutation and query timing
    data-bench.ts          # headless data-layer comparison
    paged-bench.ts         # isolated allocation-lazy storage probes
    formula-bench.ts       # correctness-gated formula timing/memory suite
    handsontable-runtime.ts # validated public runtime boundary
    render-bench.ts        # browser adapters and page orchestration
    render-scenarios.ts    # shared scenarios, checkpoints, aggregate timing
    render-protocol.ts     # result schema, completeness, Markdown generator
    render-driver.ts       # fresh-process Playwright runner and persistence
    render-bench.html      # render benchmark page shell
    check.ts               # regression checks against captured results
    controlled-baseline.ts # reviewed baseline schema and raw-round reduction
    gate-protocol.ts       # exact matrices, resource/stat checks, fingerprints
    generate-baseline.ts   # non-overwriting controlled candidate generation
    render-gate.ts         # exact full/smoke renderer gate policies
    verify.ts              # deterministic CI smoke orchestration and artifacts
  results/
    data-results.{md,json} # generated by bench:data
    formula-results.{md,json} # generated by bench:formula[:smoke]
    paged-results.json     # generated by bench:paged
    render-results.{md,json} # generated by bench:render
```
