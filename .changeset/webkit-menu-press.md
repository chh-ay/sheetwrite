---
"@sheetwrite/core": patch
---

In Safari, choosing a hidden sheet from the sheet tabs' Unhide menu now unhides it. Safari does not focus a button when you press it, so the press moved focus out of the menu and closed it before the click. The Unhide menu and the sheet options menu now keep focus where it is during a press, and a custom cell editor stays open when you press one of its own buttons.
