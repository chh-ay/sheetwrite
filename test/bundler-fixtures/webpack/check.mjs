import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { assertIconSheetEmitted } from "../icon-sheet.mjs";
import { attributeEntry, attributionProvenance } from "../module-attribution.mjs";

const repository_root = resolve("../../..");
const root = resolve("dist");
const package_manifest = JSON.parse(await readFile("package.json", "utf8"));
const package_lock = JSON.parse(await readFile("package-lock.json", "utf8"));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(directory, entry.name))
          : [resolve(directory, entry.name)],
      ),
    )
  ).flat();
}

const public_files = (await walk(root))
  .map((path) => relative(root, path).replaceAll("\\", "/"))
  .filter((path) => /\.(?:css|js|wasm)$/.test(path))
  .sort();
const wasm = public_files.filter((path) => path.endsWith(".wasm"));
const lazy_chunks = public_files.filter((path) => /(?:^|\/)worker-[^/]*\.js$/.test(path));
if (wasm.length !== 1) throw new Error(`Expected one webpack WASM asset, got ${wasm.length}`);
if (!public_files.includes("main.js")) throw new Error("webpack emitted no initial main.js");

// `chunkFilename` names every lazy chunk `worker-*`, so tell the opt-in chrome
// (the ribbon, the toolbar and the command model they share), the side panels,
// the find bar and the built-in function table apart by content. All must stay out of
// main.js, or every app downloads them. Webpack may split the chrome into
// several chunks.
const RIBBON_MARKER = "sheetwrite-ribbon-tabs";
const TOOLBAR_MARKER = "sheetwrite-command-toolbar";
const CHROME_MARKER = "sheetwrite-ribbon-";
const PANEL_MARKER = "sheetwrite-panel-section";
// Text that only the Sort panel renders. The Sort panel is a chunk of its own,
// apart from the other side panels, so it loads only when it opens.
const SORT_PANEL_MARKER = "My data has headers";
// The Queries & Connections panel is its own chunk too; its section title survives minifiers.
const QUERY_PANEL_MARKER = "Kept from the file";
// The Edit Links panel is its own chunk; its empty-state text survives minifiers.
const EDIT_LINKS_PANEL_MARKER = "This workbook has no links to other workbooks.";
// A row of the generated table that functions/registry.ts loads on demand.
const FUNCTION_TABLE_MARKER = '["SUM",';
const FIND_MARKER = "sheetwrite-find-replace-row";
// The AutoFilter's header dropdown loads on first use; its class names survive
// minifiers. Webpack may put the pivot model's value order it sorts with into its chunk.
const AUTOFILTER_MARKER = "sheetwrite-autofilter-presets";
// The dialog shell of the merge warning and the Insert and Delete dialogs
// loads on first use; the class of its button row survives minifiers.
const DIALOG_MARKER = "sheetwrite-dialog-buttons";
// Format Cells (Ctrl+1) loads on first use; its class names survive minifiers.
// Webpack may give the dialog shell a chunk of its own or copy it into the
// Format Cells chunk.
const FORMAT_CELLS_MARKER = "sheetwrite-format-cells";
// Data › Data Validation's command and dialog load on first use; their class
// names survive minifiers. Webpack may copy the dialog shell into the chunk.
const DATA_VALIDATION_MARKER = "sheetwrite-data-validation";
// Paste Special's choices and dialog load on first use; their class names
// survive minifiers. Webpack may copy the dialog shell into the chunk.
const PASTE_SPECIAL_MARKER = "sheetwrite-paste-special";
// The Keyboard shortcuts panel loads on first use; its dialog class survives
// minifiers. Like Format Cells, its chunk may hold a copy of the dialog shell.
const KEYBOARD_SETTINGS_MARKER = "sheetwrite-keyboard-settings";
// The sheet menu's Move or Copy dialog and Tab Color palette load on first
// use, together; the dialog's last list entry survives minifiers.
const SHEET_TAB_PANELS_MARKER = "(move to end)";
// The dashboard view and the New Dashboard command load with the first dashboard.
const DASHBOARD_MARKERS = ["sheetwrite-dashboard", 'kind:"dashboard"'];
// Code that the dashboard view and the XLSX export share: the hidden-pivot IDs,
// and the pivot field model, whose aggregation captions start like the function table.
const DASHBOARD_SHARED_MARKERS = ["chart-data-", '["SUM","Sum"]'];
// The add-on registry loads only when a page installs an add-on; its error text survives minifiers.
const ADDON_REGISTRY_MARKER = "is listed more than once.";
// The registry loads the XLSX slots, the query command seam and the formula suggester slot on
// first use; webpack keeps the names of exports that a dynamic import reads.
const ADDON_SEAM_MARKERS = [
  "setXlsxWorkbookBackend",
  "registerQueryCommands",
  "setFormulaSuggester",
];
const IMPORT_MARKER = "Import XLSX";
const SUMMARY_MARKER = "numericCount";
const REPLACEMENT_MARKER = "Disconnect collaboration before import";
// The number formatter, which the grid, Format Cells and the AutoFilter share;
// webpack may give it a chunk of its own. Its formatter cache key survives
// minifiers.
const NUMBER_FORMAT_MARKER = "fixed:";
const chrome_chunks = [];
const panel_chunks = [];
const sort_panel_chunks = [];
const query_panel_chunks = [];
const edit_links_panel_chunks = [];
const function_table_chunks = [];
const find_chunks = [];
const auto_filter_chunks = [];
const format_cells_chunks = [];
const data_validation_chunks = [];
const keyboard_settings_chunks = [];
const paste_special_chunks = [];
const dialog_chunks = [];
const sheet_tab_panel_chunks = [];
const dashboard_chunks = [];
const workers = [];
const addon_registry_chunks = [];
const addon_seam_chunks = [];
const document_chunks = [];
const number_format_chunks = [];
const chrome_code = [];
for (const file of lazy_chunks) {
  const code = await readFile(resolve(root, file), "utf8");
  if (code.includes(QUERY_PANEL_MARKER)) query_panel_chunks.push(file);
  else if (code.includes(EDIT_LINKS_PANEL_MARKER)) edit_links_panel_chunks.push(file);
  else if (code.includes(ADDON_REGISTRY_MARKER)) addon_registry_chunks.push(file);
  else if (ADDON_SEAM_MARKERS.some((marker) => code.includes(marker))) addon_seam_chunks.push(file);
  else if (code.includes(SORT_PANEL_MARKER)) sort_panel_chunks.push(file);
  else if (code.includes(PANEL_MARKER)) panel_chunks.push(file);
  // Before the dashboard markers: the dropdown's chunk may hold the pivot model.
  else if (code.includes(AUTOFILTER_MARKER)) auto_filter_chunks.push(file);
  // Before the function table: the shared dashboard code also lists the pivot aggregations.
  else if (DASHBOARD_SHARED_MARKERS.some((marker) => code.includes(marker)))
    dashboard_chunks.push(file);
  else if (code.includes(FUNCTION_TABLE_MARKER)) function_table_chunks.push(file);
  else if (code.includes(CHROME_MARKER) || code.includes(TOOLBAR_MARKER)) {
    chrome_chunks.push(file);
    chrome_code.push(code);
  } else if (code.includes(FIND_MARKER)) find_chunks.push(file);
  else if (code.includes(DATA_VALIDATION_MARKER)) data_validation_chunks.push(file);
  else if (code.includes(FORMAT_CELLS_MARKER)) format_cells_chunks.push(file);
  else if (code.includes(KEYBOARD_SETTINGS_MARKER)) keyboard_settings_chunks.push(file);
  else if (code.includes(PASTE_SPECIAL_MARKER)) paste_special_chunks.push(file);
  else if (code.includes(DIALOG_MARKER)) dialog_chunks.push(file);
  else if (code.includes(SHEET_TAB_PANELS_MARKER)) sheet_tab_panel_chunks.push(file);
  else if (DASHBOARD_MARKERS.some((marker) => code.includes(marker))) dashboard_chunks.push(file);
  else if (
    [IMPORT_MARKER, SUMMARY_MARKER, REPLACEMENT_MARKER].some((marker) => code.includes(marker))
  )
    document_chunks.push(file);
  else if (code.includes(NUMBER_FORMAT_MARKER)) number_format_chunks.push(file);
  else workers.push(file);
}
if (workers.length !== 1)
  throw new Error(`Expected one webpack Worker chunk, got ${workers.length}`);
