# @sheetwrite/queries

An optional Rust columnar query engine for host-provided data. Importing this
package does not load its WASM artifact. Call `loadQueryEngine()` to load it.
The package has no dependency on a grid or a formula engine.

## Execute a query

```ts
import { loadQueryEngine } from "@sheetwrite/queries";

const engine = await loadQueryEngine();
const source = engine.parse(
  new TextEncoder().encode('[{"Customer":"Ada","Total":120},{"Customer":"Lin","Total":75}]'),
  {
    format: "json",
    columns: [
      { id: "customer", name: "Customer", type: "text" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
);

const output = engine.execute(source, [
  { kind: "filter", predicate: { kind: "compare", column: "total", op: "gte", value: 100 } },
  { kind: "select", columns: ["total", "customer"] },
]);
```

Rust parses the source and runs every step. TypeScript transfers typed buffers
and small plan metadata. It does not evaluate predicates or turn data into
JavaScript row objects. Output buffers belong to the caller; execution does not
mutate its input buffers.

This headless interface returns data. It does not fetch sources, save a workbook,
or edit worksheet cells. A host must supply bytes or typed batches. Credentials
and network policy remain outside the query engine.

## Sources and column types

`engine.parse(bytes, source, limits?)` accepts UTF-8 CSV or a JSON array of
records. JSON `path` selects a nested record array. CSV options are an ASCII
delimiter byte, `headers` (default `true`), and `emptyIsNull` (default `true`).
With headers, column names select source fields. Without headers, schema order
selects fields. The schema is explicit: parsing does not sample rows or guess types.

CSV follows RFC 4180. Records end at LF, CRLF, or CR, and empty lines are
skipped. A quoted field can contain delimiters, line breaks, and doubled quotes.
Only a delimiter or a record end can follow its closing quote. As in Power Query's
`Csv.Document` with declared columns, a record with fewer fields has null in the
missing columns, and extra fields are ignored.

A `QueryBatch` has `rowCount` and ordered `columns`. Each column has a stable
`id`, a display/source `name`, a validity bitset, and typed payload lanes:

| Type | Payload |
| --- | --- |
| `number` | `Float64Array`; valid values must be finite |
| `logical` | `Uint8Array`; bit i is row i |
| `text` | UTF-8 `bytes` and `Uint32Array` `offsets`, with a final byte-length sentinel |
| `date` | `Int32Array` whole days from 1970-01-01 |
| `dateTime` | `BigInt64Array` microseconds from 1970-01-01T00:00:00, without a time zone |
| `mixed` | Tags, u32 lane indexes, and compact typed payload lanes |

Validity uses low bits first. A zero bit means null or error. Padding bits in the
last byte must be zero. Errors use sorted unique `errorRows`, matching
`errorCodes`, and an interned string `errorPool`. A code index selects an entry in
that pool. An empty error set uses empty typed arrays and an empty pool.

Mixed tags are `0` null, `1` number, `2` logical, `3` text, `4` date, `5` date/time,
and `6` error. An index selects the matching payload lane, or the error pool for
tag `6`. Null and error are never the same tag. Text offsets and every flat row
or lane index are u32. Invalid host buffers produce diagnostics, not traps.

JSON missing fields and explicit null become null. Empty text is not null.
Invalid source conversions become cell errors with code `conversion`. New
non-finite values from aggregates also become cell errors. Raw typed input must
already have finite valid numeric values; invalid typed input is rejected.

## Steps

All column references use stable IDs. Rename changes a name, not an ID. Output
IDs must be unique; names must not collide when ASCII letter case is ignored.

- **Filter:** `compare`, `isNull`, `contains`, `and`, `or`, and `not`. Text matching
  is ordinal and case-sensitive. Null follows M logical rules; only true selects
  a row. A predicate error stops execution.
- **Select:** project and reorder columns without changing their IDs.
- **Rename:** update display names without copying payloads.
- **Change type:** preserve matching values, null, and existing errors. Convert
  text to finite numbers, exact `true`/`false`, dates as `YYYY-MM-DD`, or
  date/times as `YYYY-MM-DDTHH:MM:SS` with an optional fraction of one to nine
  digits (truncated to microseconds). Other layouts, offsets, and zones are
  conversion errors.
  Convert typed values to invariant text, or preserve their type in a mixed
  column. Other conversions produce errors. `onError: "null"` replaces only new
  conversion errors with null; the default explicit policy is `"error"`.
- **Join:** `inner`, `left`, `right`, `full`, `leftSemi`, `rightSemi`, `leftAnti`,
  and `rightAnti`. A step names a `QueryInput` and ordered key pairs. Key column
  types must match. Flat sort-merge indexes retain all duplicate matches. Null
  keys match null keys. Key errors stop execution. Results are sorted by keys,
  then original row IDs. Joined output IDs and names must not collide; choose
  distinct IDs in the source schemas and rename right-side names if needed.
- **Group:** ordered keys plus `countRows`, non-null `count`, `sum`, `average`,
  `min`, and `max`. Numeric aggregates ignore null; an all-null numeric aggregate
  returns null. Counts return zero where applicable. Errors propagate. Groups
  are sorted by keys, with all null keys in one group.
- **Unpivot:** retain the other columns and emit attribute/value columns in input
  row order, then selected column order. Null entries are omitted. Errors and
  mixed value types are preserved.

Mixed keys and mixed `min`/`max` values use this non-null type order: number,
logical, text, date, date/time. Null sorts first in keys and is skipped by
aggregates. Same-type text uses UTF-16 ordinal order; logical false precedes
true. Values of different types are not equal.

Null-key equality follows the Power Query M equality operator, `Table.Join`, and
`Table.Group`. An empty sum follows `List.Sum`. The
[data operations guide](https://www.sheetwrite.dev/docs/features/data/data-operations/#headless-columnar-queries)
links each rule.

## Failures and limits

Fatal failures throw `QueryError`, a `SheetwriteError` with operation `query`.
Its code is `resource-limit` for a limit failure and `invalid-argument`
otherwise. Its `diagnostic` has a stable `code` and optional zero-based `step`,
`row`, and stable `column` identity. Diagnostics do
not include source values or credentials. Cell errors stay in the returned
column's error lanes and do not become exceptions merely because they are read.

Defaults are 1,000,000 rows, 16,000,000 cells, 64 MiB of source bytes, a 256 MiB
conservative output-payload budget, and 256 steps. Both entry points accept
partial `QueryLimits` overrides. Every scalar limit must fit u32. Expanding
steps check row and cell limits before output allocation. The shared payload
budget counts every column, so repeated text cannot bypass it through a wide
join. This is a payload bound, not a cap on allocator capacity or process RSS.
Each text lane also has a 64 MiB byte limit. Plan and packed metadata buffers
are limited to 1 MiB. Predicate and JSON nesting are bounded. There is no
query-result cache.

Node loads the artifact from this package on demand. Browsers load it relative
to the optional bindings. Hosts that own artifact loading can pass
`loadQueryEngine({ wasm: bytesOrModule })` instead. Artifact loading is separate
from source fetching: the engine never fetches a data locator.
