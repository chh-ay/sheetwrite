# Changelog

Published releases and user-visible changes to Sheetwrite are recorded here. Package-specific dependency and API histories live beside each package:

- [`@sheetwrite/core`](packages/core/CHANGELOG.md)
- [`@sheetwrite/wasm`](packages/wasm/CHANGELOG.md)
- [`@sheetwrite/formulas`](packages/formulas/CHANGELOG.md)
- [`@sheetwrite/xlsx`](packages/xlsx/CHANGELOG.md)
- [`@sheetwrite/charts`](packages/charts/CHANGELOG.md)
- [`@sheetwrite/react`](packages/react/CHANGELOG.md)
- [`@sheetwrite/vue`](packages/vue/CHANGELOG.md)
- [`@sheetwrite/svelte`](packages/svelte/CHANGELOG.md)

From 0.5.0, each release has a release post with highlights, measured
performance, and an upgrade checklist:
[sheetwrite.dev/docs/releases](https://www.sheetwrite.dev/docs/releases/).

## 0.6.1

- Make data-grid value edits, scrolling back to evicted pages, text lookups
  and XLSX expansion rejects faster again; no API changes.
- [Release notes](https://www.sheetwrite.dev/docs/releases/0.6.1/).

## 0.6.0

- Add charts (with the new optional `@sheetwrite/charts`), pivot tables,
  reference operators, `OFFSET` and `INDIRECT`, iterative calculation, and an
  optional Excel-style ribbon.
- Keep XLSX parts Sheetwrite does not model, lower XLSX import memory, and
  speed up formula edits and large undo.
- Remove 10 unused engine `CellStore` methods; volatile functions recalculate
  after each edit.
- All eight packages and the engine crate release as 0.6.0.
- [Release notes](https://www.sheetwrite.dev/docs/releases/0.6.0/).

## 0.5.4

- Remove `sourceMappingURL` comments that pointed to source map files the
  packages do not publish.
- [Release notes](https://sheetwrite.vercel.app/docs/releases/0.5.4/).

## 0.5.3

- Publish readable JavaScript again; 0.5.2 shipped each module on one line.
- The `sheetwrite-wasm` crate version matches `@sheetwrite/wasm` and
  `@sheetwrite/formulas`.
- [Release notes](https://sheetwrite.vercel.app/docs/releases/0.5.3/).

## 0.5.2

- Smaller npm packages, lower CSV import memory, and shortcuts with Shift or Alt
  and a digit or symbol.
- Bun 1.4.4 and Node 26.12.1 for development, CI, and releases, for the Brotli
  decoder fix (CVE-2026-111497).
- [Release notes](https://sheetwrite.vercel.app/docs/releases/0.5.2/).

## 0.5.1

- Typed keyboard shortcuts, busy states and visible errors for built-in
  commands, faster column sums, and redesigned documentation.
- [Release notes](https://sheetwrite.vercel.app/docs/releases/0.5.1/).

## 0.5.0

- Add `@sheetwrite/formulas`, an optional full formula engine. Select it with
  `initSheetwrite(undefined, formulas)`. The default `@sheetwrite/wasm` engine
  stays the smaller download.
- Spill references, array constants, large undo, and conflict recovery without
  a reload.
- [Release notes](https://sheetwrite.vercel.app/docs/releases/0.5.0/).

## 0.3.0 – 0.4.0

See each package's `CHANGELOG.md`, linked above.

## 0.2.0

- Hardened collaboration recovery, persistence queues, paged datasources, snapshots, and spreadsheet interchange resource boundaries.
- Replaced the optional spreadsheet implementation with a bounded OOXML codec and broadened workbook fidelity across LibreOffice, Microsoft Excel, and Google Sheets fixtures.
- Improved wide-page loading, cache eviction, large-dataset performance, and browser rendering behavior.
- Added complete framework, database lifecycle, collaboration, interoperability, and million-row performance showcases.
- Added deterministic performance, delivery-size, cross-browser, package-consumer, and release verification gates.
- Successful `develop` CI runs publish only unpublished package versions from canonical artifacts, then create verified package-specific tags and GitHub Releases.
