## Headless data-layer results

Bun 1.4.4 · linux/x64 · seeded dataset (id/date/customer/city/amount) · median (p95) over warmed-up iterations · lower is better.
Measured engines: Sheetwrite 0.5.4; Handsontable 18.1.2.

### Head-to-head (both engines, headless)

Both grids run identical workloads at 1k/10k — the sizes Handsontable completes headlessly (it renders every row without a layout engine).

#### Ingest N rows

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.733 (1.36) | 410 (507) | **558.7× faster** |
| 10,000 | 4.90 (5.15) | 3883 (4160) | **792.5× faster** |

#### Read 50×5 window

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.010 (0.020) | 0.175 (0.203) | **17.3× faster** |
| 10,000 | 0.010 (0.012) | 0.184 (0.250) | **18.1× faster** |

#### 1000 single-cell edits

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 15.45 (27.68) | 172 (251) | **11.1× faster** |
| 10,000 | 7.96 (17.59) | 380 (447) | **47.8× faster** |

#### Sort by amount (numeric)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.196 (0.648) | 171 (196) | **872.1× faster** |
| 10,000 | 0.258 (0.568) | 1442 (1555) | **5586.4× faster** |

#### Filter city contains "Tokyo"

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.111 (0.230) | 68.72 (87.32) | **618.9× faster** |
| 10,000 | 0.125 (0.160) | 582 (617) | **4666.1× faster** |

#### Compose city and customer contains filters

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.163 (0.285) | 149 (202) | **918.2× faster** |
| 10,000 | 0.439 (0.490) | 1206 (1254) | **2747.9× faster** |

#### Distinct low-cardinality city values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.061 (0.069) | 0.120 (0.158) | **2.0× faster** |
| 10,000 | 0.082 (0.129) | 0.940 (1.93) | **11.5× faster** |

#### Distinct high-cardinality customer values

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.210 (1.46) | 0.156 (0.280) | 1.3× slower |
| 10,000 | 1.31 (2.25) | 1.33 (1.75) | **1.0× faster** |

#### Sum amount (aggregate)

| rows | Sheetwrite median (p95) ms | Handsontable median (p95) ms | Sheetwrite |
|---:|---:|---:|:--|
| 1,000 | 0.002 (0.002) | 0.128 (0.183) | **61.3× faster** |
| 10,000 | 0.018 (0.018) | 1.04 (1.40) | **59.3× faster** |

### Sheetwrite data-engine scaling (1k → 1M) — median (p95) ms

Handsontable is omitted at 100k–1M (headless render-all infeasible); the at-scale comparison is the browser render benchmark.

| rows | Ingest N rows | Read 50×5 window | 1000 single-cell edits | Sort by amount (numeric) | Filter city contains "Tokyo" | Compose city and customer contains filters | Distinct low-cardinality city values | Distinct high-cardinality customer values | Sum amount (aggregate) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.733 (1.36) | 0.010 (0.020) | 15.45 (27.68) | 0.196 (0.648) | 0.111 (0.230) | 0.163 (0.285) | 0.061 (0.069) | 0.210 (1.46) | 0.002 (0.002) |
| 10,000 | 4.90 (5.15) | 0.010 (0.012) | 7.96 (17.59) | 0.258 (0.568) | 0.125 (0.160) | 0.439 (0.490) | 0.082 (0.129) | 1.31 (2.25) | 0.018 (0.018) |
| 100,000 | 56.27 (66.84) | 0.012 (0.013) | 5.80 (9.48) | 1.97 (2.14) | 0.398 (0.543) | 3.52 (3.75) | 0.614 (0.682) | 14.07 (14.48) | 0.189 (0.230) |
| 500,000 | 291 (297) | 0.015 (0.017) | 5.63 (5.72) | 10.03 (10.13) | 1.56 (1.61) | 18.29 (18.59) | 2.38 (2.74) | 76.30 (76.46) | 0.884 (0.924) |
| 1,000,000 | 595 (595) | 0.015 (0.017) | 6.75 (24.89) | 22.41 (23.44) | 3.20 (3.25) | 37.21 (37.26) | 5.22 (5.44) | 151 (153) | 1.74 (1.81) |

### Sheetwrite query scenarios — median (p95) ms

Measured on the Sheetwrite engine only: multi-key sorts, value-set filters and an all-numeric ingest exercise its Rust query engine and its columnar ingest, which no other engine here implements. A pick count larger than the sheet saturates at the row count. The 50,000-pick filter is measured at 100,000 rows only: it compares every row with every picked value today, so a larger sheet would need minutes for a single sample.

| rows | Sort by 3 keys (text, number, date) | Sort amount over "Tokyo" city candidates | Filter customer by 10 picked values | Filter customer by 1,000 picked values | Filter customer by 50,000 picked values | Ingest N rows (5 numeric columns) |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.173 (0.315) | 0.123 (0.279) | 0.166 (0.666) | 0.833 (1.37) | — | 0.235 (0.347) |
| 10,000 | 2.64 (3.42) | 0.265 (0.300) | 0.395 (0.427) | 1.03 (1.12) | — | 1.48 (1.53) |
| 100,000 | 35.70 (35.95) | 2.09 (2.29) | 2.88 (3.12) | 3.61 (3.68) | 46.95 (49.06) | 14.43 (25.22) |
| 500,000 | 221 (254) | 12.45 (12.51) | 14.92 (16.04) | 15.97 (16.09) | — | 72.65 (72.95) |
| 1,000,000 | 503 (511) | 27.01 (27.58) | 30.37 (31.74) | 30.74 (30.98) | — | 66.29 (67.28) |

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
