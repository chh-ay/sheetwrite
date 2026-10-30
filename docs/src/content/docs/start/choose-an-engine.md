---
title: Choose an engine
description: Use the default engine for standard formulas or select the full engine for analysis functions.
added: "0.6.0"
---

## Compare the builds

| Build | Package | Choose it for |
| --- | --- | --- |
| Default | `@sheetwrite/wasm` | Standard math, lookup, text, logic, dates, dynamic arrays, and `LET`; the smallest download. |
| Full | `@sheetwrite/formulas` | Analysis families, `LAMBDA` helpers, `GROUPBY`, and `PIVOTBY`. |

Both builds use the same Rust calculation engine, storage model, and resource
limits. The full build adds statistics, distributions, regression, finance,
regex, database, matrix, and reshaping functions. Check the
[function catalog](/docs/reference/formula-functions/) for the build that
provides each function. Compare download sizes in the
[engine measurements](/docs/performance/formula-engine/).

## Keep the default

```ts compile title="Initialize the default engine"
import { initSheetwrite } from "@sheetwrite/core";

await initSheetwrite();
```

Framework adapters make this call on mount. No explicit engine selection is
needed for the default build.

## Select the full engine

```sh verify title="Install the full engine"
npm install @sheetwrite/core @sheetwrite/formulas
```

```ts compile title="Initialize before creating a grid"
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

Run this before creating any grid or store and before mounting a framework
adapter. Later zero-argument calls keep the selected engine. Importing the
package alone does not select it.

## Selection rules

- An app uses one engine. Once initialization starts, selecting another engine rejects.
- The default build returns `#NAME?` for full-only functions and does not suggest them in formula assist. Their source remains in the document.
- Repeated initialization with the selected engine is safe. Concurrent calls share initialization; a failed initialization can be retried.
- Renderer choice is separate. Both builds work with canvas painting or [worker rendering](/docs/features/worker-rendering/).

## See also

- [Installation](/docs/start/installation/) for explicit WASM sources and framework setup.
- [Calculation engine](/docs/concepts/calculation-engine/) for recalculation, spills, and limits.
- [Analysis formulas](/docs/features/formulas/analysis-formulas/) for full-engine examples.
