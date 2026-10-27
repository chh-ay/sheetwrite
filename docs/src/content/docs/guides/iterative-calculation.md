---
title: Iterative calculation
description: "Calculate circular references the way Excel does: turn on iterative calculation, set the maximum iterations and maximum change, and save the setting in snapshots and XLSX files."
---

A circular reference is a formula that reads its own result, directly or
through other formulas. By default, Sheetwrite shows `#CYCLE!` in each cell of
the cycle. Excel has the same default. Turn on iterative calculation to
calculate the cycle again and again until its values settle.

## Turn it on

Iterative calculation is a workbook setting. Commit it as a document operation:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
store.applyTransaction({
  patches: [
    {
      op: "setCalculation",
      calculation: { iterate: true, maxIterations: 100, maxChange: 0.001 },
    },
  ],
});
```

| Field           | Default | Range                    | Meaning                                                             |
| --------------- | ------- | ------------------------ | ------------------------------------------------------------------- |
| `iterate`       | `false` | `true` or `false`        | Calculate circular references. When `false`, they show `#CYCLE!`.    |
| `maxIterations` | `100`   | An integer, 1 to 32,767  | The maximum number of passes over one circular reference.           |
| `maxChange`     | `0.001` | A finite number, 0 or more | Stop when no value in the cycle changes by more than this amount. |

The defaults are the Excel defaults. The operation is undoable and goes through
collaboration like other document operations. A change of the setting
recalculates every formula. Values outside the ranges are rejected.

## How a cycle calculates

Each recalculation starts from the values that the cells show now. A cell that
showed `#CYCLE!` starts at 0. The engine then calculates the cells of the
cycle in row order. Each cell reads the newest values of the other cells. The
engine stops after `maxIterations` passes, or after the first pass in which
no value changes by more than `maxChange`.

- A cycle that does not settle keeps the values of its last pass. It does not
  show an error. Excel does the same.
- Formulas that read a cycle calculate once, after the cycle settles.
- Only numbers have a distance. A text or error value that changes keeps the
  calculation going until `maxIterations`.
- `OFFSET`, `INDIRECT`, and volatile functions such as `NOW` work inside a
  cycle. Runtime references can add members to a cycle as it calculates.
  Downstream readers wait until the cycle settles.

## Examples

A running total. Each recalculation adds `maxIterations` times `B1` to the
value that `A1` shows:

```text partial="formula examples" title="Running total"
A1: =A1+B1
```

Interest on a balance that includes the interest. With `A1` = 1000 and
`B1` = 0.1, `C1` settles at 1000 × 0.1 / (1 − 0.1) ≈ 111.11:

```text partial="formula examples" title="Interest on the balance"
C1: =B1*(A1+C1)
```

Newton's method for the square root of 2. Each pass moves `A1` closer to
1.41421356:

```text partial="formula examples" title="Square root of 2"
A1: =IF(A1=0,1,A1-(A1^2-2)/(2*A1))
```

## Snapshots and XLSX files

The setting is in `snapshot.workbook.calculation`. Workbooks with the default
setting have no `calculation` field, so their snapshots do not change.

XLSX import reads `<calcPr iterate="1" iterateCount="100" iterateDelta="0.001"/>`
in `workbook.xml`. XLSX export writes the same attributes when the setting is
not the default.

## Limits

- A formula that spills into more than one cell keeps `#CYCLE!` in a circular
  reference.
- The engine finds the circular references once per recalculation. Workbooks
  without circular references do no extra work. Memory for one recalculation
  grows with the number of formulas in its cycles, not with the number of
  iterations.
- Volatile functions such as `RAND` inside a cycle draw new values on each
  iteration. Such a cycle can reach `maxIterations` without settling.
