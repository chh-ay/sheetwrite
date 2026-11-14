---
"@sheetwrite/core": patch
---

Automatic text on an explicit cell or header fill contrasts with that fill: dark on light fills and light on dark fills, in light and dark themes. Before, it always took the theme's foreground, so a light fill in a dark theme showed near-white text.
