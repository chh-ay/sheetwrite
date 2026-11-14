// Diagrams for docs pages that show what a feature does rather than a
// mechanism: a handle's methods by task, gestures and what they do, a hook
// lifecycle. Every label comes from the page the diagram sits on.
import type { JSX } from "solid-js";

import { FanFigure, FlowFigure } from "./blueprint-layouts.js";

/** Grid methods: the handle createGrid returns, its methods grouped by task. */
export function GridHandleDiagram() {
  return (
    <FanFigure
      source={{
        title: "createGrid(host, options) returns a Grid handle",
        lines: ["Its methods, grouped by the task they do"],
      }}
      text={{
        title: "The Grid handle's methods by task",
        description:
          "createGrid returns a Grid handle. Document and sheets: applyTransaction, insertRows, styleRange, undo. Selection, editing and search: setSelection, beginEdit, search, findNext. Views: sortBy, setViewSort, filterBy, hideRows, groupRows. Layout and appearance: setFrozen, setZoom, setColumnWidth, setTheme. Lifecycle: on, refresh, destroy.",
      }}
      tiles={[
        {
          title: "Document",
          code: ["applyTransaction", "insertRows", "styleRange", "undo · redo"],
        },
        { title: "Selection", code: ["setSelection", "beginEdit", "search", "findNext"] },
        {
          title: "Views",
          code: ["sortBy", "setViewSort", "filterBy", "hideRows", "groupRows"],
          tone: "muted",
        },
        {
          title: "Layout and lifecycle",
          code: ["setFrozen", "setZoom", "setColumnWidth", "setTheme", "on · refresh", "destroy"],
        },
      ]}
    />
  );
}

/** Touch: where a touch pointer goes down decides what the gesture does. */
export function TouchGesturesDiagram() {
  return (
    <FanFigure
      source={{
        title: "A touch pointer goes down",
        lines: ["Where it starts decides what the gesture does"],
      }}
      text={{
        title: "What each touch gesture does",
        description:
          "A tap on a cell selects it, and a tap on a column header selects the column. A double-tap on a cell begins editing. A drag that starts on a plain cell scrolls natively: the grid neither captures the pointer nor prevents the default. A drag that starts on the fill handle fills, on a row or column boundary resizes, and on the border of a multi-cell selection extends it; these capture the pointer.",
      }}
      tiles={[
        { title: "Tap", lines: ["Selects the cell;", "on a header, the", "column"] },
        { title: "Double-tap", lines: ["Begins editing", "the cell"] },
        {
          title: "Drag on a cell",
          lines: ["Native scroll:", "no capture, no", "preventDefault"],
          tone: "muted",
        },
        {
          title: "Drag on a handle",
          lines: ["Fill handle: fill", "Boundary: resize", "Border: extend"],
        },
      ]}
    />
  );
}

/** Custom editors: one editor instance per edit, from mount to commit or cancel. */
export function EditorLifecycleDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 1,
        step: {
          title: "Escape: cancel()",
          lines: [
            "context.signal aborts first; destroy()",
            "runs once, and focus returns to the grid",
          ],
          tone: "muted",
        },
      }}
      note="A commit goes through the stock edit's transaction: validation, undo and events."
      steps={[
        {
          title: "mount(host, context)",
          lines: ["Runs once; the host sits", "over the active cell"],
          tone: "accent",
        },
        {
          title: "update · reposition",
          lines: ["The value, theme or zoom,", "or the cell's box, changed"],
        },
        {
          title: "Enter or Tab: commit()",
          lines: ["Parsed with the column's", "type, then destroy()"],
          tone: "accent",
        },
      ]}
      text={{
        title: "A custom editor from mount to commit or cancel",
        description:
          "mount(host, context) runs once, with the host positioned over the active cell. update(context) and reposition(rect) report a changed value, theme, zoom or cell box without replacing the editor. Enter or Tab calls commit(); the returned value is parsed with the column's type and commits through the same document transaction as stock editing, so validation, protection, undo and change events still apply. Escape cancels: context.signal is aborted before cancel() and destroy(), destroy() runs exactly once, and focus returns to the grid.",
      }}
    />
  );
}

/** Styles: where the theme that paints the canvas comes from, and which layer wins. */
export function ThemeLayersDiagram() {
  return (
    <FlowFigure
      note="setTheme and replaceTheme repaint the grid and emit theme-change."
      steps={[
        { title: "DEFAULT_THEME", lines: ["The built-in values,", "such as rowHeight 28"] },
        {
          title: "CSS custom properties",
          code: ["--sheetwrite-*"],
          lines: ["read by resolveThemeFromCss", "from the host's style"],
        },
        {
          title: "opts.theme · setTheme",
          lines: ["A Partial<Theme> that", "wins last"],
          tone: "accent",
        },
      ]}
      text={{
        title: "Which theme layer wins",
        description:
          "The effective theme is resolved at construction and again on setTheme. DEFAULT_THEME comes first; the --sheetwrite-* CSS custom properties, read from the host's computed style by resolveThemeFromCss, override it; and the theme option or setTheme wins last. setTheme and replaceTheme repaint the grid and emit theme-change.",
      }}
    />
  );
}

/** Feature diagrams by the name a placement uses. */
export const FEATURE_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "grid-handle": GridHandleDiagram,
  "touch-gestures": TouchGesturesDiagram,
  "editor-lifecycle": EditorLifecycleDiagram,
  "theme-layers": ThemeLayersDiagram,
};
