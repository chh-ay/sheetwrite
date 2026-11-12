import { For, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { pendingProps } from "../../lib/use-action.js";
import { Button } from "../ui/Button.js";
import type { Actors } from "./CollaborationStage.js";
import { actionPending, CLIENT_KEYS, engine, views } from "./state.js";

/** Recovery drills and each client's full event log, after the code. */
export function CollaborationFaults(props: Readonly<{ actors: Actors }>) {
  return (
    <details class="sw-clb__advanced" open>
      <summary>
        <Icon name="chevron-right" />
        Lose acknowledgements, hold broadcasts, and commit from the server
      </summary>
      <div class="sw-clb__advanced-body">
        <For each={CLIENT_KEYS}>
          {(key) => {
            const actor = key === "a" ? props.actors[0] : props.actors[1];
            const held = () => views[key].linkState?.heldBroadcasts ?? 0;
            return (
              <section
                aria-labelledby={`clb-${key}-faults-title`}
                class="sw-clb__fault-client"
                data-fault-client={key}
              >
                <h3 id={`clb-${key}-faults-title`}>{actor.displayName} · transport faults</h3>
                <div
                  aria-label={`${actor.displayName}'s advanced network controls`}
                  class="sw-clb__controls"
                  role="toolbar"
                >
                  <Button onClick={() => engine()?.loseNextAck(key)} variant="quiet">
                    Lose next ack
                  </Button>
                  <Button onClick={() => engine()?.retryPending(key)} variant="quiet">
                    Retry pending
                  </Button>
                  <Button onClick={() => engine()?.holdNextBroadcast(key)} variant="quiet">
                    Hold next broadcast
                  </Button>
                  <Button onClick={() => engine()?.releaseHeld(key)} variant="quiet">
                    Release held
                    <Show when={held() > 0}>
                      <span class="sw-clb__held-count">{held()}</span>
                    </Show>
                  </Button>
                </div>
                <ol
                  aria-label={`${actor.displayName}'s sync events`}
                  aria-live="polite"
                  class="sw-clb__log"
                  data-testid={`clb-${key}-log`}
                >
                  <For
                    each={views[key].log}
                    fallback={<li class="sw-clb__log-empty">Sync events appear here.</li>}
                  >
                    {(entry) => <li data-kind={entry.kind}>{entry.text}</li>}
                  </For>
                </ol>
              </section>
            );
          }}
        </For>
        <section aria-labelledby="clb-server-tools-title" class="sw-clb__server-tools">
          <h3 id="clb-server-tools-title">Server and recovery</h3>
          <div class="sw-clb__controls">
            <Button {...pendingProps(actionPending())} onClick={() => engine()?.serverEdit()}>
              {actionPending() ? "Committing…" : "Server-authored commit"}
            </Button>
            <Button {...pendingProps(actionPending())} onClick={() => engine()?.resetDemo()}>
              {actionPending() ? "Resetting…" : "Reset demo"}
            </Button>
          </div>
          <p class="sw-clb__server-note">
            <span class="sw-clb__server-note-tag">Demo-only</span>
            <span>
              This in-page sequencer makes the real <code>PersistenceAdapter</code> +{" "}
              <code>RemoteOperationSource</code> boundary observable. Your backend supplies that
              transport and durable store.
            </span>
          </p>
        </section>
      </div>
    </details>
  );
}
