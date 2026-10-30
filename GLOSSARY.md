# Sheetwrite

A framework-agnostic spreadsheet grid: a document of sheets and cells, a calculation engine, and the tooling that ships them as packages.

## Document and view

**View**:
The sort keys, filters, hidden rows, and collapsed row groups of a sheet, which together decide which rows are displayed and in what order.
_Avoid_: view state, display mode

**Data row**:
A row's position in the document, independent of any view.
_Avoid_: source row, model row

**Displayed row**:
A row's position after the view is applied; selection, scrolling, and painting address displayed rows.
_Avoid_: view row, visual row

## Charts

**Chart**:
A sheet-owned definition, keyed by a stable ID, that plots series from cell ranges. It is anchored to a cell, with pixel offsets and size.
_Avoid_: graph, plot (as a noun for the definition)

**Series**:
One plotted set of points. It has values, optional categories and a name, each read from a range or given as text.
_Avoid_: dataset, trace

**Chart view**:
The resolved plain data of one chart (`ChartView`): series values, categories and number formats. The renderer draws only from it.
_Avoid_: chart data, chart state

## Pivot tables

**Pivot definition**:
The document record of one pivot table: its source range or table, anchor cell, row, column and value fields, filters, sort and totals. It is saved, undone and synchronized like other sheet metadata.
_Avoid_: pivot config, pivot spec

**Pivot cache**:
The remembered source-row contributions and group aggregates used to update a pivot table when its source changes.
_Avoid_: pivot state, pivot data

## Errors, aborts and memory

**Failure**:
An expected way for an operation to not complete, such as bad input or a limit that is passed. It rejects or throws a `SheetwriteError` with a `code`. A programmer bug is not a failure, and an abort is not a failure.
_Avoid_: error (alone, for an expected case), exception

**Abort**:
The stop of an operation because its `AbortSignal` fired. The operation rejects with `signal.reason` and leaves no partial state. An abort never shows an error alert.
_Avoid_: cancel failure, aborted error

**Scope**:
One lifetime, such as a grid, a chrome build or one long operation, that owns an `AbortController` and a list of disposers. Ending a scope aborts its work and runs its disposers in reverse order.
_Avoid_: context, session (for a lifetime)

**Disposer**:
A function, added to a scope, that frees one resource: a timer, a listener, an observer, a worker or an object URL.
_Avoid_: cleanup callback, teardown hook

**Owner-scoped cache**:
A cache whose entries live only as long as their owner (a grid or a workbook). It is keyed by the owner in a `WeakMap` or stored on the owner, so destroying the owner frees it.
_Avoid_: global cache, module cache (for an owned cache)

**Trim**:
Dropping the caches of an open grid that can be built again (layout, text measurement, parsed formulas, render caches) while the document data stays. The next use builds again what it needs.
_Avoid_: purge, flush, garbage collect

## Release

**Package assembly**:
Turning built package outputs into packed tarballs under the release file and manifest policy.
_Avoid_: staging, packing (alone)

**Release artifact**:
A packed package tarball recorded with its version, file list, and digests, which release consumers verify instead of re-packing.
_Avoid_: build output, bundle
