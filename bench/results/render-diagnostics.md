# Auditable render benchmark

Protocol version: **1**  
Run ID: `217f130c-c6c2-43be-a33d-704de8fc56a1`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `ed66b6d7c95c3b652cbc2a89c2d59b5bf693c088` (dirty) |
| Timestamp | 2026-10-02T18:12:14.942Z |
| Runtime | Bun 1.4.2; Node 26.3.0 |
| Browser | 153.0.8010.12 |
| OS / arch | linux 7.2.8-1-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.4.0; Handsontable 18.0.0 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: sheetwrite; round 2: sheetwrite |
| Browser launches | 2 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-formula-dense.paint`](./render-results.json) | median 0.47814 ms; p95 0.53792; MAD 0.06643; 3 samples / 681 ops |
| 1 | 100,000 | [`r1-100000-text-heavy.long-scroll`](./render-results.json) | median 3582.1 ms; p95 3585.2; MAD 3.500; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-wrap-heavy.scroll`](./render-results.json) | median 5504.6 ms; p95 5516.7; MAD 13.500; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-search-many.scroll`](./render-results.json) | median 1585.3 ms; p95 1637.6; MAD 1.500; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-frozen.scroll`](./render-results.json) | median 257.9 ms; p95 267.9; MAD 11.100; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-hscroll-small`](./render-results.json) | median 7.100 ms; p95 7.629; MAD 0.58824; 3 samples / 59 ops |
| 1 | 100,000 | [`r1-100000-cond-format.scroll`](./render-results.json) | median 1726.7 ms; p95 1761.1; MAD 2.300; 3 samples / 3 ops |
| 1 | 100,000 | [`r1-100000-number-format.hscroll`](./render-results.json) | median 0.90079 ms; p95 1.029; MAD 0.11274; 3 samples / 382 ops |
| 1 | 100,000 | [`r1-100000-scroll-fractional.same-window`](./render-results.json) | median 0.59000 ms; p95 0.59474; MAD 0.00462; 3 samples / 510 ops |
| 1 | 100,000 | [`r1-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00013; MAD 0.00000; 3 samples / 2481696 ops |
| 1 | 100,000 | [`r1-100000-window-transfer.scroll.baseline`](./render-results.json) | median 1.527 ms; p95 1.841; MAD 0.02130; 3 samples / 187 ops; validity product-valid; copied/frame 3432.000 B; allocations/frame 1.000; copied/read 3432.000 B; allocations/read 1.000 |
| 1 | 100,000 | [`r1-100000-window-transfer.scroll.reuse-decoded-view-upper-bound`](./render-results.json) | median 0.61790 ms; p95 0.61957; MAD 0.00185; 3 samples / 494 ops; validity pixel-data-invalid; copied/frame 0.000 B; allocations/frame 0.000; copied/read n/a; allocations/read n/a |
| 2 | 100,000 | [`r2-100000-formula-dense.paint`](./render-results.json) | median 0.36765 ms; p95 0.37384; MAD 0.00528; 3 samples / 818 ops |
| 2 | 100,000 | [`r2-100000-text-heavy.long-scroll`](./render-results.json) | median 3643.0 ms; p95 3902.1; MAD 44.600; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-wrap-heavy.scroll`](./render-results.json) | median 5535.6 ms; p95 5702.0; MAD 53.600; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-search-many.scroll`](./render-results.json) | median 1620.6 ms; p95 1655.0; MAD 38.200; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-frozen.scroll`](./render-results.json) | median 231.4 ms; p95 252.0; MAD 22.900; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-hscroll-small`](./render-results.json) | median 5.976 ms; p95 6.072; MAD 0.10588; 3 samples / 59 ops |
| 2 | 100,000 | [`r2-100000-cond-format.scroll`](./render-results.json) | median 1768.3 ms; p95 1834.8; MAD 11.000; 3 samples / 3 ops |
| 2 | 100,000 | [`r2-100000-number-format.hscroll`](./render-results.json) | median 0.87638 ms; p95 1.025; MAD 0.03613; 3 samples / 382 ops |
| 2 | 100,000 | [`r2-100000-scroll-fractional.same-window`](./render-results.json) | median 0.58256 ms; p95 0.58413; MAD 0.00116; 3 samples / 516 ops |
| 2 | 100,000 | [`r2-100000-geometry-unresized.1m`](./render-results.json) | median 0.00012 ms; p95 0.00012; MAD 0.00000; 3 samples / 2529104 ops |
| 2 | 100,000 | [`r2-100000-window-transfer.scroll.baseline`](./render-results.json) | median 1.451 ms; p95 1.893; MAD 0.19947; 3 samples / 201 ops; validity product-valid; copied/frame 3432.000 B; allocations/frame 1.000; copied/read 3432.000 B; allocations/read 1.000 |
| 2 | 100,000 | [`r2-100000-window-transfer.scroll.reuse-decoded-view-upper-bound`](./render-results.json) | median 0.61718 ms; p95 0.62647; MAD 0.01032; 3 samples / 490 ops; validity pixel-data-invalid; copied/frame 0.000 B; allocations/frame 0.000; copied/read n/a; allocations/read n/a |

## Visible-window transfer diagnostic

> The reuse upper bound deliberately paints a prior decoded view. Its pixels/data are invalid and it is not a product-valid rendering result.

Counterbalanced scenario order: round 1: window-transfer.scroll.baseline → window-transfer.scroll.reuse-decoded-view-upper-bound; round 2: window-transfer.scroll.reuse-decoded-view-upper-bound → window-transfer.scroll.baseline

| rows | baseline repetition medians | upper-bound repetition medians | estimated transfer cost | cross-variant spread | maximum within-variant spread | resolution |
|---:|:--|:--|---:|---:|---:|:--|
| 100,000 | 1.527, 1.451 ms | 0.61790, 0.61718 ms | 0.87146 ms | 0.87146 ms | 0.07655 ms | resolved |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render:diagnostic`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
