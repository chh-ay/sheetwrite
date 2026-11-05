---
"@sheetwrite/wasm": patch
"@sheetwrite/formulas": patch
---

Engine memory transfer rejects malformed data with an error instead of aborting the engine or panicking later. An array longer than engine memory can hold is an error, not an allocation abort. A range transfer checks its cell kinds, that each string names its own string pool, and that each formula lies inside the range. A store transfer checks that the tab order lists each live sheet once and that sheet lookups, defined names, named ranges, tables and formula read sets name transferred sheets.
