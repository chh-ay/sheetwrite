import { For } from "solid-js";

import { dataSnapshot } from "./store.js";

/** The data tools page's event log: grid calls and events, newest first. */
export function DataEvents() {
  return (
    <ol class="sw-data-events" data-testid="data-events">
      <For each={dataSnapshot()?.events ?? []}>
        {(event) => (
          <li data-tone={event.tone}>
            <span>{event.text}</span>
            <code>{event.api}</code>
          </li>
        )}
      </For>
    </ol>
  );
}
