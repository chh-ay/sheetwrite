---
"@sheetwrite/formulas": minor
"@sheetwrite/core": minor
---

The full engine adds Excel's byte, width and Thai text functions (#279):

- `LENB`, `LEFTB`, `RIGHTB`, `MIDB`, `REPLACEB`, `FINDB` and `SEARCHB` count one byte per character, as Excel does when the default editing language is not a double-byte language.
- `ASC` changes full-width ASCII characters, the ideographic space and katakana to half-width forms, and `DBCS` changes them back. A voiced katakana such as ガ becomes ｶﾞ.
- `BAHTTEXT` writes a number as Thai words in baht and satang.

The default engine does not change.

`DETECTLANGUAGE`, `TRANSLATE` and `PHONETIC` stay unsupported by design: formula evaluation calls no translation service and cells store no furigana.
