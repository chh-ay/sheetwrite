import { useEffect, useId, useRef, useState } from "react";

import { readPreference, writePreference } from "../lib/preference-storage.js";
import { ActionError, pendingProps, useAction } from "../lib/use-action.js";

const MANAGERS = [
  { id: "npm", install: "npm install" },
  { id: "pnpm", install: "pnpm add" },
  { id: "yarn", install: "yarn add" },
  { id: "bun", install: "bun add" },
] as const;

type ManagerId = (typeof MANAGERS)[number]["id"];

/** The reader's choice follows them to every command on every page. */
const MANAGER_STORAGE_KEY = "sheetwrite-package-manager";
const MANAGER_EVENT = "sheetwrite:package-manager";
const COPIED_FEEDBACK_MS = 1600;

function isManagerId(value: unknown): value is ManagerId {
  return MANAGERS.some((manager) => manager.id === value);
}

interface PackageCommandProps {
  /** Space-separated package specifiers, for example "@sheetwrite/core@0.5.1". */
  packages: string;
  /** Optional line under the command, for context such as "Update every package". */
  note?: string;
}

/**
 * A terminal with one install command in each package manager. Markdown install
 * fences become this component at build time (see `installCommandsAsTerminals`
 * in vite.config.ts); release pages render it for the upgrade command.
 */
export function PackageCommand({ packages, note }: Readonly<PackageCommandProps>) {
  const [manager, setManager] = useState<ManagerId>("npm");
  // The feedback names the copied text, so it shows only while that same
  // command is on screen; another manager's command is not on the clipboard.
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const copy = useAction();
  const id = useId();
  const command = `${MANAGERS.find((entry) => entry.id === manager)?.install ?? "npm install"} ${packages}`;
  const copied = copiedCommand === command;

  useEffect(() => {
    const stored = readPreference(MANAGER_STORAGE_KEY);
    if (isManagerId(stored)) setManager(stored);
    const onChange = (event: Event) => {
      if (event instanceof CustomEvent && isManagerId(event.detail)) setManager(event.detail);
    };
    window.addEventListener(MANAGER_EVENT, onChange);
    return () => {
      window.removeEventListener(MANAGER_EVENT, onChange);
      window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const choose = (next: ManagerId) => {
    setManager(next);
    writePreference(MANAGER_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(MANAGER_EVENT, { detail: next }));
  };

  return (
    <figure className="sw-terminal" data-pagefind-ignore>
      <div className="sw-terminal__bar">
        <span aria-hidden="true" className="sw-terminal__dots">
          <i />
          <i />
          <i />
        </span>
        <div aria-label="Package manager" className="sw-terminal__tabs" role="tablist">
          {MANAGERS.map((entry) => (
            <button
              aria-controls={`${id}-command`}
              id={`${id}-${entry.id}`}
              aria-selected={entry.id === manager}
              key={entry.id}
              onClick={() => choose(entry.id)}
              onKeyDown={(event) => {
                const index = MANAGERS.findIndex((item) => item.id === entry.id);
                let nextIndex: number;
                switch (event.key) {
                  case "ArrowRight":
                    nextIndex = (index + 1) % MANAGERS.length;
                    break;
                  case "ArrowLeft":
                    nextIndex = (index + MANAGERS.length - 1) % MANAGERS.length;
                    break;
                  case "Home":
                    nextIndex = 0;
                    break;
                  case "End":
                    nextIndex = MANAGERS.length - 1;
                    break;
                  default:
                    return;
                }
                event.preventDefault();
                const next = MANAGERS[nextIndex]?.id;
                if (!next) return;
                choose(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }}
              role="tab"
              tabIndex={entry.id === manager ? 0 : -1}
              type="button"
            >
              {entry.id}
            </button>
          ))}
        </div>
        <button
          className="sw-terminal__copy"
          {...pendingProps(copy.pending)}
          onClick={() =>
            void copy.run(
              async () => {
                await navigator.clipboard.writeText(command);
                setCopiedCommand(command);
                window.clearTimeout(copiedTimer.current);
                copiedTimer.current = window.setTimeout(
                  () => setCopiedCommand(null),
                  COPIED_FEEDBACK_MS,
                );
              },
              () => "Cannot copy the command. Allow clipboard access and try again.",
            )
          }
          type="button"
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        aria-labelledby={`${id}-${manager}`}
        className="sw-terminal__body"
        id={`${id}-command`}
        role="tabpanel"
        tabIndex={0}
      >
        <code>
          <span aria-hidden="true" className="sw-terminal__prompt">
            ${" "}
          </span>
          {command}
        </code>
      </pre>
      {note ? <figcaption className="sw-terminal__note">{note}</figcaption> : null}
      <ActionError error={copy.error} />
    </figure>
  );
}
