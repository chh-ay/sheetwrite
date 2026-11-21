# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: showcase-spreadsheet.spec.ts >> ribbon commands edit the workbook and AutoSum totals the ledger
- Location: test/browser/showcase-spreadsheet.spec.ts:52:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: 'Ribbon' }).getByRole('button', { name: 'Bold', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - link "Sheetwrite home" [ref=e4] [cursor=pointer]:
      - /url: /
      - generic [ref=e8]: Sheetwrite
    - navigation "Site" [ref=e9]:
      - link "Docs" [ref=e10] [cursor=pointer]:
        - /url: /docs/
      - link "Showcases" [ref=e11] [cursor=pointer]:
        - /url: /showcases/
      - link "Releases v0.6.1" [ref=e12] [cursor=pointer]:
        - /url: /docs/releases/
        - text: Releases
        - generic [ref=e13]: v0.6.1
    - generic [ref=e14]:
      - link "GitHub" [ref=e15] [cursor=pointer]:
        - /url: https://github.com/chh-ay/sheetwrite
      - button "Use dark theme" [ref=e16] [cursor=pointer]
  - main [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - paragraph [ref=e22]: Spreadsheet app
        - heading "A spreadsheet app, not just a grid" [level=1] [ref=e23]
        - paragraph [ref=e24]: The composable shell puts an Excel-style ribbon, name box, formula bar and sheet tabs around one grid. Try the ribbon on a sales workbook, then narrow the window.
      - generic "Scenario scope" [ref=e25]:
        - generic [ref=e26]:
          - term [ref=e27]: Sheets
          - definition [ref=e28]: "3"
        - generic [ref=e29]:
          - term [ref=e30]: Orders
          - definition [ref=e31]: "48"
        - generic [ref=e32]:
          - term [ref=e33]: Formulas
          - definition [ref=e34]: "63"
    - generic [ref=e36]:
      - region "Live spreadsheet" [ref=e37]:
        - generic [ref=e38]:
          - generic [ref=e39]: Northwind / 2026 sales.xlsx
          - group "Window width" [ref=e42]:
            - button "Wide" [pressed] [ref=e43] [cursor=pointer]
            - button "Narrow" [ref=e44] [cursor=pointer]
        - generic [ref=e47]:
          - region "Ribbon" [ref=e49]:
            - generic [ref=e50]:
              - tablist "Ribbon tabs" [ref=e51]:
                - tab "File" [selected] [ref=e52] [cursor=pointer]
                - tab "Home" [ref=e53] [cursor=pointer]
                - tab "Insert" [ref=e54] [cursor=pointer]
                - tab "Formulas" [ref=e55] [cursor=pointer]
                - tab "Data" [ref=e56] [cursor=pointer]
                - tab "View" [ref=e57] [cursor=pointer]
              - button "Compact ribbon" [ref=e58] [cursor=pointer]: Compact
              - button "Collapse the ribbon" [expanded] [ref=e59] [cursor=pointer]
            - tabpanel "File" [ref=e60]:
              - group "Options" [ref=e61]:
                - button "Keyboard Shortcuts" [ref=e63] [cursor=pointer]
                - generic [aria-hidden] [ref=e66]: Options
          - generic [ref=e67]:
            - textbox "Cell reference" [ref=e68]: B2
            - generic [aria-hidden] [ref=e69]: fx
            - textbox "Formula bar" [ref=e70]: North
          - grid "Spreadsheet grid" [active] [ref=e71]:
            - rowgroup [ref=e75]:
              - row [ref=e76]:
                - columnheader "A" [ref=e77]
                - columnheader "B" [ref=e78]
                - columnheader "C" [ref=e79]
                - columnheader "D" [ref=e80]
                - columnheader "E" [ref=e81]
                - columnheader "F" [ref=e82]
                - columnheader "G" [ref=e83]
                - columnheader "H" [ref=e84]
                - columnheader "I" [ref=e85]
                - columnheader "J" [ref=e86]
                - columnheader "K" [ref=e87]
                - columnheader "L" [ref=e88]
                - columnheader "M" [ref=e89]
                - columnheader "N" [ref=e90]
                - columnheader "O" [ref=e91]
                - columnheader "P" [ref=e92]
              - row [ref=e93]:
                - gridcell "Date" [ref=e94]
                - gridcell "Region" [ref=e95]
                - gridcell "Rep" [ref=e96]
                - gridcell "Product" [ref=e97]
                - gridcell "Units" [ref=e98]
                - gridcell "Unit price" [ref=e99]
                - gridcell "Revenue" [ref=e100]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e101]:
                - gridcell "46024" [ref=e102]
                - gridcell "North" [selected] [ref=e103]
                - gridcell "Avery" [ref=e104]
                - gridcell "Desk lamp" [ref=e105]
                - gridcell "2" [ref=e106]
                - gridcell "39.5" [ref=e107]
                - gridcell "79" [ref=e108]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e109]:
                - gridcell "46026" [ref=e110]
                - gridcell "South" [ref=e111]
                - gridcell "Finley" [ref=e112]
                - gridcell "Webcam" [ref=e113]
                - gridcell "9" [ref=e114]
                - gridcell "79.99" [ref=e115]
                - gridcell "719.91" [ref=e116]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e117]:
                - gridcell "46028" [ref=e118]
                - gridcell "East" [ref=e119]
                - gridcell "Emery" [ref=e120]
                - gridcell "Monitor arm" [ref=e121]
                - gridcell "16" [ref=e122]
                - gridcell "89" [ref=e123]
                - gridcell "1424" [ref=e124]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e125]:
                - gridcell "46030" [ref=e126]
                - gridcell "West" [ref=e127]
                - gridcell "Devon" [ref=e128]
                - gridcell "Headset" [ref=e129]
                - gridcell "23" [ref=e130]
                - gridcell "112" [ref=e131]
                - gridcell "2576" [ref=e132]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e133]:
                - gridcell "46032" [ref=e134]
                - gridcell "North" [ref=e135]
                - gridcell "Casey" [ref=e136]
                - gridcell "Keyboard" [ref=e137]
                - gridcell "7" [ref=e138]
                - gridcell "64.25" [ref=e139]
                - gridcell "449.75" [ref=e140]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e141]:
                - gridcell "46034" [ref=e142]
                - gridcell "South" [ref=e143]
                - gridcell "Blake" [ref=e144]
                - gridcell "Desk lamp" [ref=e145]
                - gridcell "14" [ref=e146]
                - gridcell "39.5" [ref=e147]
                - gridcell "553" [ref=e148]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e149]:
                - gridcell "46036" [ref=e150]
                - gridcell "East" [ref=e151]
                - gridcell "Avery" [ref=e152]
                - gridcell "Webcam" [ref=e153]
                - gridcell "21" [ref=e154]
                - gridcell "79.99" [ref=e155]
                - gridcell "1679.79" [ref=e156]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e157]:
                - gridcell "46038" [ref=e158]
                - gridcell "West" [ref=e159]
                - gridcell "Finley" [ref=e160]
                - gridcell "Monitor arm" [ref=e161]
                - gridcell "5" [ref=e162]
                - gridcell "89" [ref=e163]
                - gridcell "445" [ref=e164]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e165]:
                - gridcell "46040" [ref=e166]
                - gridcell "North" [ref=e167]
                - gridcell "Emery" [ref=e168]
                - gridcell "Headset" [ref=e169]
                - gridcell "12" [ref=e170]
                - gridcell "112" [ref=e171]
                - gridcell "1344" [ref=e172]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e173]:
                - gridcell "46042" [ref=e174]
                - gridcell "South" [ref=e175]
                - gridcell "Devon" [ref=e176]
                - gridcell "Keyboard" [ref=e177]
                - gridcell "19" [ref=e178]
                - gridcell "64.25" [ref=e179]
                - gridcell "1220.75" [ref=e180]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e181]:
                - gridcell "46044" [ref=e182]
                - gridcell "East" [ref=e183]
                - gridcell "Casey" [ref=e184]
                - gridcell "Desk lamp" [ref=e185]
                - gridcell "3" [ref=e186]
                - gridcell "39.5" [ref=e187]
                - gridcell "118.5" [ref=e188]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e189]:
                - gridcell "46046" [ref=e190]
                - gridcell "West" [ref=e191]
                - gridcell "Blake" [ref=e192]
                - gridcell "Webcam" [ref=e193]
                - gridcell "10" [ref=e194]
                - gridcell "79.99" [ref=e195]
                - gridcell "799.9" [ref=e196]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e197]:
                - gridcell "46048" [ref=e198]
                - gridcell "North" [ref=e199]
                - gridcell "Avery" [ref=e200]
                - gridcell "Monitor arm" [ref=e201]
                - gridcell "17" [ref=e202]
                - gridcell "89" [ref=e203]
                - gridcell "1513" [ref=e204]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e205]:
                - gridcell "46050" [ref=e206]
                - gridcell "South" [ref=e207]
                - gridcell "Finley" [ref=e208]
                - gridcell "Headset" [ref=e209]
                - gridcell "24" [ref=e210]
                - gridcell "112" [ref=e211]
                - gridcell "2688" [ref=e212]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e213]:
                - gridcell "46052" [ref=e214]
                - gridcell "East" [ref=e215]
                - gridcell "Emery" [ref=e216]
                - gridcell "Keyboard" [ref=e217]
                - gridcell "8" [ref=e218]
                - gridcell "64.25" [ref=e219]
                - gridcell "514" [ref=e220]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e221]:
                - gridcell "46054" [ref=e222]
                - gridcell "West" [ref=e223]
                - gridcell "Devon" [ref=e224]
                - gridcell "Desk lamp" [ref=e225]
                - gridcell "15" [ref=e226]
                - gridcell "39.5" [ref=e227]
                - gridcell "592.5" [ref=e228]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e229]:
                - gridcell "46056" [ref=e230]
                - gridcell "North" [ref=e231]
                - gridcell "Casey" [ref=e232]
                - gridcell "Webcam" [ref=e233]
                - gridcell "22" [ref=e234]
                - gridcell "79.99" [ref=e235]
                - gridcell "1759.78" [ref=e236]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e237]:
                - gridcell "46058" [ref=e238]
                - gridcell "South" [ref=e239]
                - gridcell "Blake" [ref=e240]
                - gridcell "Monitor arm" [ref=e241]
                - gridcell "6" [ref=e242]
                - gridcell "89" [ref=e243]
                - gridcell "534" [ref=e244]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e245]:
                - gridcell "46060" [ref=e246]
                - gridcell "East" [ref=e247]
                - gridcell "Avery" [ref=e248]
                - gridcell "Headset" [ref=e249]
                - gridcell "13" [ref=e250]
                - gridcell "112" [ref=e251]
                - gridcell "1456" [ref=e252]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e253]:
                - gridcell "46062" [ref=e254]
                - gridcell "West" [ref=e255]
                - gridcell "Finley" [ref=e256]
                - gridcell "Keyboard" [ref=e257]
                - gridcell "20" [ref=e258]
                - gridcell "64.25" [ref=e259]
                - gridcell "1285" [ref=e260]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
              - row [ref=e261]:
                - gridcell "46064" [ref=e262]
                - gridcell "North" [ref=e263]
                - gridcell "Emery" [ref=e264]
                - gridcell "Desk lamp" [ref=e265]
                - gridcell "4" [ref=e266]
                - gridcell "39.5" [ref=e267]
                - gridcell "158" [ref=e268]
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
                - gridcell
          - generic [ref=e269]:
            - group "Sheets controls" [ref=e270]:
              - generic [ref=e271]:
                - tablist "Sheets" [ref=e272]:
                  - tab "Sales sheet" [selected] [ref=e273] [cursor=pointer]: Sales
                  - tab "Summary sheet" [ref=e274] [cursor=pointer]: Summary
                  - tab "Targets sheet" [ref=e275] [cursor=pointer]: Targets
                - button "Options for Sales sheet" [ref=e277] [cursor=pointer]
              - button "Add sheet" [ref=e278] [cursor=pointer]
            - status [ref=e279]: Ready
      - complementary "Controls" [ref=e280]:
        - generic [ref=e281]:
          - heading "Try it" [level=2] [ref=e282]
          - list [ref=e284]:
            - listitem [ref=e285]:
              - strong [ref=e286]: Total a column
              - generic [ref=e287]: Select Sales!G2:G49, then Home › Editing › AutoSum.
              - generic [ref=e288]: A SUM lands under the last row.
            - listitem [ref=e291]:
              - strong [ref=e292]: Format a region
              - generic [ref=e293]: Pick a region cell, then Fill Color, Borders or Merge & Center.
              - generic [ref=e294]: The format is stored on the cells and survives XLSX export.
            - listitem [ref=e297]:
              - strong [ref=e298]: Change a price
              - generic [ref=e299]: Edit a unit price on the Sales sheet.
              - generic [ref=e300]: Summary recalculates across sheets.
            - listitem [ref=e303]:
              - strong [ref=e304]: Read a note
              - generic [ref=e305]: Point at the amber corner on Sales!G3 to read it. Select the cell and press Shift+F2 to edit.
              - generic [ref=e306]: The note opens beside the cell. Clear the note to delete it.
            - listitem [ref=e309]:
              - strong [ref=e310]: Use the right-click menu
              - generic [ref=e311]: Right-click a cell, then Insert › Row above.
              - generic [ref=e312]: Undo removes the new row.
            - listitem [ref=e315]:
              - strong [ref=e316]: Narrow the window
              - generic [ref=e317]: Switch between a wide and a narrow window.
              - button "Fold the ribbon" [ref=e318] [cursor=pointer]
              - generic [ref=e321]: The ribbon turns compact, one row like Excel's simplified ribbon, and groups fold into dropdowns.
        - generic [ref=e324]:
          - heading "Keyboard" [level=2] [ref=e325]
          - paragraph [ref=e326]: Double-click a tab to hide or show the panel.
          - generic [ref=e328]:
            - generic [ref=e329]:
              - term [ref=e330]:
                - generic [ref=e331]: Tab
              - definition [ref=e332]: Reach the ribbon tabs
            - generic [ref=e333]:
              - term [ref=e334]:
                - generic [ref=e335]: ←
                - generic [ref=e336]: →
              - definition [ref=e337]: Move between tabs
            - generic [ref=e338]:
              - term [ref=e339]:
                - generic [ref=e340]: Esc
              - definition [ref=e341]: Return to the grid
    - region [ref=e342]:
      - heading "One command model" [level=2] [ref=e343]
      - paragraph [ref=e345]:
        - text: Every ribbon command calls
        - code [ref=e346]: grid.actions
        - text: ", so your own toolbar can call the same methods. The Targets sheet is a saved query that Data › Refresh All reloads; the"
        - link "queries showcase" [ref=e347] [cursor=pointer]:
          - /url: /showcases/queries/
        - text: shows saved queries in depth.
      - figure [ref=e348]:
        - generic [ref=e349]:
          - 'img "One command model: the ribbon and your toolbar call the same grid actions A ribbon command and a button in your own toolbar both call grid.actions, which applies the command to the grid. Data › Refresh All reloads the saved query behind the Targets sheet." [ref=e351]':
            - generic [ref=e352]:
              - generic [ref=e355]: Ribbon command
              - generic [ref=e356]: Home › Editing
              - generic [ref=e357]: › AutoSum
            - generic [ref=e358]:
              - generic [ref=e361]: Your toolbar
              - generic [ref=e362]: Your own
              - generic [ref=e363]: buttons
            - generic [ref=e364]:
              - generic [ref=e367]: grid.actions
              - generic [ref=e368]: The same methods
            - generic [ref=e369]:
              - generic [ref=e372]: Grid
              - generic [ref=e373]: Applies the command
          - paragraph [ref=e377]: The Targets sheet is a saved query that Data › Refresh All reloads.
    - generic [ref=e378]:
      - region [ref=e379]:
        - heading "How it is built" [level=2] [ref=e381]
        - figure [ref=e386]:
          - code [ref=e388]:
            - generic [ref=e389]: "// The full app: ribbon, name box, formula bar, tabs"
            - generic [ref=e392]:
              - text: "createSpreadsheetShell(host, {"
              - link "ribbon" [ref=e394] [cursor=pointer]:
                - /url: /docs/api/core/grid-config/#grid-config-ribbon
              - text: ": true, grid });"
            - generic [ref=e397]: // The same ribbon on a grid of its own
            - generic [ref=e400]:
              - text: "createGrid(host, { workbook,"
              - link "config" [ref=e402] [cursor=pointer]:
                - /url: /docs/api/core/grid-options/#grid-options-config
              - text: ": {"
              - link "ribbon" [ref=e404] [cursor=pointer]:
                - /url: /docs/api/core/grid-config/#grid-config-ribbon
              - text: ": true } });"
          - button "Copy to clipboard" [ref=e406] [cursor=pointer]
      - complementary "What this code uses" [ref=e408]:
        - heading "APIs in this example" [level=3] [ref=e409]
        - list [ref=e410]:
          - listitem [ref=e411]:
            - link [ref=e412] [cursor=pointer]:
              - /url: /docs/api/core-shell/create-spreadsheet-shell/
              - code [ref=e413]: createSpreadsheetShell
            - paragraph [ref=e414]:
              - text: Mount a complete spreadsheet shell into
              - code [ref=e415]: host
              - text: ": toolbar row, formula row (name box + formula bar), the grid, and a bottom row with sheet tabs and a selection status."
          - listitem [ref=e416]:
            - link [ref=e417] [cursor=pointer]:
              - /url: /docs/api/core/create-grid/
              - code [ref=e418]: createGrid
            - paragraph [ref=e419]: Creates and mounts an imperative Grid in the supplied host element.
        - link "Build it step by step" [ref=e420] [cursor=pointer]:
          - /url: /docs/tutorials/spreadsheet-app-with-ribbon/
