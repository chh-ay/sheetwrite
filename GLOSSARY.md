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

## Release

**Package assembly**:
Turning built package outputs into packed tarballs under the release file and manifest policy.
_Avoid_: staging, packing (alone)

**Release artifact**:
A packed package tarball recorded with its version, file list, and digests, which release consumers verify instead of re-packing.
_Avoid_: build output, bundle
