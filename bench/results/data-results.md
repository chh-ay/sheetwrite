## Headless data-layer results

Bun 1.4.3 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.
Measured engines: Sheetwrite 0.4.0; Handsontable 18.1.2.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.563 (0.616) | 248 (268) | **440.5× faster** |
| 10,000 | 4.87 (6.03) | 2330 (4260) | **478.6× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.006 (0.011) | 0.106 (0.116) | **17.8× faster** |
| 10,000 | 0.007 (0.010) | 0.118 (0.127) | **16.2× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 4.46 (5.83) | 146 (217) | **32.8× faster** |
| 10,000 | 3.57 (4.84) | 535 (1181) | **150.1× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.156 (0.205) | 114 (129) | **728.5× faster** |
| 10,000 | 0.218 (0.251) | 2485 (2572) | **11379.1× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.020 (0.047) | 45.35 (50.76) | **2258.1× faster** |
| 10,000 | 0.036 (0.038) | 908 (1477) | **25557.3× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.095 (0.108) | 91.32 (95.39) | **957.7× faster** |
| 10,000 | 0.385 (0.433) | 2299 (2400) | **5971.9× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.015 (0.024) | 0.085 (0.106) | **5.6× faster** |
| 10,000 | 0.062 (0.066) | 0.848 (1.66) | **13.7× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.172 (0.199) | 0.096 (0.113) | 1.8× slower |
| 10,000 | 1.31 (2.01) | 1.19 (1.24) | 1.1× slower |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.005 (0.005) | 0.088 (0.107) | **17.1× faster** |
| 10,000 | 0.038 (0.039) | 0.770 (0.874) | **20.3× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.563 (0.616) | 0.006 (0.011) | 4.46 (5.83) | 0.156 (0.205) | 0.020 (0.047) | 0.095 (0.108) | 0.015 (0.024) | 0.172 (0.199) | 0.005 (0.005) |
| 10,000 | 4.87 (6.03) | 0.007 (0.010) | 3.57 (4.84) | 0.218 (0.251) | 0.036 (0.038) | 0.385 (0.433) | 0.062 (0.066) | 1.31 (2.01) | 0.038 (0.039) |
| 100,000 | 53.64 (54.48) | 0.008 (0.010) | 4.19 (5.02) | 2.59 (2.83) | 0.398 (0.418) | 4.46 (4.62) | 0.711 (0.726) | 14.70 (17.16) | 0.425 (0.450) |
| 500,000 | 284 (285) | 0.010 (0.011) | 3.84 (4.18) | 12.60 (13.07) | 1.88 (1.92) | 18.93 (19.72) | 3.05 (4.69) | 78.03 (84.63) | 1.90 (1.97) |
| 1,000,000 | 565 (568) | 0.011 (0.012) | 3.94 (4.34) | 26.85 (26.90) | 3.59 (3.72) | 46.86 (47.38) | 5.82 (7.01) | 163 (166) | 4.28 (4.39) |

### Sheetwrite query scenarios — median (p95) ms

Measured on the Sheetwrite engine only: multi-key sorts, value-set filters and an all-numeric ingest exercise its Rust query engine and its columnar ingest, which no other engine here implements. A pick count larger than the sheet saturates at the row count. The 50,000-pick filter is measured at 100,000 rows only: it compares every row with every picked value today, so a larger sheet would need minutes for a single sample.

| rows | Sort by 3 keys (text, number, date) | Sort amount over "Tokyo" city candidates | Filter customer by 10 picked values | Filter customer by 1,000 picked values | Filter customer by 50,000 picked values | Ingest N rows (5 numeric columns) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.125 (0.151) | 0.024 (0.037) | 0.048 (0.059) | 0.510 (0.555) | — | 0.178 (0.181) |
| 10,000 | 2.74 (3.46) | 0.173 (0.180) | 0.369 (0.377) | 0.909 (0.930) | — | 1.74 (1.75) |
| 100,000 | 31.63 (32.03) | 2.15 (2.33) | 3.57 (3.67) | 4.21 (4.28) | 41.41 (42.19) | 15.09 (15.54) |
| 500,000 | 232 (235) | 12.49 (14.48) | 16.20 (16.61) | 16.45 (16.94) | — | 75.26 (75.58) |
| 1,000,000 | 506 (515) | 28.76 (30.57) | 31.09 (33.20) | 36.71 (39.01) | — | 148 (149) |

Fixtures: sort-multi-key — grouped-customer-v2 (97 repeated customers, 8 amount buckets, dates reversed against row order); sort-with-candidates — seeded-dataset-v1; filter-value-set-10 — seeded-dataset-v1; filter-value-set-1000 — seeded-dataset-v1; filter-value-set-50000 — seeded-dataset-v1; ingest-numeric-only — numeric-five-column-v1.

### Memory

Sheetwrite's exact data footprint — the WASM linear-memory growth for a single ingest, sampled in a clean isolated process. The whole columnar store (id/date/customer/city/amount) lives here; JS-side retained state is O(columns + unique styles + active view), never O(cells).

| rows | Sheetwrite data (WASM columnar store) | bytes/row |
|---:|---:|---:|
| 1,000 | 0.38 MiB | 393 B |
| 10,000 | 3.00 MiB | 315 B |
| 100,000 | 27.63 MiB | 290 B |
| 500,000 | 162.25 MiB | 340 B |
| 1,000,000 | 306.75 MiB | 322 B |

**Notes**
- Handsontable edit: edits wrapped in suspendRender/resumeRender to isolate the data path
- Handsontable aggregate: no native aggregate API — summed in plain JS over getSourceDataAtCol
- Handsontable headless ceiling: a single 100k construct measured ~26 s (renders ~131k `<tr>`s); it cannot virtualize without browser layout, so 100k–1M are measured in the browser bench instead.
- Sheetwrite memory is the WASM `memory.buffer` byteLength delta (exact). bun's `process.heapUsed` conflates the WASM ArrayBuffer with the JS heap, so it is not used here.
- Handsontable's representative memory is captured in the browser render benchmark; its headless heap is dominated by the non-virtualized all-rows DOM (≈141 MiB at 1k, ≈1.2 GiB at 10k under happy-dom) and is not comparable.
