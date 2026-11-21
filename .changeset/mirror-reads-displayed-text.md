---
"@sheetwrite/core": patch
---

A screen reader hears each cell as the grid shows it. The hidden ARIA mirror used to hold the stored value, such as `45351` or `0.125`, where the canvas shows `2024-02-29` or `12.5%`. It now takes the same text as the canvas: the cell's number format from its style or its column, General when it has none, and TRUE or FALSE for a logical. The text comes from the same formatted-text cache, so a paint does no more work.
