import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "../lib/seo.js";
import { COLLABORATION_ACTORS } from "../showcases/collaboration-protocol.js";
import CollaborationShowcase from "../showcases/CollaborationShowcase.js";
import type { ProofPageContent } from "../showcases/ProofPage.js";

import proofStylesheet from "../styles/showcase-proofs.css?url";

const description =
  "Two live clients share one sequencing server. Take one offline, queue an edit and reconnect, or run a chaos test: both converge with no lost updates.";

export const Route = createFileRoute("/showcases/collaboration")({
  head: () => ({
    meta: pageMeta("Live collaboration — Sheetwrite", description),
    links: [{ rel: "stylesheet", href: proofStylesheet }],
  }),
  component: CollaborationProofRoute,
});

function CollaborationProofRoute() {
  return <CollaborationShowcase content={COLLABORATION_PAGE} />;
}

const COLLABORATION_PAGE: ProofPageContent = {
  boundary: [
    {
      concern: "Commit ordering",
      owner: "sheetwrite",
      detail:
        "SyncCoordinator: optimistic local commits, ordered acknowledgements, echo deduplication, gap buffering, and fail-closed input limits.",
    },
    {
      concern: "Presence & conservative rebase",
      owner: "sheetwrite",
      detail:
        "PresenceCoordinator shares ephemeral selections; rebaseDocumentOperations transforms safe edits and reports explicit conflicts instead of guessing.",
    },
    {
      concern: "Transport",
      owner: "host",
      detail:
        "The in-page server here stands in for your WebSocket or realtime channel. Sheetwrite defines the messages and ordering rules, but ships no network code.",
    },
    {
      concern: "Durable server storage",
      owner: "host",
      detail:
        "Server-side document state, revision history, and backups live in your database behind your PersistenceAdapter implementation.",
    },
    {
      concern: "Auth, authorization & deployment",
      owner: "host",
      detail:
        "Who a collaborator is, what they may edit, and where the service runs are host decisions. Presence identity is advisory UI state, never access control.",
    },
  ],
  boundaryContract: "PersistenceAdapter + RemoteOperationSource",
  boundaryLede:
    "Everything moving on this page is the real collaboration flow running in your browser tab. The server is deliberately illustrative: the responsibilities below never move into Sheetwrite.",
  description,
  eyebrow: "Collaboration",
  facts: [
    {
      label: "Clients",
      value: COLLABORATION_ACTORS.map((actor) => actor.displayName).join(" and "),
    },
    { label: "Ordering", value: "Server-sequenced versions" },
    { label: "Conflicts", value: "Conservative rebase" },
  ],
  guideHref: "/docs/features/collaboration/",
  guideLabel: "Read the collaboration guide",
  slug: "collaboration",
  title: "Two clients, one shared history, no lost updates.",
  verification: [
    {
      title: "Convergence under ordering",
      detail:
        "Every commit is sequenced once by the server and fanned out; both grids, live formulas included, converge to identical state.",
    },
    {
      title: "Loss without double-apply",
      detail:
        "Drop an acknowledgement, retry with the same mutation id, and the server answers duplicate: applied exactly once, at the original version.",
    },
    {
      title: "Offline is a first-class state",
      detail:
        "An offline client keeps committing into its durable IndexedDB queue; reconnecting drains the queue in order through the same synchronization flow.",
    },
    {
      title: "Gaps and conflicts stay explicit",
      detail:
        "Out-of-order broadcasts buffer until the gap closes; stale base versions surface as conflicts that recover through the documented rebase loop.",
    },
    {
      title: "Atomic multi-version batches",
      detail:
        "A restore that is larger than one server version becomes one atomic batch: the server stores every version or none, and the peer applies the whole batch in a single transaction.",
    },
  ],
};
