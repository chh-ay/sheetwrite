import { externalLinkResolverOf } from "../external-link-session.js";
import {
  breakExternalLinks,
  changeExternalLinkSource,
  type ExternalLinkUpdate,
  listExternalLinks,
  updateExternalLinks,
} from "../external-links.js";
import type { ExternalLink } from "../types/external-link.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { panelField, panelSection, rebuildPanel } from "./panel-dom.js";

const STATUS_TEXT: Readonly<Record<ExternalLinkUpdate["status"], string>> = {
  updated: "Updated",
  unavailable: "Source not available; saved values kept",
  failed: "Update failed; saved values kept",
};

function button(label: string, focusKey: string, run: () => void): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  control.dataset.focusKey = focusKey;
  control.addEventListener("click", run);
  return control;
}

function line(text: string, className = "sheetwrite-panel-note"): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function textInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = value;
  return input;
}

/**
 * Data › Queries & Connections › Edit Links: the workbook's links to other
 * workbooks, with Update Values (when the host connected a resolver), Change
 * Source and Break Link. Every change is one undoable document transaction.
 */
export function editLinksPanel(grid: Grid): GridPanel {
  return {
    title: "Edit Links",
    render(body) {
      /** The last update result of each link, by lowercase book name. */
      const statuses = new Map<string, string>();
      /** The link whose Change Source form or Break Link confirmation is open. */
      let editing: { book: string; mode: "source" | "break" } | null = null;
      let message: string | null = null;
      let busy = false;

      const update = async (books: readonly string[]): Promise<void> => {
        const resolve = externalLinkResolverOf(grid);
        if (resolve === undefined || busy) return;
        busy = true;
        message = "Updating values.";
        draw();
        const updates = await updateExternalLinks(grid, resolve, books);
        for (const result of updates)
          statuses.set(result.book.toLowerCase(), STATUS_TEXT[result.status]);
        busy = false;
        message = null;
        draw();
      };

      const linkSection = (link: ExternalLink, canUpdate: boolean): HTMLElement => {
        const key = link.book.toLowerCase();
        const section = panelSection(link.book);
        section.append(
          line(`Location: ${link.target}`),
          line(`Status: ${statuses.get(key) ?? "Saved values"}`),
        );

        if (editing?.book === link.book && editing.mode === "source") {
          const form = document.createElement("form");
          const book = panelField("File name", textInput(link.book), `source-book-${key}`);
          const target = panelField("Location", textInput(link.target), `source-target-${key}`);
          const save = document.createElement("button");
          save.type = "submit";
          save.className = "sheetwrite-panel-control";
          save.textContent = "Change Source";
          save.dataset.focusKey = `source-save-${key}`;
          form.append(
            book.element,
            target.element,
            save,
            button("Cancel", `source-cancel-${key}`, () => {
              editing = null;
              draw();
            }),
          );
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const next = { book: book.control.value.trim(), target: target.control.value.trim() };
            if (next.book === "" || next.target === "" || /[[\]]/.test(next.book)) {
              book.setError("Enter a file name without brackets and a location.");
              return;
            }
            if (!changeExternalLinkSource(grid, link.book, next)) {
              book.setError("The workbook did not accept the new source.");
              return;
            }
            editing = null;
            draw();
          });
          section.append(form);
          return section;
        }

        if (editing?.book === link.book && editing.mode === "break") {
          section.append(
            line(
              "Breaking the link replaces every formula that reads this workbook with its current value.",
            ),
            button("Break Link", `break-confirm-${key}`, () => {
              editing = null;
              message = breakExternalLinks(grid, [link.book])
                ? null
                : "The workbook did not accept the change.";
              draw();
            }),
            button("Cancel", `break-cancel-${key}`, () => {
              editing = null;
              draw();
            }),
          );
          return section;
        }

        const updateButton = button("Update Values", `update-${key}`, () => {
          void update([link.book]);
        });
        updateButton.disabled = !canUpdate;
        section.append(
          updateButton,
          button("Change Source", `source-${key}`, () => {
            editing = { book: link.book, mode: "source" };
            draw();
          }),
          button("Break Link", `break-${key}`, () => {
            editing = { book: link.book, mode: "break" };
            draw();
          }),
        );
        return section;
      };

      const draw = (): void =>
        rebuildPanel(body, (target) => {
          const links = listExternalLinks(grid);
          if (links.length === 0) {
            target.append(line("This workbook has no links to other workbooks."));
            return;
          }

          const canUpdate = externalLinkResolverOf(grid) !== undefined && !busy;
          const all = button("Update All", "update-all", () => {
            void update(links.map((link) => link.book));
          });
          all.disabled = !canUpdate;
          target.append(all);
          if (!canUpdate && !busy) {
            target.append(line("Update Values needs a source that the application connects."));
          }
          if (message !== null) {
            const status = line(message);
            status.setAttribute("role", "status");
            target.append(status);
          }
          for (const link of links) target.append(linkSection(link, canUpdate));
        });

      draw();
      return grid.on("change", draw);
    },
  };
}
