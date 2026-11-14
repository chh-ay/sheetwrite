---
"@sheetwrite/charts": patch
---

Bar charts and scatter charts space the labels on their horizontal value axis by the width of the widest label, so neighbouring labels no longer overlap on wide charts. A horizontal axis with long labels, such as currency amounts in millions, gets fewer ticks; on a chart too small for even that, only every n-th label is drawn, as on category axes. Scatter charts also leave room for their last x-axis label.