```

# Test source

```ts
  1   | import type { Page } from "@playwright/test";
  2   | 
  3   | import type { Grid } from "../../packages/core/src/types.js";
  4   | import { expect, fitsViewport, nextFrames, test } from "./fixtures.js";
  5   | 
  6   | declare global {
  7   |   interface Window {
  8   |     __sheetwriteSpreadsheetGrid?: Grid;
  9   |     /** Class names of shell elements Chromium reported as shifted. */
  10  |     __sheetwriteShellShifts?: string[];
  11  |   }
  12  | }
  13  | 
  14  | async function open(page: Page, width = 1_600, height = 900): Promise<void> {
  15  |   await page.setViewportSize({ width, height });
  16  |   await page.goto("/showcases/spreadsheet/");
  17  |   await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  18  | }
  19  | 
  20  | async function select(page: Page, reference: string): Promise<void> {
  21  |   const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  22  |   await nameBox.fill(reference);
  23  |   await nameBox.press("Enter");
  24  | }
  25  | 
  26  | function cell(page: Page, sheet: string, row: number, col: number) {
  27  |   return page.evaluate(
  28  |     ([sheetId, r, c]) => {
  29  |       const stored = window.__sheetwriteSpreadsheetGrid?.store.getCell({
  30  |         sheet: sheetId,
  31  |         row: r,
  32  |         col: c,
  33  |       });
  34  |       return { resolved: stored?.resolved ?? null, bold: stored?.style.bold === true };
  35  |     },
  36  |     [sheet, row, col] as const,
  37  |   );
  38  | }
  39  | 
  40  | test("File › Keyboard Shortcuts opens the shortcuts panel", async ({ page }) => {
  41  |   await open(page);
  42  |   await page.getByRole("tab", { name: "File", exact: true }).click();
  43  |   await page.getByRole("button", { name: "Keyboard Shortcuts" }).click();
  44  |   const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  45  |   await expect(panel).toBeVisible();
  46  |   await panel
  47  |     .getByRole("searchbox", { name: "Search commands or press keys" })
  48  |     .fill("paste special");
  49  |   await expect(panel).toContainText("Paste Special");
  50  | });
  51  | 
  52  | test("ribbon commands edit the workbook and AutoSum totals the ledger", async ({ page }) => {
  53  |   await open(page);
  54  |   const ribbon = page.getByRole("region", { name: "Ribbon" });
  55  |   await select(page, "B2");
  56  |   const bold = ribbon.getByRole("button", { name: "Bold", exact: true });
> 57  |   await bold.click();
      |              ^ Error: locator.click: Test timeout of 30000ms exceeded.
  58  |   await expect(bold).toHaveAttribute("aria-pressed", "true");
  59  |   expect((await cell(page, "sales", 1, 1)).bold).toBe(true);
  60  | 
  61  |   await select(page, "G50");
  62  |   await ribbon.getByRole("button", { name: "AutoSum" }).click();
  63  |   await expect(page.getByRole("textbox", { name: "Formula bar" })).toHaveValue("=SUM(G2:G49)");
  64  |   const total = await cell(page, "summary", 5, 2);
  65  |   expect((await cell(page, "sales", 49, 6)).resolved).toBeCloseTo(Number(total.resolved), 6);
  66  | });
  67  | 
  68  | test("the cell editor lists functions, picks one with the keyboard, and guides the arguments", async ({
  69  |   page,
  70  | }) => {
  71  |   await open(page);
  72  |   await select(page, "G3");
  73  |   await page.keyboard.type("=ROU");
  74  |   const editor = page.locator("textarea.sheetwrite-editor");
  75  |   const list = page.getByRole("listbox", { name: "Formula AutoComplete" });
  76  |   await expect(list.getByRole("option", { name: "ROUND", exact: true })).toBeVisible();
  77  |   await expect(editor).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");
  78  |   await page.keyboard.press("Enter");
  79  |   await expect(editor).toHaveValue("=ROUND(");
  80  |   await expect(list).toHaveCount(0);
  81  | 
  82  |   const guide = page.getByRole("status").filter({ hasText: "ROUND(" });
  83  |   await expect(guide.locator("strong")).toHaveText("number");
  84  |   await page.keyboard.type("A1:A3, ");
  85  |   await expect(guide.locator("strong")).toHaveText("num_digits");
  86  |   await page.keyboard.type("2");
  87  |   await page.keyboard.press("Enter");
  88  |   await expect(editor).toHaveCount(0);
  89  | });
  90  | 
  91  | test("automatic ribbon layout follows host width until the user chooses a mode", async ({
  92  |   page,
  93  | }) => {
  94  |   // Wide enough that the showcase host is above the default compact width.
  95  |   await open(page);
  96  |   const ribbon = page.getByRole("region", { name: "Ribbon" });
  97  |   await expect(ribbon).toHaveAttribute("data-mode", "full");
  98  |   const editing = page.locator('.sheetwrite-ribbon-group[aria-label="Editing"]');
  99  |   await expect(editing).toHaveAttribute("data-size", "large");
  100 |   const panel = ribbon.getByRole("tabpanel");
  101 |   const fullHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
  102 | 
  103 |   await page.getByRole("button", { name: "Narrow" }).click();
  104 |   await expect(ribbon).toHaveAttribute("data-mode", "compact");
  105 |   expect(await panel.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
  106 |     fullHeight,
  107 |   );
  108 |   // At this width groups fold into dropdowns, and all of them stay on one row.
  109 |   await expect(editing).toHaveAttribute("data-size", "collapsed");
  110 |   const rows = await panel.locator(".sheetwrite-ribbon-group").evaluateAll((elements) =>
  111 |     elements.map((element) => {
  112 |       const box = element.getBoundingClientRect();
  113 |       return Math.round(box.top + box.height / 2);
  114 |     }),
  115 |   );
  116 |   expect(rows.length).toBeGreaterThan(0);
  117 |   expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
  118 |   await editing.getByRole("button", { name: /Editing/ }).click();
  119 |   await expect(page.getByRole("button", { name: "AutoSum" })).toBeVisible();
  120 | 
  121 |   await page.getByRole("button", { name: "Wide" }).click();
  122 |   await expect(ribbon).toHaveAttribute("data-mode", "full");
  123 |   await expect(editing).toHaveAttribute("data-size", "large");
  124 |   // A chosen mode sticks through later width changes.
  125 |   await ribbon.getByRole("button", { name: "Compact ribbon" }).click();
  126 |   await expect(ribbon).toHaveAttribute("data-mode", "compact");
  127 |   await page.getByRole("button", { name: "Narrow" }).click();
  128 |   await page.getByRole("button", { name: "Wide" }).click();
  129 |   await expect(ribbon).toHaveAttribute("data-mode", "compact");
  130 | });
  131 | 
  132 | test("on a phone the ribbon arrives at its compact height and follows the site theme", async ({
  133 |   page,
  134 | }) => {
  135 |   // Chromium reports every shift with the elements that moved.
  136 |   await page.addInitScript(() => {
  137 |     interface LayoutShift extends PerformanceEntry {
  138 |       readonly sources: readonly { readonly node: Node | null }[];
  139 |     }
  140 |     const moved: string[] = [];
  141 |     window.__sheetwriteShellShifts = moved;
  142 |     new PerformanceObserver((list) => {
  143 |       for (const entry of list.getEntries() as LayoutShift[]) {
  144 |         for (const { node } of entry.sources) {
  145 |           const element = node instanceof Element ? node : (node?.parentElement ?? null);
  146 |           if (element?.closest(".sheetwrite-shell")) moved.push(element.className);
  147 |         }
  148 |       }
  149 |     }).observe({ type: "layout-shift", buffered: true });
  150 |   });
  151 |   await open(page, 390, 844);
  152 |   await expect(page.getByRole("region", { name: "Ribbon" })).toHaveAttribute(
  153 |     "data-mode",
  154 |     "compact",
  155 |   );
  156 |   // Shifts are reported after the frame that paints them.
  157 |   await nextFrames(page);
```