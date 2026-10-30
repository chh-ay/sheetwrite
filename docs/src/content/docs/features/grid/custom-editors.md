---
title: Custom editors
description: Replace the stock cell editor with a host-supplied editor for a column.
---

Set `Column.editor` to a key in `GridOptions.editors`, and Sheetwrite mounts your editor over the active cell.

```ts prelude="framework" partial="requires a status column and the statusEditor from the partial setup below" title="Register the status editor"
const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
  editors: { status: statusEditor },
});
```

<div class="sw-grid-result" data-caption="Result: after editing Ada's status, choosing Active and pressing Enter, the cell contains Active.">

| Ada | Active |
| --- | --- |

</div>

<details>
<summary>Editor example (requires host, workbook and data)</summary>

This editor example needs an initialized host, a workbook and data. For the result above, use a text column for the name and a text column with `editor: "status"` for the status, with one row containing `"Ada"` and `"Prospect"`.

```ts prelude="core" partial="requires surrounding host state" title="Synchronous select editor"
const statusEditor: CellEditor = {
  mount(host, context) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", context.label);
    for (const value of ["Prospect", "Active", "Paused"]) {
      select.add(new Option(value, value));
    }
    select.value = context.text;
    host.appendChild(select);
    select.focus();

    return {
      update(next) {
        select.setAttribute("aria-label", next.label);
        select.value = next.text;
      },
      reposition(rect) {
        select.style.width = `${rect.width}px`;
        select.style.height = `${rect.height}px`;
      },
      commit() {
        return select.value;
      },
      cancel() {},
      destroy() {
        select.remove();
      },
    };
  },
};

const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
  editors: { status: statusEditor },
});
```

</details>

When the user edits a cell in a column with `editor: "status"`, a select list opens over the cell. Picking "Active" and pressing Enter commits `"Active"` and moves down.

## Editor contract

One retained wrapper and one `CellEditorInstance` exist per active edit:

| Hook / value | Guarantee |
| --- | --- |
| `mount(host, context)` | Runs once. The host is positioned over the active cell. |
| `context.address` / `viewAddress` | Canonical data-row and current displayed-row snapshots. They are readonly; mutating a JavaScript object received by the editor cannot retarget the edit. |
| `context.value` / `text` / `initialInput` | Resolved scalar, formatted text, and optional typed character. |
| `context.label` | Accessible name derived from the semantic or positional header plus the row number. |
| `context.signal` | Aborted before the editor's `cancel()` or `destroy()` hook on cancel, commit, reset, or unmount. |
| `context.commit()` / `cancel()` | Optional editor-driven completion using the canonical path. A non-string commit from untyped JavaScript cancels safely. |
| `update(context)` | External value, theme, zoom, view permutation, or geometry-sensitive state changed without replacing ownership. |
| `reposition(rect)` | The active cell moved or resized. |
| `commit()` | May return input synchronously or asynchronously; duplicate completion is ignored. |
| `cancel()` | Notification before a host-requested cancellation; the signal is already aborted. |
| `destroy()` | Runs exactly once; late async work must observe the aborted signal. A thrown hook error is reported without interrupting Sheetwrite's DOM, listener, or store cleanup. |

The returned value is parsed with the column's normal type. It commits through the same document transaction as stock editing. That preserves protection, validation, mutation policy, undo/redo, change events, and edit-commit events.

Keys inside the editor:

| Key | Effect |
| --- | --- |
| Enter | Commit and move down. |
| Tab / Shift+Tab | Commit and move horizontally. |
| Escape | Cancel. |

Focus returns to the grid after commit or cancel.

## Asynchronous editors

For remote choices, use the editor-owned `AbortSignal`. Never let a late request write into a destroyed editor:

```ts prelude="core" partial="requires surrounding host state" title="Abortable async autocomplete"
const assigneeAutocomplete: CellEditor = {
  mount(host, context) {
    const input = document.createElement("input");
    const list = document.createElement("datalist");
    list.id = `assignees-${context.address.row}-${context.address.col}`;
    input.setAttribute("list", list.id);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", context.label);
    input.value = context.initialInput ?? context.text;
    host.append(input, list);
    input.focus();

    void fetch(`/api/people?q=${encodeURIComponent(input.value)}`, {
      signal: context.signal,
    })
      .then((response) => response.json() as Promise<Array<{ id: string; name: string }>>)
      .then((people) => {
        if (context.signal.aborted) return;
        list.replaceChildren(
          ...people.map((person) => {
            const option = document.createElement("option");
            option.value = person.name;
            option.dataset.id = person.id;
            return option;
          }),
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      });

    return {
      update(next) {
        input.setAttribute("aria-label", next.label);
      },
      reposition(rect) {
        input.style.width = `${rect.width}px`;
      },
      async commit() {
        await Promise.resolve();
        return input.value;
      },
      cancel() {},
      destroy() {
        input.remove();
        list.remove();
      },
    };
  },
};
```

An asynchronous commit stays bound to the data row captured at `mount`. This holds even when sorting or `clearView()` moves that row before the promise settles.

## Framework adapters

`editors` is construction-bound, so React, Vue and Svelte resets safely abort and destroy an active editor before they publish the new grid generation. All adapters accept the same registry:

```tsx prelude="react" partial="requires React component state" title="React"
<SheetwriteGrid
  ref={gridRef}
  workbook={workbook}
  data={data}
  presentation="data-grid"
  editors={{ status: statusEditor, assignee: assigneeAutocomplete }}
  onCommandStateChange={({ states }) => setCommandStates(states)}
/>
```

```vue prelude="vue" partial="requires Vue component state" title="Vue"
<SheetwriteGrid
  ref="gridComponent"
  :workbook="workbook"
  :data="data"
  presentation="data-grid"
  :editors="{ status: statusEditor, assignee: assigneeAutocomplete }"
  @command-state-change="({ states }) => commandStates = states"
/>
```

```svelte prelude="svelte" partial="requires Svelte component state" title="Svelte"
<SheetwriteGrid
  bind:grid
  {workbook}
  {data}
  presentation="data-grid"
  editors={{ status: statusEditor, assignee: assigneeAutocomplete }}
  onCommandStateChange={(event: GridEvents["command-state-change"]) => commandStates = event.states}
/>
```

## Edge cases and limits

- A custom editor takes precedence over the built-in validation-list editor.
- If the `Column.editor` key is not in `editors`, Sheetwrite falls back to validation editing or its stock text/date editor.
- If a filter removes the row from the view while an async commit is pending, Sheetwrite cancels and aborts the edit. It does not retarget another row.
- A rejected promise, `undefined`, or a non-string value from untyped JavaScript cancels without a mutation.

## See also

- [Grid options and presentation](/docs/features/grid/options-and-presentation/)
- [Interaction → Inline editing](/docs/features/grid/editing-and-clipboard/#inline-editing)
- Generated [`CellEditor`](/docs/api/core/cell-editor/), [`CellEditorContext`](/docs/api/core/cell-editor-context/) and [`CellEditorInstance`](/docs/api/core/cell-editor-instance/) contracts
