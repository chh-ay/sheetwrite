---
title: AutoFilter
description: "Filter rows from buttons on a header row, as with Excel's AutoFilter: value lists, number, text and date conditions, sorting, undo and XLSX."
---

An AutoFilter puts a filter button on each cell of a range's first row, the header. Its filters hide only the rows below the header. The header row, and any rows above or below the range, always show. A sheet has one AutoFilter, as in Excel.

For example, Item and Qty are in A1:B5, with the Qty values 3, 7, 1 and 12. Turn the AutoFilter on, open the Qty dropdown and choose **Number Filters › Greater Than…** with 5. The rows of 3 and 1 hide. The rows of 7 and 12 and the header row stay.

## Turn it on and off

Select a cell in your data and choose **Data › Filter**, or press **Ctrl+Shift+L** (**Cmd+Shift+L** on a Mac). The filter covers the table the cell is in, the selected range, or the current region around the cell. Its first row becomes the header. The same command turns the AutoFilter off and shows every row again.

From code, `grid.setAutoFilter(range)` turns it on for a range, and `grid.setAutoFilter(null)` turns it off. `grid.actions.toggleAutoFilter()` does what the command does.

```ts prelude="core" partial="requires an initialized grid with an orders table in A1:E200" title="Filter buttons on the orders table"
grid.setAutoFilter({ sheet: "orders", start: { row: 0, col: 0 }, end: { row: 199, col: 4 } });
```

## The dropdown

Click a header button, or press **Alt+Down** on a header cell, to open the column's dropdown:

- **Sort A to Z** and **Sort Z to A** sort the range below its header in place. Number columns say Smallest to Largest, and date columns Oldest to Newest.
- **Clear Filter From "Region"** removes the column's filter.
- **Number Filters**, **Text Filters** or **Date Filters**, by what most of the column's values are, open the Custom AutoFilter form. It takes one or two conditions, joined by **And** or **Or**. A number counts as a date when its cell has a date format.
- **Date Filters** also applies Excel's periods at once: **Tomorrow**, **Today** and **Yesterday**, the next, this and last week, month, quarter and year, **Year to Date**, and **All Dates in the Period** with each quarter and month of any year. Weeks start on Sunday, and "today" is the computer's date when the filter applies.
- A search box narrows the value list and ticks every result. With a search, **OK** keeps only the ticked results. Tick **Add current selection to filter** to add them to the values the filter keeps already: filter Region to North, then search `South` and press **OK** with the box ticked, and both regions show.
- The value list ticks the values to show, with **(Select All)** and **(Blanks)**. Each value shows as its cell shows it, so prices read `$39.50`. As in Excel, it lists only the values of the rows that the other columns' filters keep, up to 10,000 of them.
- Each value shows how many of those rows hold it, "North 12", and so do a date column's years, months and days. **OK** counts the rows the choice keeps as you tick: "OK (12 of 48 rows)". Excel shows neither; a value's count helps to spot a typo that one row holds, and OK's count shows the result before it applies.
- In a date column the list groups the dates by year, month and day; numbers that do not show as dates list as they show. Right Arrow or the arrow before a year or month opens it, and Left Arrow closes it. Ticking a year or month ticks all its dates.

