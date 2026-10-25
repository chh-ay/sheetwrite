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

## Release

**Package assembly**:
Turning built package outputs into packed tarballs under the release file and manifest policy.
_Avoid_: staging, packing (alone)

**Release artifact**:
A packed package tarball recorded with its version, file list, and digests, which release consumers verify instead of re-packing.
_Avoid_: build output, bundle