for (const marker of [RIBBON_MARKER, TOOLBAR_MARKER]) {
  if (!chrome_code.some((code) => code.includes(marker)))
    throw new Error(`No lazy webpack chrome chunk contains ${marker}`);
}
if (panel_chunks.length !== 1)
  throw new Error(`Expected one lazy webpack panel chunk, got ${panel_chunks.length}`);
if (number_format_chunks.length > 1) {
  throw new Error(
    `Expected at most one webpack number format chunk, got ${number_format_chunks.length}`,
  );
}
if (sort_panel_chunks.length !== 1)
  throw new Error(`Expected one lazy webpack Sort panel chunk, got ${sort_panel_chunks.length}`);
if (query_panel_chunks.length !== 1)
  throw new Error(`Expected one lazy webpack query panel chunk, got ${query_panel_chunks.length}`);
if (edit_links_panel_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack Edit Links panel chunk, got ${edit_links_panel_chunks.length}`,
  );
}
if (find_chunks.length !== 1)
  throw new Error(`Expected one lazy webpack find bar chunk, got ${find_chunks.length}`);
if (auto_filter_chunks.length !== 1)
  throw new Error(`Expected one lazy webpack AutoFilter chunk, got ${auto_filter_chunks.length}`);
if (format_cells_chunks.length !== 1)
  throw new Error(
    `Expected one lazy webpack Format Cells chunk, got ${format_cells_chunks.length}`,
  );
if (data_validation_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack Data Validation chunk, got ${data_validation_chunks.length}`,
  );
}
if (keyboard_settings_chunks.length !== 1)
  throw new Error(
    `Expected one lazy webpack Keyboard shortcuts chunk, got ${keyboard_settings_chunks.length}`,
  );
