---
"@sheetwrite/core": minor
"@sheetwrite/xlsx": minor
---

A typed value that a data validation rule rejects now shows Excel's error alert instead of disappearing without a word. A Stop alert offers Retry and Cancel, a Warning alert Yes, No and Cancel, and an Information alert OK and Cancel, as in Excel. Retry and No return to the entry with its text selected; Yes and OK keep the value; Cancel drops it. The alert shows the rule's title and message, or Excel's default text. A formula is checked by its result. A rule whose alert is off (`policy: "allow"`) stores the value without a word.

`DataValidationRule` gains Excel's Error Alert and Input Message fields: `errorStyle` (`"stop"`, `"warning"` or `"information"`), `errorTitle`, `showInputMessage`, `inputTitle` and `inputMessage`. `helpText` is the error message. The input message shows beside a selected cell of the rule, as in Excel, and screen readers hear it as the cell's description.

XLSX import and export keep every one of these fields. Before, a file's input message and error message were reduced to one text, and titles and the Information style were lost.
