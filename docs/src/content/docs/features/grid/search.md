---
title: Search
description: Find matching cells, step through matches, and replace text from code or with Ctrl+F.
---

`grid.search(query, opts?)` scans cells, highlights every match, selects the first match and scrolls it into view, and emits a [`search`](/docs/reference/events/#grid-events) event.

```ts prelude="core" partial="requires an initialized grid with the log cells shown below" title="Find matching cells"
const result = grid.search("error");
console.log(`${result.matches.length} match(es)`); // "2 match(es)"
```

<div class="sw-grid-result" data-selected="B2">

<div class="sw-mini-search" aria-label="Find and replace widget preview">
  <div>
    <span aria-label="Find in sheet">error</span>
    <span>1 of 2</span>
    <span aria-label="Previous match">↑ Previous</span>
    <span aria-label="Next match">↓ Next</span>
    <span aria-label="Close find">✕ Close</span>
  </div>
  <div>
    <span>Replace with</span>
    <span>Replace</span>
    <span>All</span>
  </div>
</div>

| Log | Message | Source | Detail |
| --- | --- | --- | --- |
| Job 1 | <mark>error</mark> | Import | Invalid file |
| Job 2 | OK | Import | Complete |
| Job 3 | OK | Export | Complete |
| Job 4 | OK | Import | Complete |
| Job 5 | OK | Export | Complete |
| Job 6 | Failed | Export | <mark>error</mark> |

<figcaption>Result: B2 is the active match and D7 is also highlighted; values are unchanged. The static controls show the equivalent Ctrl+F view after entering “error”; calling <code>grid.search</code> alone does not open the widget.</figcaption>

</div>

<details>
<summary>Usage example (requires an initialized grid)</summary>

This API excerpt needs an initialized grid. Populate its first seven rows with the log cells above, using plain `"error"` in B2 and D7. The final call clears the search highlights, not the values.

```ts prelude="core" partial="requires surrounding host state" title="Find, step, and clear"
const result = grid.search("error");
console.log(`${result.matches.length} match(es)`);
grid.findNext();    // select the next match and scroll to it
grid.clearSearch(); // remove the highlights when done
```

</details>

If cells B2 and D7 contain "error", the log shows `2 match(es)`. `result.matches` is `[B2, D7]` as zero-based addresses, and `result.active` is `0`.

`findNext()` and `findPrev()` move the active match and select it, as Excel's Find Next does, so typing then edits the found cell. `clearSearch()` clears the highlights. The built-in **Ctrl+F** find widget, gated by `config.find` (on by default), drives this same API.

## Options and result

```ts prelude="core" partial="requires surrounding host state" title="SearchOptions and SearchResult"
interface SearchOptions {
  matchCase?: boolean; // case-sensitive match (default false)
  wholeCell?: boolean; // match the whole cell, not a substring (default false)
  lookIn?: "formulas" | "values"; // search formula text or formula results (default "formulas")
  sheet?: SheetId;     // restrict to one sheet (default: the active sheet)
  columns?: number[];  // restrict to these column indices (default: all)
}

interface SearchResult {
  query: string;
  matches: CellAddress[]; // matching cells, in row-major order
  active: number;         // index of the active match, or -1 when there are none
}
```

| Method | Purpose |
| --- | --- |
| `search(query, opts?)` | Find matching cells; highlights them, emits `search`, returns a `SearchResult`. |
| `findNext()` / `findPrev()` | Step the active match forward / backward, select it and scroll it into view. |
| `clearSearch()` | Drop the current search and clear its highlights. |
| `replaceCurrent(replacement)` / `replaceAll(replacement)` | Replace matches through undoable transactions, in formula text too unless `lookIn` is `"values"`. |

## Wildcards and Look in

As in Excel's Find, the query takes three wildcard characters:

| Character | Matches |
| --- | --- |
| `?` | Any one character: `sm?th` finds "smith" and "smyth". |
| `*` | Any run of characters: `*east` finds "Northeast" and "Southeast". |
| `~` | The next `*`, `?` or `~` as itself: `fy06~?` finds "fy06?". |

Without `wholeCell`, a pattern can match anywhere in the cell's text, as in Excel.

By default a formula cell is searched by its formula text, like Excel's default **Look in: Formulas**. So `grid.search("A1")` finds a cell holding `=A1*2`. Pass `lookIn: "values"` to search formula results instead. Cells without a formula are searched by their value either way.

Replace follows the same rules. It replaces the whole run a wildcard pattern matches, and `*` takes the longest run it can. When looking in formulas, `replaceCurrent` and `replaceAll` rewrite formula text, as Excel's Replace does. A replacement that leaves a formula the engine cannot read leaves that cell unchanged. Reference cells are never rewritten.

## Styles

The find bar needs `@sheetwrite/core/styles/find.css`. `@sheetwrite/core/styles.css` includes every part; see [Stylesheet parts](/docs/features/formatting/styles/#stylesheet-parts).

## Edge cases and limits

- An active search picks up matches that a value edit adds or removes, without scrolling.
- On sheets with formulas or references, an active search rescans after each edit, including edits to off-screen inputs or other sheets. This keeps matches whose computed text changes.
- Numbers are searched by their stored value, such as `1234.5`, not by the text a number format shows.
- `highlightCells(ranges, color?)` highlights arbitrary ranges independently of search. Pass `null` to clear; `color` overrides the theme highlight color. See [Temporary highlights](/docs/features/grid/context-menu/#temporary-highlights).
- Set `config.find: false` to turn off the Ctrl+F widget. The methods still work.

## See also

- [Toolbar and ribbon → Feature flags](/docs/features/grid/toolbar-and-ribbon/#feature-flags)
- [Grid methods](/docs/features/grid/grid-methods/#selection-editing-and-search)
- [Events](/docs/reference/events/)
- Generated [`SearchOptions`](/docs/api/core/search-options/), [`SearchResult`](/docs/api/core/search-result/) and [`ReplaceResult`](/docs/api/core/replace-result/) contracts
