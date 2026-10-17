---
status: proposed
---

# Split the engine's sheet state into cell storage, formula graph and spill state

The Rust engine keeps all per-sheet state in one struct, `SheetData` in `packages/wasm/src/sheet.rs`, with `pub(crate)` fields that serve six purposes: dense cell storage (`kind`, `payload`, `style`), paged storage, calculated values (`derived`), formulas, spill state (`spill_ranges`, `spill_owners`, `spill_blockers`), dirty tracking (`dirty_cells`, `all_dirty`) and conditional-format rules. No module owns the question "what is this cell's value, and may this write replace it?". As measured on the 0.5.0 release candidate, the formula map is reached directly from 10 source files, spill state from 4, and dirty tracking from 5. For 0.6.0 we will split this state into three modules, each with a small interface, and make every other part of the engine use those interfaces instead of the fields:

- **Cell storage** owns how values are kept: source and calculated values, dense and paged layouts, styles, and the dirty state of paged pages. Its interface reads a cell's source or resolved value, reads runs of cells for windows and range readers, writes source values, writes calculated values, and transfers itself for engine memory release. The rule "a source write always replaces a calculated value" lives here and nowhere else.
- **Formula graph** owns formulas, their parsed form, read sets, the dependency index and recalculation dirtiness.
- **Spill state** owns spill ranges, owners and blockers, and admission. It writes spill output only through cell storage.

The engine's WASM interface to TypeScript (94 `CellStore` exports, mirrored by hand in `packages/core/src/store/wasm-contract.ts`) stays as it is in this step. Narrowing it is a separate decision.

## Why

During 0.5.0, each storage decision that was reasonable on its own spread across files nobody owned, and its cost showed up late. PR #103 moved calculated values into a separate overlay, which made spill reads 32% faster, but it added 8 bytes per calculated cell on dense sheets. Its gate measured speed, not retained bytes, so the cost appeared only at the release capture, four layers later. PR #107 then chunked the overlay. The next fix we considered, storing calculated values in the dense source slot again, would have been a third representation change on the same unowned struct. Behind a cell-storage interface, those three changes would each have been a private change to one module, measured against one interface.

## Considered options

- **Keep `SheetData` and fix representations as they come up.** Rejected: every change repeats the cross-file edits and the late surprises described above.
- **Store calculated values in the dense source slot now (0.5.0).** Deferred: it is the right representation for dense sheets, but done before this split it would land on the same unowned struct. It becomes the first change made inside cell storage.
- **Narrow the WASM interface at the same time.** Deferred: it touches TypeScript, the adapters and the published engine packages. Splitting the Rust state first gives that change a stable base.

## Consequences

- Fast paths that today read `kind` and `payload` directly (window projection, range readers, queries) move behind run-based reads on cell storage. Each of these moves needs a speed comparison against 0.5.0 before it lands.
- Memory-release transfer becomes one transfer per module instead of one hand-written transfer of all fields.
- Each layer that changes an engine module runs the formula gate and the engine memory probe before it merges, not only at the release capture (see `CONTRIBUTING.md` → Development checks).
