# @sheetwrite/formulas

The full Sheetwrite Rust/WASM engine. This package builds the same store and loader API as `@sheetwrite/wasm`, with the `analysis` feature enabled. The default engine stays unchanged. Install this package only when your app needs the full formula engine.

## Select the engine

```ts
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

Select the engine before you create a grid or store. Engine selection is an app-level choice, not a formula plug-in. You can pass a custom module source as the first argument to `initSheetwrite`.

## Direct loader use

```ts
import { load, CellStore } from "@sheetwrite/formulas";

await load();
const store = new CellStore();
```

The package exports the generated engine API, `load(source?)`, and `isLoaded()`. The browser loader has no Node imports. The Node loader reads the binary next to the package. Concurrent same-source calls share initialization. Conflicting concurrent sources reject. Failed initialization can be retried. After success, a different source warns and does not replace the engine.

`@sheetwrite/formulas/wasm` exports the raw binary for custom asset handling. Normal apps should use zero-argument loading.

## Database and math functions

The full engine includes database functions with header-based fields and criteria tables. Criteria columns use AND. Criteria rows use OR. Text criteria are case-insensitive and support `*`, `?`, and `~`. Criteria cells can contain formulas that return comparison values. Custom formula predicates under headers that are not database fields are not supported.

The full engine also includes more math functions and matrix functions. `MMULT`, `MINVERSE`, and `MUNIT` return spill arrays and use the engine's shape, memory, and work limits. `MDETERM` returns a scalar.

`AGGREGATE` supports reference-form and array-form operations and error-ignore options. The engine has no hidden-row state, so options that ignore hidden rows have no effect.

## Contributors

The Rust source is in `../wasm`. Do not add a second Rust crate here. Keep this package version aligned with `@sheetwrite/wasm` and keep its loader contract the same.

From this directory, build the full engine with:

```sh
bun run build
```

This runs `wasm-pack` against `../wasm` with `--features analysis` and writes this package's `pkg` directory. From the workspace root, use `bun run build:formulas` or `bun run build:packages`.

Package tests use the real built engine. Build the packages first, then run:

```sh
bun test packages/formulas/test
```

### Add a function family

A family is one Rust file that owns a group of functions. Only the full engine contains it: the code is behind the `analysis` Cargo feature, so the default `@sheetwrite/wasm` binary does not change. All paths below are relative to the repository root.

1. Create `packages/wasm/src/eval/analysis/<family>.rs`. It must export a names table:

   ```rust
   pub(crate) const NAMES: &[&str] = &["DAVERAGE", "DCOUNT", "DCOUNTA", "DSUM"];
   ```

   Write each name and alias in ASCII uppercase. Sort the table in byte order (`"F.INV"` comes before `"FISHER"`, and `"DCOUNT"` before `"DCOUNTA"`). Do not use a name that the default engine already has, or a name that another family owns.

2. Register the family in `packages/wasm/src/eval/analysis/mod.rs`. Add `mod <family>;` and one entry in `FAMILIES`:

   ```rust
   Family {
       names: <family>::NAMES,
       reference_cells: &[],
       evaluate: Some(<family>::evaluate),
       evaluate_ast: None,
       array: None,
   },
   ```

   `reference_cells` lists the names whose single-cell arguments are references, like `SUM(A1)`: text and logical values in that cell are ignored instead of converted. Use it for functions that take a list of numbers, such as `SKEW` or `DEVSQ`. Leave it empty for functions whose arguments are single values, such as the distributions.

   These are the only shared lines that you change. Do not edit `calc.rs`, `eval/mod.rs`, `eval/functions.rs`, or `eval/array.rs`. Name lookup, `functionNames()`, formula assist, and dispatch already read `FAMILIES`.

3. Select the hooks. Use `None` for a hook that the family does not need. The types are in `analysis/mod.rs`:

   ```rust
   type ScalarEvaluator = fn(&str, &FuncAccumulator) -> EvalResult;

   type AstEvaluator = fn(
       &CellStore,
       &str,                               // registered name
       &[Ast],                             // arguments, not evaluated
       usize,                              // formula sheet
       &HashSet<AbsCellKey>,               // affected
       &mut HashMap<AbsCellKey, EvalResult>, // memo
       &mut HashSet<AbsCellKey>,           // visiting
       usize,                              // depth
   ) -> EvalResult;

   type MatrixEvaluator = fn(/* same arguments as AstEvaluator */) -> Result<EvalMatrix, FormulaError>;
   type ShapeEvaluator = fn(&CellStore, &str, &[Ast], usize) -> Result<(usize, usize, usize), FormulaError>;
   type BoundEvaluator = fn(&CellStore, &str, &[Ast], usize) -> Result<usize, FormulaError>;

   struct ArrayHooks {
       produces_array: fn(&str, &[Ast]) -> bool,
       shape: ShapeEvaluator,   // (rows, columns, cells), used by matrix_shape
       bound: BoundEvaluator,   // upper bound of cells, used by dynamic_array_bound
       evaluate: MatrixEvaluator,
   }
   ```

   - `evaluate` (scalar): use it when each argument is one value or a range of values. The engine evaluates and coerces the arguments first. Read single values with `require_arity`, `number_arg`, and `bool_arg`, and the numbers of a range with `numeric_entries`, all from `eval/functions.rs`. `analysis/distributions.rs` (single values) and `analysis/descriptive.rs` (ranges and value pairs) are the examples.
   - `evaluate_ast`: use it when a function must see the arguments before coercion, for example a range with its shape, a criteria table, or an argument that the function evaluates only on some paths. Evaluate an argument with `store.eval_ast(argument, sheet, affected, memo, visiting, depth + 1)`.
   - `array`: use it when a function returns a matrix that spills. `produces_array` tells the engine that a call returns an array. `shape` and `bound` must agree with the matrix that `evaluate` returns.

   For a call, the engine tries the array hooks first (when `produces_array` returns true), then `evaluate_ast`, then `evaluate`. Array hooks must use the same shape, byte, work, and spill limits as the built-in arrays in `eval/array.rs` and `eval/matrix.rs`, for example `EvalMatrix::validate_shape`. Do not bypass these limits.

4. Add tests in a `#[cfg(test)] mod tests` block in the family file. Compare results with published reference values and put the source URL in a comment. Include the error cases from the function documentation. Run both feature sets from `packages/wasm`:

   ```sh
   cargo test
   cargo test --features analysis
   ```

5. Add each function to `test/conformance/formula-contract.inventory.json` with `"builds": ["@sheetwrite/formulas"]` and its signature, semantics, dialect, and implementation profiles. Update the function counts in `scripts/formula-contract.test.ts`, then run:

   ```sh
   bun scripts/conformance.ts generate && bunx biome format --write test/conformance/corpus.manifest.json
   bun run docs:generate
   bun test scripts/formula-contract.test.ts
   ```

   The contract test fails if a `NAMES` spelling is not in the inventory, if a family file is not registered in `mod.rs`, or if the full engine reports names that the inventory does not list.

6. Build both engines and confirm that the default `packages/wasm/pkg/sheetwrite_wasm_bg.wasm` did not change size. Add a changeset for `@sheetwrite/formulas`.