A filtered column's button shows a funnel beside its arrow. While rows are hidden, the row headers show each row's number in the sheet, and while a filter is on, the numbers of the filtered list are blue (the theme's `selectionBorder`), as in Excel. After each filter change the spreadsheet shell's status bar says how many rows the filter keeps, for example "12 of 48 records found", until the next edit.

The dropdown is a dialog named for its column. Tab moves between its parts and stays inside it. In the value list, the arrow keys, Home, End, Page Up and Page Down move, Space ticks or unticks, and Enter applies. Escape closes the dropdown and gives the focus back to the cell.

## Custom conditions

`grid.setColumnFilter(col, filter)` sets a column's filter from code. An AutoFilter column takes a value list or Excel's custom filter of one or two conditions:

```ts prelude="core" partial="requires an initialized grid with an AutoFilter over the orders table" title="A value list and two custom filters"
grid.setColumnFilter(1, { kind: "values", values: ["EMEA", "APAC", null] }); // null keeps blanks
grid.setColumnFilter(4, {
  kind: "custom",
  join: "and",
  conditions: [
    { op: "gte", value: 1000 },
    { op: "lt", value: 5000 },
  ],
});
grid.setColumnFilter(2, {
  kind: "custom",
  join: "or",
  conditions: [
    { op: "beginsWith", value: "Pro" },
    { op: "contains", value: "kit" },
  ],
});
```

| Condition | `op` | Matches |
| --- | --- | --- |
| equals, does not equal | `eq`, `neq` | A number, a date's serial, or text, ignoring case. |
| greater or less than | `gt`, `gte`, `lt`, `lte` | Numbers and dates by value, and text in sort order. |
| begins with, ends with | `beginsWith`, `endsWith` | Text at the start or end of the cell's text. |
| contains, does not contain | `contains`, `notContains` | Text anywhere in the cell's text. |

Conditions match as `COUNTIF` criteria do. In text, `*` and `?` are wildcards, and `~` before one makes it a plain character. "Does not equal" also keeps blank cells.

A date column also takes Excel's dynamic date filters, by their XLSX names: `today`, `thisMonth`, `lastQuarter`, `yearToDate` and the others, or `Q1` to `Q4` and `M1` to `M12` for a quarter or month of any year:

```ts prelude="core" partial="requires an initialized grid with an AutoFilter over the orders table" title="Orders of this month, then of any March"
grid.setColumnFilter(0, { kind: "dynamic", type: "thisMonth" });
grid.setColumnFilter(0, { kind: "dynamic", type: "M3" });
```

As in Excel, edits don't filter again on their own. A row whose value no longer matches stays until you choose **Data › Reapply** or call `grid.reapplyFilter()`. **Data › Clear** (`grid.actions.clearFilters()`) removes every column filter and keeps the buttons. The cell menu's **Filter** submenu filters by the selected cell's value, reapplies the filter, or clears the column's filter.

## Copy, cut and fill in a filtered list

As in Excel, copy, delete, formatting and the fill handle act on the rows the filter shows and skip the rows it hides. Cut is the exception, as in Excel: it moves every row from the first selected row to the last, the hidden ones too, so their data stays with the rows around it.

Paste is the other exception, as in Excel: a pasted block lands on the sheet rows from its first cell down, one row of the block per sheet row, so a row the filter or Hide Rows hides in that range is overwritten too. One copied value pasted over a selection fills only the cells the filter shows.

Beyond Excel, which does both without a word, the grid says so: a cut that covers hidden rows shows "This cut includes 12 hidden rows", its paste "This paste moved 12 hidden rows", and a paste that writes into hidden rows "This paste wrote into 3 hidden rows". **Show them** clears the filters and shows the rows Hide Rows hid in the rows the step covers, as one undo step, so you can check them. The cut and the paste give Excel's result either way.

After a paste that wrote into hidden rows, the context menu's Paste Options row offers **Paste into visible rows only**, and `grid.actions.pasteVisibleRows()` does the same: it pastes the same cells again on the rows the filter and Hide Rows show, skipping the hidden ones, as one undo step. `grid.canPasteVisibleRows()` tells whether the last change is such a paste; any other change ends the offer.

## Undo, collaboration and XLSX files

Turning the AutoFilter on or off is one undo step, and so is each filter change. Collaborators receive each step. The range follows inserted and deleted rows and columns. Deleting the header row removes the AutoFilter. It saves with the sheet's snapshot.

An AutoFilter round-trips through XLSX. Export writes the worksheet's `autoFilter` with each column's conditions, and the `_xlnm._FilterDatabase` name Excel expects. A value list names each number by the text its cell shows, as Excel does. From a grid or store, export also marks the hidden rows, so Excel opens the file filtered. Import reads an Excel AutoFilter back: its range, value lists, custom filters, non-blank filters and dynamic date filters. Color, icon, top 10, above or below average and date group filters have no Sheetwrite equivalent, so import drops them with a warning.

See [Data operations](/docs/features/data/data-operations/) for view sorts, hidden rows and filters without an AutoFilter.
