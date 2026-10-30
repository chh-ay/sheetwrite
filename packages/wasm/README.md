# @sheetwrite/wasm

Sheetwrite's default Rust/WASM columnar store and calculation engine. Most consumers receive it transitively through `@sheetwrite/core` or a framework adapter. For analysis functions, use the full engine, [`@sheetwrite/formulas`](https://sheetwrite.vercel.app/docs/features/formulas/analysis-formulas/), which has the same API.

```ts
import { load } from "@sheetwrite/wasm";

await load();
```

The package boundary selects a browser loader with no Node imports or a Node loader that reads the co-located binary. `load(source?)` accepts `BufferSource | URL | string | Request | WebAssembly.Module`, shares concurrent same-source initialization, rejects conflicting concurrent sources, retries after failure, and no-ops after success. `isLoaded()` is the authoritative readiness check.

`@sheetwrite/wasm/wasm` remains the explicit raw-asset escape hatch for unsupported or custom bundlers; ordinary consumers should use zero-argument initialization.

## New in 0.6.0

Both engines, `@sheetwrite/wasm` and `@sheetwrite/formulas`, have these features:

- **Volatile functions.** `RAND`, `RANDBETWEEN`, `TODAY`, `NOW` and the formulas that read them recalculate in every transaction that changes a cell, as in Excel. `TODAY` and `NOW` read the clock once in each recalculation. Workbooks without volatile formulas do no extra work. See [Volatile functions](https://sheetwrite.vercel.app/docs/features/formulas/volatile-functions/).
- **New functions.** `RAND`, `RANDBETWEEN`, `FORMULATEXT`, `ISFORMULA`, `HYPERLINK` and `CELL`. `CELL` supports the info types `address`, `col`, `contents`, `row` and `type`. See the [function reference](https://sheetwrite.vercel.app/docs/reference/formula-functions/).
- **`OFFSET` and `INDIRECT`.** Both return references, which can feed reference-taking functions or spill. Both are volatile. See [OFFSET and INDIRECT](https://sheetwrite.vercel.app/docs/features/formulas/offset-and-indirect/).
- **Reference operators.** A space between two references is the intersection operator: `=SUM(A1:C3 B2:D4)`. A comma inside parentheses that are not a function call is the union operator: `=SUM((A1:A2,C1:C2))`. `=SUM(Jan:Mar!B2)` is a 3-D reference. The new `AREAS` function counts the areas of a reference, and `INDEX` has the optional `area_num` argument. See [Operators](https://sheetwrite.vercel.app/docs/features/formulas/operators/).
- **Iterative calculation.** Opt in to calculate circular references until they settle or reach the iteration limit. The defaults are off, 100 iterations and a maximum change of 0.001. Non-converging cycles keep their last values. Multi-cell spills inside a cycle still return `#CYCLE!`. See [Iterative calculation](https://sheetwrite.vercel.app/docs/features/formulas/iterative-calculation/).

New `CellStore` methods: `setIterativeCalculation`, `setSheetOrder` and `sheetSpanFormulaCells`. Core calls the last two when tabs are added, moved or restored.

See [Choose an engine](https://sheetwrite.vercel.app/docs/start/choose-an-engine/)
for the default and full engine comparison.

## Build

```sh
bun run build
```
