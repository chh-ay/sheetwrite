# Excel checks

Some behavior of Sorting (#353), table relationships (#229) and saved queries (#227) can only be confirmed in desktop Excel. Sheetwrite wrote every input file below; none of them was saved by Excel. Run the checks in one sitting with Microsoft 365 Excel for Windows or Mac, en-US locale.

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

Sheetwrite related the same tables and added a model pivot at A8 (`Region` by sum of `Amount`). Sheetwrite cannot write Excel's data model, which is a known difference for 0.7.0.

1. Open the file.
2. Open **Data › Relationships**.

Expected:

- Excel opens the file without a repair message.
- The tables and their values are as in the input file.
- Data › Relationships lists no relationship.
- A8 and the cells below are empty, because the model pivot is not a native pivot in Excel.

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
