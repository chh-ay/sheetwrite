---
"@sheetwrite/core": patch
---

The formula bar's fx label and the shell's status text, with its cell mode, reach 4.5:1 contrast in the light and dark themes. They take the muted text colour (`--sheetwrite-widget-muted`, or the foreground mixed 62% into the background) instead of a lowered opacity, so a host colour for the status is no longer faded further.