if (paste_special_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack Paste Special chunk, got ${paste_special_chunks.length}`,
  );
}
if (dialog_chunks.length > 1)
  throw new Error(`Expected at most one lazy webpack dialog chunk, got ${dialog_chunks.length}`);
if (sheet_tab_panel_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack sheet tab panel chunk, got ${sheet_tab_panel_chunks.length}`,
  );
}
if (addon_registry_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack add-on registry chunk, got ${addon_registry_chunks.length}`,
  );
}
if (function_table_chunks.length !== 1) {
  throw new Error(
    `Expected one lazy webpack function table chunk, got ${function_table_chunks.length}`,
  );
}
const main_code = await readFile(resolve(root, "main.js"), "utf8");
for (const marker of [CHROME_MARKER, TOOLBAR_MARKER]) {
  if (main_code.includes(marker)) {
    throw new Error(`The command chrome (${marker}) is in webpack's main.js; it must load lazily`);
  }
}
if (main_code.includes(PANEL_MARKER)) {
  throw new Error("The side panels are in webpack's main.js; they must load lazily");
}
if (main_code.includes(SORT_PANEL_MARKER)) {
  throw new Error("The Sort panel is in webpack's main.js; it must load lazily");
}
if (main_code.includes(QUERY_PANEL_MARKER)) {
  throw new Error("The query panel is in webpack's main.js; it must load lazily");
}
if (main_code.includes(EDIT_LINKS_PANEL_MARKER)) {
  throw new Error("The Edit Links panel is in webpack's main.js; it must load lazily");
}
if (main_code.includes(ADDON_REGISTRY_MARKER)) {
  throw new Error("The add-on registry is in webpack's main.js; it must load lazily");
}
if (main_code.includes(FIND_MARKER)) {
  throw new Error("The find bar is in webpack's main.js; it must load lazily");
}
if (main_code.includes(AUTOFILTER_MARKER)) {
  throw new Error("The AutoFilter dropdown is in webpack's main.js; it must load lazily");
}
if (main_code.includes(DIALOG_MARKER)) {
  throw new Error("The dialog shell is in webpack's main.js; it must load lazily");
}
if (main_code.includes(FORMAT_CELLS_MARKER)) {
  throw new Error("Format Cells is in webpack's main.js; it must load lazily");
}
if (main_code.includes(PASTE_SPECIAL_MARKER)) {
  throw new Error("Paste Special is in webpack's main.js; it must load lazily");
}
if (main_code.includes(DATA_VALIDATION_MARKER)) {
  throw new Error("Data Validation is in webpack's main.js; it must load lazily");
}
if (main_code.includes(SHEET_TAB_PANELS_MARKER)) {
  throw new Error("The sheet tab panels are in webpack's main.js; they must load lazily");
}
if (main_code.includes(FUNCTION_TABLE_MARKER)) {
  throw new Error("The built-in function table is in webpack's main.js; it must load lazily");
}
for (const marker of [IMPORT_MARKER, SUMMARY_MARKER, REPLACEMENT_MARKER]) {
  if (main_code.includes(marker)) {
    throw new Error(`A cold document operation is in webpack's main.js: ${marker}`);
  }
}

