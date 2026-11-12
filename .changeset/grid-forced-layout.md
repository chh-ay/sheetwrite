---
"@sheetwrite/core": patch
---

Scrolling with the cell editor open and editing a cell make the browser recalculate styles and layout less often. Each paint writes the screen-reader mirror as its last step, after it has read the scroll position and placed the editor, and the cell editor reads its line height, padding and borders once when it opens instead of after every change of its size. A move that keeps the cell's size only sets the editor's position. The mirror and `aria-activedescendant` show the same rows, cells, notes and selection, in the same task as before. One order changes inside a paint: a `scroll` listener now runs before that paint updates the mirror, so it reads the mirror of the previous paint.
