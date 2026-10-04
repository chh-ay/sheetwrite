---
"@sheetwrite/formulas": minor
---

Add TEXTBEFORE, TEXTAFTER, TEXTSPLIT, FIXED, DOLLAR, VALUETOTEXT, ARRAYTOTEXT, REGEXTEST, REGEXEXTRACT, and REGEXREPLACE to the full engine. TEXTSPLIT and regex extraction can spill results. Regex uses the regex-lite syntax. Patterns that require lookaround, backreferences, or Unicode classes return #VALUE!. Case-insensitive matching folds ASCII letters only. The default engine does not include regex.
