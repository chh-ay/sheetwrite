---
"@sheetwrite/core": patch
---

The ribbon, toolbar, sheet tab, context menu, chart and panel rules in the stylesheet now end in a class (or, for a host's `<svg>` icon, in `svg`) instead of an `:is()` list or a bare `:disabled`. Browsers checked those rules against every element they restyled, the cell editor included; now only the elements they can match check them, so opening and committing the cell editor restyles less. Every computed style stays the same.
