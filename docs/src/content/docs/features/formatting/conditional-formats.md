---
title: Conditional formats
description: Style cells from their values with ordered comparison, text, blank and formula rules.
---

A conditional format is an ordered rule on a sheet: when a cell in the rule's range matches the predicate, the rule's `CellStyle` paints over the cell's own style.

```ts prelude="core" partial="requires the initialized grid and score data from Full setup" title="Style scores and late names"
const scores = { sheet: "sheet1", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } };
grid.setConditionalFormats([
  {
    range: scores, when: { kind: "lessThan", value: 50 },
    style: { color: "#b91c1c", bold: true }, stopIfTrue: true,
  },
  { range: scores, when: { kind: "formula", source: "=B1>=90" }, style: { backgroundColor: "#dcfce7" } },
  { range: scores, when: { kind: "equal", value: null }, style: { backgroundColor: "#fef3c7" } },
  {
    range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } },
    when: { kind: "contains", text: "late" }, style: { italic: true },
  },
]);
```

<div class="sw-grid-result" data-caption="Result: 92 has a green #dcfce7 fill; 48 is bold red (#b91c1c); 75 has no rule style; the blank B4 has a yellow #fef3c7 fill. Ben (late) is italic.">

| Ana | 92 |
| --- | ---: |
| <em>Ben (late)</em> | <strong>48</strong> |
| Chen | 75 |
| Dee | |

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Conditional formats"
import {
  createGrid,
  initSheetwrite,
  type ColumnarData,
  type ConditionalFormatRule,
  type Workbook,
} from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

const scores = { sheet: "sheet1", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } };
const rules: ConditionalFormatRule[] = [
  // First rule wins, and a match stops the later rules for that cell.
  {
    range: scores,
    when: { kind: "lessThan", value: 50 },
    style: { color: "#b91c1c", bold: true },
    stopIfTrue: true,
  },
  // Relative references move with each cell of the range: B1, B2, B3, B4.
  { range: scores, when: { kind: "formula", source: "=B1>=90" }, style: { backgroundColor: "#dcfce7" } },
  { range: scores, when: { kind: "equal", value: null }, style: { backgroundColor: "#fef3c7" } },
  {
    range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } },
    when: { kind: "contains", text: "late" },
    style: { italic: true },
  },
];

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Sheet1",
      rowCount: 4,
      columns: [
        { key: "name", header: "Name", width: 160, type: "text" },
        { key: "score", header: "Score", width: 100, type: "number" },
      ],
      conditionalFormats: rules,
    },
  ],
};
const data: ColumnarData = {
  rowCount: 4,
  columns: {
    name: ["Ana", "Ben (late)", "Chen", "Dee"],
    score: [92, 48, 75, null],
  },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });

