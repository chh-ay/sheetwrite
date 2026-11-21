---
"@sheetwrite/core": patch
---

A cut that waits for a paste ends when a peer sorts, edits, clears or formats its cells, or adds a note, link or merge there, as it ends after a local edit. Before, only a peer's insert, delete or move of rows or columns ended it, so a later paste could move the cells a peer's sort had put there. As in Excel, a change to the cut cells ends the cut, and Paste then does nothing.