// The fixture creates no grid, so it needs no store. Lazy modules that import
// the store make webpack keep the store's helpers in shared startup modules.
const STORE_MARKER = "Encoded JSON exceeds the";
if (main_code.includes(STORE_MARKER)) {
  throw new Error("Store helpers are in webpack's main.js; a lazy module imports the store");
}

// webpack.styles.config.js builds core's stylesheet on its own.
const styles_root = resolve("dist-styles");
const stylesheet = await readFile(resolve(styles_root, "styles.css"), "utf8");
if (!stylesheet.includes(".sheetwrite-tabstrip")) {
  throw new Error("webpack did not inline the parts that core's styles.css imports");
}
await assertIconSheetEmitted({
  bundler: "webpack",
  stylesheets: [{ path: resolve(styles_root, "styles.css"), text: stylesheet }],
  resolveUrl: (url, path) => resolve(dirname(path), url),
  packagedSheet: resolve("node_modules/@sheetwrite/core/styles/icons.svg"),
});

const assets = public_files.map((file) => {
  const kind = file.endsWith(".js") ? "javascript" : file.endsWith(".css") ? "css" : "wasm";
  let owner;
  let roles;
  if (file === "main.js" || file === wasm[0]) {
    owner = "core-initial";
    roles = ["core-initial"];
  } else if (workers.includes(file)) {
    owner = "worker-async";
    roles = ["worker-async"];
  } else if (
    [
      chrome_chunks,
      panel_chunks,
      sort_panel_chunks,
      query_panel_chunks,
      edit_links_panel_chunks,
      function_table_chunks,
      find_chunks,
      auto_filter_chunks,
      format_cells_chunks,
      data_validation_chunks,
      keyboard_settings_chunks,
      paste_special_chunks,
      dialog_chunks,
      sheet_tab_panel_chunks,
      document_chunks,
      number_format_chunks,
      dashboard_chunks,
      addon_registry_chunks,
      addon_seam_chunks,
    ].some((chunks) => chunks.includes(file))
  ) {
    // The function table loads from the panels and formula help, and the add-on registry from
    // `initSheetwrite`, as Vite's chrome graph counts them.
    owner = "chrome-async";
    roles = ["chrome-async"];
  } else {
    throw new Error(`Unclassified webpack emitted asset: ${file}`);
  }
  return {
    path: relative(repository_root, resolve(root, file)).replaceAll("\\", "/"),
    kind,
    owner,
    roles,
  };
});
const attribution = [
  await attributeEntry({
    assetFiles: ["main.js"],
    bundler: "webpack",
    eagerImports: ["@sheetwrite/core#initSheetwrite"],
    entry: "src/main.js",
    name: "core-first-paint",
    repositoryRoot: repository_root,
    root,
  }),
];
const terser_version = package_lock.packages?.["node_modules/terser-webpack-plugin"]?.version;
if (typeof terser_version !== "string") {
  throw new Error("webpack fixture lock is missing terser-webpack-plugin");
}
const evidence = {
  schemaVersion: 2,
  bundler: "webpack",
  version: package_manifest.dependencies.webpack,
  assets,
  provenance: attributionProvenance({
    minifier: "terser-webpack-plugin",
    version: terser_version,
  }),
  attribution,
};
const evidence_path = resolve(repository_root, "test-results/bundlers/webpack.json");
await mkdir(resolve(evidence_path, ".."), { recursive: true });
await writeFile(evidence_path, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("webpack size manifest:", relative(process.cwd(), evidence_path));