const view = grid.store.getVisibleWindow("sheet1", { start: 0, end: 4 }, [1]);
console.log(view.styles[view.styleIds[0]!]?.backgroundColor); // "#dcfce7" (92 >= 90)
console.log(view.styles[view.styleIds[1]!]?.color); // "#b91c1c" (48 < 50)
```

The score 92 paints on a green fill, 48 paints in bold red, 75 has no rule style, and the blank score paints on a yellow fill. "Ben (late)" is italic.

</details>

To replace the rules of the active sheet at runtime, call `grid.setConditionalFormats(rules)`. It commits one `setSheetMeta` operation with the new list:

```ts prelude="core" partial="requires surrounding host state" title="Replace the active sheet's rules"
grid.setConditionalFormats([
  {
    range: { sheet: "sheet1", start: { row: 0, col: 1 }, end: { row: 99, col: 1 } },
    when: { kind: "greaterThan", value: 100 },
    style: { backgroundColor: "#dbeafe" },
  },
]);
```

## Rule fields

`ConditionalFormatRule`:

| Field | Type | Effect |
| --- | --- | --- |
| `range` | `Range` | The cells the rule checks. It must be on the sheet that holds the rule and inside the sheet's rows and columns. |
| `when` | `ConditionalFormatPredicate` | The condition. |
| `style` | `CellStyle` | The style that paints when the condition matches. |
| `stopIfTrue` | `boolean` | When the rule matches a cell, later rules are not checked for that cell. |

Rules live in `Sheet.conditionalFormats` (and `SheetSnapshot.conditionalFormats`). A `setSheetMeta` operation with `patch.conditionalFormats` replaces the list.

## Predicates

`ConditionalFormatPredicate`:

| `kind` | Fields | Matches when |
| --- | --- | --- |
| `"greaterThan"` | `value: number` | The cell holds a number greater than `value`. |
| `"lessThan"` | `value: number` | The cell holds a number less than `value`. A blank cell does not match. |
| `"equal"` | `value: number \| string \| null` | The cell holds the same number, or exactly the same text (case-sensitive). `value: null` matches blank cells. |
| `"contains"` | `text: string`, `matchCase?: boolean` | The cell holds text that contains `text`. The match ignores case unless `matchCase` is `true`. An empty `text` matches nothing. |
| `"formula"` | `source: string` | The formula is true for the cell. `source` starts with `=`. |

A formula predicate is anchored at the top-left cell of the rule's range. Relative A1 references move with each target cell; `$`-absolute parts stay fixed. Formula rules are calculated again when the cells they depend on change.

## Order and precedence

Sheetwrite checks rules in array order.

- When more than one rule matches a cell, their styles merge. For a field that two rules both set, the earlier rule wins.
- A matching rule with `stopIfTrue: true` keeps every later rule out of that cell's match set.

For example, if rule 1 sets `{ color: "#111111", bold: true }` and rule 2 sets `{ color: "#222222", italic: true }`, and both match, the cell paints `#111111`, bold and italic. With `stopIfTrue` on rule 1, the cell paints `#111111` and bold only.

## XLSX import and export

Export writes each rule as a native conditional-format record with a differential style (`dxf`). The array position sets the rule priority, and `stopIfTrue` writes `stopIfTrue="1"`.

| Sheetwrite predicate | XLSX rule |
| --- | --- |
| `greaterThan`, `lessThan`, `equal` | `cellIs` with the same operator |
| `equal` with `value: null` | `containsBlanks` |
| `contains` | `containsText` |
| `contains` with `matchCase: true` | `expression`: `ISNUMBER(FIND("text", anchor))` |
| `formula` | `expression` (without the leading `=`) |

Import reads the same rule types back, in priority order. An `expression` rule of the form `ISNUMBER(FIND("text", …))` imports as a case-sensitive `contains`.

Vertical alignment in a differential style maps as described in [Fonts and alignment](/docs/features/formatting/fonts-and-alignment/#vertical-alignment-in-xlsx-and-libreoffice).

## Edge cases and limits

- One sheet holds at most 32 rules (`MAX_CONDITIONAL_FORMAT_RULES`, the size of the renderer's `u32` match mask). Snapshot validation reports more as a `resource-limit` error at `sheets[n].conditionalFormats`.
- One formula predicate holds at most 8,192 characters (`MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH`).
- The store rejects a rule list in which a range is on another sheet or outside the sheet, a formula does not start with `=`, or `stopIfTrue` is not a boolean.
- XLSX import drops these rules, each with a `format-loss` warning: color scales, data bars, icon sets, extended conditional formatting, rules with an invalid priority or differential style, formulas longer than 8,192 characters, formulas with external references, and rules past the 32-rule limit. For color scales, data bars, icon sets and other unsupported rule types, the warning names the rule type. Unrepresentable differential styles do not enter the live model or the renderer.
- A rule that export cannot encode stays in Sheetwrite metadata, with a `format-loss` warning.
- LibreOffice does not write `stopIfTrue`. A file saved by LibreOffice loses it; this is a recorded LibreOffice difference.

## See also

- [Styles and themes](/docs/features/formatting/styles/#cellstyle) for `CellStyle`.
- [XLSX export](/docs/import-export/xlsx-export/#workbook-interchange)
- [Compatibility results](/docs/reference/compatibility-results/) for the checked conditional-format evidence.
- [`ConditionalFormatRule`](/docs/api/core/conditional-format-rule/), [`ConditionalFormatPredicate`](/docs/api/core/conditional-format-predicate/) and [`MAX_CONDITIONAL_FORMAT_RULES`](/docs/api/core/max-conditional-format-rules/) API reference.
