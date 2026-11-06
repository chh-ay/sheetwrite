# Excel checks

Some behavior of Sorting (#353), table relationships (#229), saved queries (#227), number formats (#433), external links (#226), measures (#230), dashboards (#231) and multi-level category labels (#501) can only be confirmed in desktop Excel. Sheetwrite wrote every input file below; none of them was saved by Excel. `scripts/excel-check-fixtures.ts` writes the input files of checks 7, 10 to 15 with the full engine, through the same XLSX export a user runs. Run the checks in one sitting with Microsoft 365 Excel for Windows or Mac, en-US locale.

For each check, save the result file under the name given and attach it to the issue in a comment. A test then compares the file with Sheetwrite's result. When a result differs from the expected one, also write down what Excel showed.

| # | Issue | Input file | Result to attach |
|---|---|---|---|
| 1 | #353 | `packages/xlsx/test/fixtures/excel-sort-order-input.xlsx` | `excel-sort-order-result.xlsx` |
| 2 | #353 | `packages/xlsx/test/fixtures/excel-sort-formulas-input.xlsx` | `excel-sort-formulas-result.xlsx` |
| 3 | #353 | `test/fixtures/excel-checks/sort-quick-header.xlsx` | `sort-quick-header-excel.xlsx` |
| 4 | #353 | `test/fixtures/excel-checks/sort-table-sheetwrite.xlsx` | none; record what Excel shows |
| 5 | #353 | `test/fixtures/excel-checks/sort-range-input.xlsx` | `sort-range-excel.xlsx` |
| 6 | #229 | `test/fixtures/excel-checks/model-tables-input.xlsx` | `model-relationship-excel.xlsx` |
| 7 | #229 | `test/fixtures/excel-checks/model-sheetwrite-export.xlsx` | none; record what Excel shows |
| 8 | #227 | `test/fixtures/excel-checks/power-query-csv.xlsx` | `power-query-csv-excel.xlsx` |
| 9 | #433 | none; type the formulas into a new workbook | none; record what Excel shows |
| 10 | #226 | `test/fixtures/excel-checks/links-sheetwrite-export.xlsx` and `Budget.xlsx` | `links-excel.xlsx` |
| 11 | #226 | `test/fixtures/excel-checks/links-sheetwrite-export.xlsx` | none; record what Excel shows |
| 12 | #230 | `test/fixtures/excel-checks/measures-model-pivot.xlsx` | none; record what Excel shows |
| 13 | #230 | `test/fixtures/excel-checks/measures-only-model.xlsx` | `measures-only-model-excel.xlsx` |
| 14 | #231 | `test/fixtures/excel-checks/dashboard-sheetwrite-export.xlsx` | none; record what Excel shows |
| 15 | #501 | `test/fixtures/excel-checks/chart-levels-sheetwrite-export.xlsx` | `chart-levels-excel.xlsx` |

## 1. Sort order (#353)

The file holds the cases of the sort-order tests, one column each, on the sheets `Ascending` and `Descending`.

1. On sheet `Ascending`, for each column from A to I, select only its filled cells: A1:A4, B1:B3, C1:C44, D1:D4, E1:E5, F1:F2, G1:G3, H1:H3, I1:I8.
2. Select **Data › Sort**. If Excel asks, choose **Continue with the current selection**.
3. Clear **My data has headers**. Sort by that column, on **Cell Values**, **A to Z** (**Smallest to Largest**).
4. Do steps 1 to 3 on sheet `Descending` with **Z to A** (**Largest to Smallest**).
5. Save as `excel-sort-order-result.xlsx`.

Expected: each column is in the order that `packages/wasm/src/sort_order_tests.rs` expects. Text compares without case, apostrophes and hyphens are skipped, errors come after `FALSE` and `TRUE`, and blank cells are last in both directions.

## 2. Formulas that move with a sort (#353)

1. Select A1:B5. Select **Data › Sort**. If Excel asks, choose **Continue with the current selection**.
2. Clear **My data has headers**. Sort by **Column A**, **Cell Values**, **Smallest to Largest**. Select **OK**.
3. Save as `excel-sort-formulas-result.xlsx`.

Expected:

| Row | A | B formula |
|---|---|---|
| 1 | 1 | `=$A$1+Sheet1!A3` |
| 2 | 2 | `=A1+1` |
| 3 | 3 | `=A3*10` |
| 4 | 4 | `=SUM(A4:A4)` |
| 5 | 5 | `=A5*A$1` |

D1 keeps `=A1*2` and shows 2.

## 3. Quick sort and the header row (#353)

Sort A to Z with one cell selected sorts the region around it, and Excel guesses whether the first row is a header.

1. On sheet `Header`, select A3. Select **Data › Sort A to Z**.
2. On sheet `TextOnly`, select A3. Select **Data › Sort A to Z**.
3. Save as `sort-quick-header-excel.xlsx`.

Expected, as Sheetwrite sorts:

- `Header`: `Name` and `Qty` stay in row 1, and the rows below are apple 1, fig 2, pear 3. A text row over numbers is a header.
- `TextOnly`: every row sorts, so A1:A4 is Lima, Oslo, Paris, Town. A text row over text is not a header.

If Excel keeps `Town` in row 1, write that down. Sheetwrite then follows Excel.

## 4. A table sorted in Sheetwrite opens sorted (#353)

Sheetwrite sorted the body of table `Fruit` by `Qty`, largest first, and exported the file.

1. Open the file.
2. Open **Data › Sort** with a cell of the table selected.

Expected:

- Excel opens the file without a repair message.
- The rows are kiwi 5, pear 3, fig 2, apple 1.
- The filter button on `Qty` shows a descending sort.
- The Sort dialog shows one level: `Qty`, **Cell Values**, **Largest to Smallest**.

## 5. A range sorted in Excel (#353)

1. Select A1:B5. Select **Data › Sort**. Keep **My data has headers** selected.
2. Sort by `Name`, **Cell Values**, **A to Z**. Select **OK**.
3. Save as `sort-range-excel.xlsx`.

Expected: the rows are apple, fig, kiwi, pear, under the header row. After import, Sheetwrite keeps this order and applies no view sort, and an export writes Excel's sort state back.

## 6. Relationships from Excel's data model (#229)

The file has the tables `Orders` (`Customer`, `Amount`) and `Customers` (`ID`, `Region`).

1. Select **Data › Relationships › New**. Relate table `Orders`, column `Customer` to related table `Customers`, column `ID`. Select **OK**. Excel adds both tables to its data model.
2. Save as `model-relationship-excel.xlsx`.

Expected: Excel shows the relationship in **Data › Relationships** as active. After import, Sheetwrite has one relationship from `Orders[Customer]` to `Customers[ID]`.

## 7. A Sheetwrite workbook with a model pivot (#229)

Sheetwrite related the same tables and added a model pivot at A8 (`Region` by sum of `Amount`). Sheetwrite cannot write Excel's data model, which is a known difference for 0.7.0. The export writes the pivot's current output as cells and keeps the pivot in Sheetwrite metadata (#495).

1. Open the file.
2. Write down A8:B12.
3. Open **Data › Relationships**.

Expected:

- Excel opens the file without a repair message.
- The tables and their values are as in the input file.
- A8:B12 hold `Region`, `Sum of Amount`; North 15; South 20; West 7; `Total` 42, as plain values: Excel shows no PivotTable there.
- Data › Relationships lists no relationship.

## 8. A saved query refreshes in Excel (#227)

The file has the query `People`, which reads `test/fixtures/excel-checks/people.csv` from the `develop` branch on GitHub over HTTPS, and its output table `People`.

1. Open the file. If Excel shows a security bar, select **Enable Content**.
2. Open **Data › Queries & Connections**. Right-click `People` and select **Edit**. Close the Power Query editor without changes.
3. Select **Data › Refresh All**. If Excel asks for the access level of the web source, choose **Anonymous** and **Connect**; for a privacy level, choose **Public**.
4. Save, close and open the file again in Excel.
5. Save as `power-query-csv-excel.xlsx`.

Expected:

- Step 2: `People` is listed and its M opens in the Power Query editor.
- Step 3: the table `People` refreshes without an error and shows `Name` and `Age` with Ana 34, Ben 27, Chloe 41.
- Step 4: the query and the table are still there.
- After import with the query codec, Sheetwrite still has query `People` bound to table `People`.

## 9. TEXT with a percent code past the largest number (#433)

A percent sign multiplies the number by 100 before TEXT writes it. Near Excel's largest number, 9.99999999999999E+307 ([Excel specifications and limits](https://support.microsoft.com/en-us/office/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3)), that product no longer fits.

1. In a new workbook, type these formulas in A1:A3:
   - `=TEXT(9.99999999999999E+307,"0%")`
   - `=TEXT(-9.99999999999999E+307,"0.0%;(0.0%)")`
   - `=TEXT(1E+305,"0%%")`
2. Write down what each cell shows.

Expected: `#NUM!` in all three cells, the error Excel gives a result too large to show ([How to correct a #NUM! error](https://support.microsoft.com/en-us/office/how-to-correct-a-num-error-f5193bfc-4400-43f4-88c4-8e1dcca0428b)). Sheetwrite returns `#NUM!` for these cells. If Excel shows text or another error, attach a screenshot to #433.

## 10. External links from a Sheetwrite workbook (#226)

Sheet `Report` reads the workbook `Budget.xlsx`: B1 is `=[Budget.xlsx]Annual!C10`, B2 is `=SUM([Budget.xlsx]Annual!C10:C11)` and B3 is `=[Budget.xlsx]Annual!C10*2`. Sheetwrite saved the values 1200 for C10 and 300 for C11 with the link. `Budget.xlsx` holds newer values: 1500 in C10 and 500 in C11.

1. Copy `links-sheetwrite-export.xlsx` to an empty folder. Do not copy `Budget.xlsx` yet.
2. Open the file. If Excel shows a security bar about links, leave it closed and do not select **Enable Content**.
3. Write down B1:B3.
4. Select **Data › Queries & Connections › Edit Links**. Write down the sources and their status. Close the dialog.
5. Close the file without saving. Copy `Budget.xlsx` into the same folder.
6. Open `links-sheetwrite-export.xlsx` again. Select **Data › Queries & Connections › Edit Links**, select `Budget.xlsx` and **Update Values**. Close the dialog.
7. Save as `links-excel.xlsx` in the same folder.

Expected:

- Excel opens the file without a repair message.
- Step 3: B1 shows 1200, B2 1500 and B3 2400, the saved values.
- Step 4: Edit Links lists `Budget.xlsx` and `Prices.xlsx`.
- Step 6: B1 shows 1500, B2 2000 and B3 3000.
- After import, Sheetwrite has a link `Budget.xlsx` with the values 1500 in C10 and 500 in C11, and B1:B3 show 1500, 2000 and 3000.

## 11. A link Sheetwrite added for a book a formula names (#226)

B4 of the same file is `=[Prices.xlsx]List!B2`. The workbook had no link for `Prices.xlsx`, so Sheetwrite's export added one without values, as Excel does when a formula names a closed workbook.

1. Open `links-sheetwrite-export.xlsx` from a folder that holds no `Prices.xlsx`. Do not enable content.
2. Write down B4 and its formula in the formula bar.
3. Select **Data › Queries & Connections › Edit Links**, select `Prices.xlsx` and **Check Status**. Write down the status.

Expected: the formula still names `Prices.xlsx` and sheet `List`; Excel may show the folder path in front of the book name. B4 shows `#REF!`, as in Sheetwrite, because the link has no saved values. Edit Links lists `Prices.xlsx`, and Check Status reports that the source is not found.

## 12. A model pivot with measures (#230)

Sheet `Data` has the table `Orders` (`Region`, `Amount`) and, at D1, the model pivot `Revenue by region`: `Region` by sum of `Amount`, the measure `Revenue` (`=SUM(Orders[Amount])`) and the measure `Share` (`=[Revenue]/CALCULATE([Revenue], ALL(Orders[Region]))`). Excel keeps measures in its data model part, which Sheetwrite does not write, so the export warned "Pivot table Revenue by region was not written as a native pivot because a model pivot needs an Excel data-model binary; its current values were written as cells and it remains in Sheetwrite metadata".

1. Open the file.
2. Write down what D1:G6 show.
3. Open **Data › Relationships** and **Data › Data Model › Manage Data Model** (Power Pivot), if your Excel has it. Write down whether any table or measure is listed.

Expected:

- Excel opens the file without a repair message.
- The table `Orders` and its values are as in the input file.
- D1:G6 hold the pivot's values as plain cells: `Region`, `Sum of Amount`, `Revenue`, `Share`; East 180, 180, 27%; North 190, 190, 29%; South 95, 95, 15%; West 190, 190, 29%; `Total` 655, 655, 100%. The share cells use the `0%` format. Excel shows no PivotTable there, as in check 7.
- No relationship or measure is listed in Excel.

## 13. Measures with no relationships through Excel (#230)

The workbook's data model has the measures `Revenue` and `Share` over the table `Orders`, and no relationships. They are in the Sheetwrite metadata sheet, which Excel keeps hidden.

1. Open the file.
2. Change B2 from 120 to 125.
3. Save as `measures-only-model-excel.xlsx`.

Expected: Excel opens and saves the file without a repair message. After import, Sheetwrite has the measures `Revenue` and `Share` with their formulas and home table `Orders`, and B2 is 125.

## 14. A dashboard in Excel (#231)

Sheet `Dashboard` is a Sheetwrite dashboard: the model pivot `Revenue by region`, a `Region` slicer that keeps East, North and West, a KPI card of `Revenue`, and a PivotChart of `Revenue`. The export wrote it as a worksheet of the items' current values and a native column chart that reads the pivot item's cells, and warned "Dashboard sheets were written as worksheets of their current values and charts; they are interactive only in Sheetwrite".

1. Open the file and select sheet `Dashboard`.
2. Write down A1:D6, F1:F4 and H1:H2.
3. Select the chart. Write down its title, its categories and its bar heights, and whether **Chart Design › Select Data** shows a range or no range.

Expected:

- Excel opens the file without a repair message.
- A1 is `Revenue by region`. A3:D5 list East 180, 180, 27%; North 190, 190, 29%; West 190, 190, 29%. Row 6 is `Total` 560, 560, 85%. The share total is not 100% because `ALL` removes the slicer's region filter too, as in DAX.
- F1 is `Region`, and F2:F4 list East, North and West.
- H1 is `Revenue` and H2 is 560.
- The chart draws three columns, East 180, North 190 and West 190, titled `Revenue by region`. Select Data shows the series `Revenue` with the values `='Dashboard'!$C$3:$C$5` and the axis labels `='Dashboard'!$A$3:$A$5`.

## 15. Multi-level category labels (#501)

Sheet `Sales` holds A1:C5: `Region`, `Segment`, `Amount`; East, Retail, 10; (blank), Online, 7; West, Retail, 4; (blank), Online, 11. Its column chart `Amount by region and segment` reads the categories A2:B5. Its bar chart `One row of labels` reads the same cells with **Format Axis › Labels › Multi-level Category Labels** cleared (`c:noMultiLvlLbl`). Sheet `Orders` holds the table `Orders`, and sheet `Report` holds the PivotTable `Sales by segment` by region, then segment, in compact layout with subtotals, and a PivotChart of it. Its categories are a `c:multiLvlStrRef` over the PivotTable's row labels A3:A9, with the leaf items and regions in its cache. Sheet `Board` is a dashboard with only a chart over a pivot, so no written cells hold the chart's points: its categories are a `c:multiLvlStrRef` with the formula `#REF!` and the labels in its cache.

1. Open the file. Write down whether Excel shows a repair message.
2. On `Sales`, write down the labels of each chart's category axis, row by row, and whether **Multi-level Category Labels** is checked in Format Axis for each chart.
3. Select the column chart and open **Chart Design › Select Data**. Write down the **Horizontal (Category) Axis Labels**.
4. Change A4 from `West` to `North`. Write down the column chart's outer labels.
5. On `Report`, select the chart. Write down whether Excel shows the **PivotChart Analyze** tab, the chart's category labels row by row, and the column heights.
6. Select **PivotChart Analyze › Refresh**. Write down the labels and heights again.
7. On `Board`, write down the chart's category labels row by row, the column heights, and what Select Data shows for the axis labels.
8. Save as `chart-levels-excel.xlsx`.

Expected:

- Excel opens the file without a repair message.
- The column chart on `Sales` has two rows of labels: Retail, Online, Retail, Online on the first, and East and West once each on the second, centered under their two columns. Lines divide the categories and the two groups. Multi-level Category Labels is checked. Select Data shows `Sales!$A$2:$B$5` for the axis labels. After step 4, the outer labels are East and North.
- The bar chart has one row of labels, `East Retail`, `Online`, `West Retail`, `Online`, and Multi-level Category Labels is cleared.
- The chart on `Report` is a PivotChart: the PivotChart Analyze tab shows. It has Online, Retail, Retail, Online, Retail on the first row and East, North, West on the second; the columns are 7, 10, 6, 11, 4. No subtotal or grand total is a column. Refresh changes nothing.
- The chart on `Board` draws the same labels and columns as the chart on `Report`, from its cache. Select Data shows `#REF!` for the axis labels.
- After import, Sheetwrite has the two charts on `Sales` with the categories A2:B5, the bar chart with `axes.multiLevelLabels: false`, and the chart on `Report` over the pivot `by-segment`.

