import { readPreference, writePreference } from "@docs/lib/preference-storage.js";
import { createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js";

import { ActionError, pendingProps, useAction } from "../lib/use-action.js";
import { Icon } from "./Icon.js";
import { onTabListKey } from "./tabKeys.js";

const MANAGERS = [
  { id: "npm", program: "npm", subcommand: "install" },
  { id: "pnpm", program: "pnpm", subcommand: "add" },
  { id: "yarn", program: "yarn", subcommand: "add" },
  { id: "bun", program: "bun", subcommand: "add" },
] as const;
const MANAGER_IDS = MANAGERS.map((manager) => manager.id);

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
export function PackageCommand(props: Readonly<PackageCommandProps>) {
  const [manager, setManager] = createSignal<ManagerId>("npm");
  // The feedback names the copied text, so it shows only while that same
  // command is on screen; another manager's command is not on the clipboard.
  const [copiedCommand, setCopiedCommand] = createSignal<string | null>(null);
  let copiedTimer: number | undefined;
  const copy = useAction();
  const id = createUniqueId();
  const entry = createMemo(() => MANAGERS.find((item) => item.id === manager()) ?? MANAGERS[0]);
  const command = () => `${entry().program} ${entry().subcommand} ${props.packages}`;
  const copied = () => copiedCommand() === command();

  onMount(() => {
    const stored = readPreference(MANAGER_STORAGE_KEY);
    if (isManagerId(stored)) setManager(stored);
    const onChange = (event: Event) => {
      if (event instanceof CustomEvent && isManagerId(event.detail)) setManager(event.detail);
    };
    window.addEventListener(MANAGER_EVENT, onChange);
    onCleanup(() => {
      window.removeEventListener(MANAGER_EVENT, onChange);
      window.clearTimeout(copiedTimer);
    });
  });

  const choose = (next: ManagerId) => {
    setManager(next);
    writePreference(MANAGER_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(MANAGER_EVENT, { detail: next }));
  };

  return (
    <figure class="sw-terminal" data-pagefind-ignore>
      <div class="sw-terminal__bar">
        <Icon class="sw-terminal__icon" name="terminal" />
        <div aria-label="Package manager" class="sw-terminal__tabs" role="tablist">
          <For each={MANAGERS}>
            {(item) => (
              <button
                aria-controls={`${id}-command`}
                id={`${id}-${item.id}`}
                aria-selected={item.id === manager()}
                onClick={() => choose(item.id)}
                onKeyDown={(event) =>
                  onTabListKey(event, MANAGER_IDS, item.id, choose, (next) => `${id}-${next}`)
                }
                role="tab"
                tabIndex={item.id === manager() ? 0 : -1}
                type="button"
              >
                {item.id}
              </button>
            )}
          </For>
        </div>
        <button
          class="sw-terminal__copy"
          {...pendingProps(copy.pending)}
          onClick={() => {
            // The command at click time, as the copied text.
            const text = command();
            void copy.run(
              async () => {
                await navigator.clipboard.writeText(text);
                setCopiedCommand(text);
                window.clearTimeout(copiedTimer);
                copiedTimer = window.setTimeout(() => setCopiedCommand(null), COPIED_FEEDBACK_MS);
              },
              () => "Cannot copy the command. Allow clipboard access and try again.",
            );
          }}
          type="button"
        >
          <Show when={copied()} fallback={<Icon name="copy" />}>
            <Icon name="check" />
          </Show>
          <span aria-live="polite">{copied() ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        aria-labelledby={`${id}-${manager()}`}
        class="sw-terminal__body"
        id={`${id}-command`}
        role="tabpanel"
        tabIndex={0}
      >
        {/* Highlighted with the code theme's roles: the shell program, its
            subcommand and the package specifiers. */}
        <code>
          <span aria-hidden="true" class="sw-terminal__prompt">
            ${" "}
          </span>
          <span class="sw-code-function">{entry().program}</span>{" "}
          <span class="sw-code-keyword">{entry().subcommand}</span>{" "}
          <span class="sw-code-string">{props.packages}</span>
        </code>
      </pre>
      <Show when={props.note}>
        <figcaption class="sw-terminal__note">{props.note}</figcaption>
      </Show>
      <ActionError error={copy.error} />
    </figure>
  );
}
