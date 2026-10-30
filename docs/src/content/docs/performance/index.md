---
title: "Performance"
description: "Benchmark and package-size evidence for Sheetwrite, one page per area."
---
Every number in this section comes from a validated local protocol artifact captured on a clean tree; nothing is published from an unvalidated or protocol-mismatched artifact. Every expected cell carries either a validated timing or its recorded failure - a run that did not complete is shown as a failure, never converted into a timing.

Each page shows the results first, then the method and the command that reproduces them.

- [Render performance](/docs/performance/render/): Scroll, edit, and interaction timings of the live grid, measured against Handsontable.
- [Data engine performance](/docs/performance/data-engine/): Ingest, window read, edit, sort, filter, and aggregate timings of the data store.
- [Core write path](/docs/performance/core-write-path/): Timings of store and document writes at production sizes.
- [Formula engine performance](/docs/performance/formula-engine/): Recalculation timings by dependency shape, and how the two engine builds compare.
- [XLSX codec performance](/docs/performance/xlsx-codec/): Import and export time and peak memory for XLSX files.
- [Delivery size](/docs/performance/delivery-size/): Published package sizes for each Sheetwrite release.
- [Memory](/docs/performance/memory/): Release retained engine memory, and read which owner holds each byte.
- [Benchmark protocol](/docs/performance/benchmark-protocol/): How the evidence is captured, and how to check a change for a timing regression.
