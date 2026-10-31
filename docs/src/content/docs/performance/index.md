---
title: "Performance"
description: "Benchmark and package-size evidence for Sheetwrite, one page per area."
---
Every number in this section comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.

Each page shows the results first, then the method and the command that reproduces them.

## Sheetwrite 0.6.0 evidence

The render page includes chart-source tracking; the data-engine page includes incremental pivots. The [release comparison](/docs/performance/release-comparison/) shows fresh 0.5.4 and 0.6.0 measurements, recorded thresholds, every flagged row, and the conditions both sides were captured under. The original committed 0.5.x files remain under `bench/results/releases/0.5.0/` as history only.

- [Render performance](/docs/performance/render/): Scroll, edit, and interaction timings of the live grid, measured against Handsontable.
- [Data engine performance](/docs/performance/data-engine/): Ingest, window read, edit, sort, filter, and aggregate timings of the data store.
- [Core write path](/docs/performance/core-write-path/): Timings of store and document writes at production sizes.
- [Formula engine performance](/docs/performance/formula-engine/): Recalculation timings by dependency shape, and how the two engine builds compare.
- [XLSX codec performance](/docs/performance/xlsx-codec/): Import and export time and peak memory for XLSX files.
- [Delivery size](/docs/performance/delivery-size/): Published package sizes for each Sheetwrite release.
- [Memory](/docs/performance/memory/): Release retained engine memory, free grids and trim their caches, and read which owner holds each byte.
- [Release comparison](/docs/performance/release-comparison/): Each release measured against the previous one on the same machine, suite by suite.
- [Benchmark protocol](/docs/performance/benchmark-protocol/): How the evidence is captured, and how to check a change for a timing regression.
