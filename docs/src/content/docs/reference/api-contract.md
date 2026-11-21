---
title: Public API contract
description: How Sheetwrite defines supported entry points, declaration stability, and generated reference pages.
---

Sheetwrite treats each package `exports` map as the public boundary. Before any package publishes, the release check builds the packages, reads the emitted declarations with TypeScript, and rejects undocumented, ambiguous, or accidentally exposed symbols.

## Entry-point classifications

Every exported subpath has one explicit classification:

| Classification | Contract |
| --- | --- |
| `supported` | Public application API. The generated reference describes it. Before 1.0, a minor release can change it; see [Deprecations and removals](#deprecations-and-removals). |
| `internal` | Required runtime plumbing, such as the WASM loader. Published intentionally but not a general extension surface. |
| `testing-only` | Deterministic harnesses for consumers' tests; never production code. |
| `asset` | CSS, Worker, or WASM bytes rather than a TypeScript symbol surface. |

The [generated API index](/docs/api/) lists every package entry point, its classification, and every compiler-visible export. Beside it, the repository keeps a reviewed list of export names and signature digests, which the release check compares with the build.

## What the manifest records

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

Sheetwrite is before 1.0. A minor release, such as 0.7.0, can remove or change a `supported` API without a deprecation period first.

Each removal and each change is listed in the release notes and in the upgrade guide for that release, with its replacement. For 0.7.0, see [Upgrade to 0.7.0](/docs/start/upgrade-to-0-7-0/).

Deprecation periods start at 1.0. From 1.0, a `supported` API is marked `@deprecated` before it is removed.

`internal` entry points, such as the WASM engine, can change in any minor release. The changelog lists each change. The table below lists the removals and changes of the engine bindings.

| Package | Removed or deprecated | Replacement | Release |
| --- | --- | --- | --- |
| `@sheetwrite/wasm` | Removed `CellStore.setBlock` | `CellStore.setBlockPacked` | 0.5.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `CellStore.sortRows`, `styleIdAt`, `hydratePageNumbers`, `hydratePageStringsPacked`, `pinRange` | `sortRowsMulti` with one key; `getCell(...).style`; `setSparseBlock` inside `beginPageLoad`/`commitSources`; no replacement for `pinRange` | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `CellStore.canDirtyCell`, `dirtyRevision`, `markCellCleanRevision`, `spillOwnerCoordinates`, `isSheetAlive` | None (no caller) | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `SourceSnapshot.byteLength` | None (no caller); `RangeSnapshot.byteLength` is unchanged | 0.6.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Changed the `texts: string[]` argument of `CellStore.setSparseBlock` | `textBuf` and `textOffsets`: the UTF-8 bytes of the string entries, as `setBlockPacked` takes them | 0.7.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `PivotFields.names()` and `types()` | `takeNames()` and `takeTypes()` | 0.7.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `CellStore.setColumnNumbers`, `setColumnStrings`, `setColumnStringsPacked` | `setColumnBlockPacked`, `setBlockPacked` or `setSparseBlock` | 0.7.0 |
| `@sheetwrite/wasm` (history kernel) | Removed `DiffKernel.clearPage` and `pageLength` | Consume the returned page arrays; read the length of a page array | 0.7.0 |
| `@sheetwrite/wasm`, `@sheetwrite/formulas` | Removed `formulaToXlsx` and `formulaFromXlsx`; changed `convertXlsxFormulas` to take joined sources | A one-source `convertXlsxFormulas` batch; see [Direct engine calls](/docs/start/upgrade-to-0-7-0/#direct-engine-calls) | 0.7.0 |
