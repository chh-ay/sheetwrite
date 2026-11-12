---
title: Public API contract
description: How Sheetwrite defines supported entry points, declaration stability, and generated reference pages.
---

Sheetwrite treats each package `exports` map as the public boundary. The release gate builds the packages first, analyzes the emitted declarations with TypeScript, and rejects undocumented, ambiguous, or accidentally exposed symbols before any package can publish.

## Entry-point classifications

Every exported subpath has one explicit classification:

| Classification | Contract |
| --- | --- |
| `supported` | Public application API. Semver and the generated reference apply. |
| `internal` | Required runtime plumbing, such as the WASM loader. Published intentionally but not a general extension surface. |
| `testing-only` | Deterministic harnesses for consumers' tests; never production code. |
| `asset` | CSS, Worker, or WASM bytes rather than a TypeScript symbol surface. |

The [generated API index](/docs/api/) lists every package entry point, its classification, and every compiler-visible export. Beside it, the repository keeps only a reviewed list of export names and signature digests, which the gate checks against the build.

## What the gate records

For every TypeScript export, the canonical manifest records:

- symbol name and declaration kind;
- normalized primary signature;
- owning declaration files and source location;
- source JSDoc and JSDoc tags;
- documented interface and class members.

Named re-exports preserve documentation from both the export statement and the declaration target. Framework-generated declarations are analyzed from the bytes that packages actually ship.

## Stability and changes

`bun run api:check` compares the built exports with `scripts/public-api-baseline.json`, the reviewed list of every export by package, entry point and name, each with a short digest of its declaration, one per line. An export the list does not hold, a listed export that is gone, or an export whose signature changed fails the check until `bun run api:baseline` rewrites the list and the change is reviewed with the declaration diff; a changed signature shows as its own changed line. Two changes that add or change different exports edit different lines, so they merge without conflict. The check also catches duplicate declaration merges, missing documentation, and dependency types that leak into the public surface.

The API manifest describes type compatibility. Runtime behavior remains protected by package tests, adapter lifecycle contracts, browser scenarios, canonical tarball checks, and delivery-size budgets.

## Deprecations and removals

`supported` entry points get a deprecation period, marked with `@deprecated`, before removal. `internal` entry points, such as the WASM engine, may change in a minor release with a changelog entry.

| Package | Removed or deprecated | Replacement | Release |
| --- | --- | --- | --- |
| `@sheetwrite/wasm` | Removed `CellStore.setBlock` | `CellStore.setBlockPacked` | 0.5.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `CellStore.sortRows`, `styleIdAt`, `hydratePageNumbers`, `hydratePageStringsPacked`, `pinRange` | `sortRowsMulti` with one key; `getCell(...).style`; `setSparseBlock` inside `beginPageLoad`/`commitSources`; no replacement for `pinRange` | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `CellStore.canDirtyCell`, `dirtyRevision`, `markCellCleanRevision`, `spillOwnerCoordinates`, `isSheetAlive` | None (no caller) | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `SourceSnapshot.byteLength` | None (no caller); `RangeSnapshot.byteLength` is unchanged | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Changed the `texts: string[]` argument of `CellStore.setSparseBlock` | `textBuf` and `textOffsets`: the UTF-8 bytes of the string entries, as `setBlockPacked` takes them | 0.7.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `PivotFields.names()` and `types()` | `takeNames()` and `takeTypes()` | 0.7.0 |
