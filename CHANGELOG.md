# Changelog

Published releases and user-visible changes to Sheetwrite are recorded here. Package-specific dependency and API histories live beside each package:

- [`@sheetwrite/core`](packages/core/CHANGELOG.md)
- [`@sheetwrite/wasm`](packages/wasm/CHANGELOG.md)
- [`@sheetwrite/formulas`](packages/formulas/CHANGELOG.md)
- [`@sheetwrite/xlsx`](packages/xlsx/CHANGELOG.md)
- [`@sheetwrite/react`](packages/react/CHANGELOG.md)
- [`@sheetwrite/vue`](packages/vue/CHANGELOG.md)
- [`@sheetwrite/svelte`](packages/svelte/CHANGELOG.md)

From 0.5.0, each release has a release post with highlights, measured
performance, and an upgrade checklist:
[sheetwrite.vercel.app/docs/releases](https://sheetwrite.vercel.app/docs/releases/).

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
