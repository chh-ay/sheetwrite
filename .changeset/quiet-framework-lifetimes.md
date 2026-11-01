---
"@sheetwrite/core": patch
"@sheetwrite/react": patch
"@sheetwrite/vue": patch
"@sheetwrite/svelte": patch
---

Close framework adapter scopes on unmount and replacement. Ignore late initialization and publication failures from retired attachments, while destroying each owned grid to cancel its pending work.
