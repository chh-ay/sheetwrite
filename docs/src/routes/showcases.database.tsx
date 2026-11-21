import { pageMeta } from "@docs/lib/seo.js";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { StorageDiagram } from "../art/explain-diagrams.js";
import { DATABASE_PROOF_ART } from "../art/proof-art.js";
import { Island } from "../islands/Island.js";
import { DatabaseLab } from "../showcases/database/DatabaseLab.js";
import { DatabaseStage } from "../showcases/database/DatabaseStage.js";
import { COMPACTION } from "../showcases/database/state.js";
import { ProofPage, type ProofPageContent } from "../showcases/layout/ProofPage.js";
import { ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import DatabaseSnippet from "../showcases/snippets/database.mdx";
import DatabaseSnippetSource from "../showcases/snippets/database.mdx?source";

import artStylesheet from "../art/art.css?url";
import proofCardsStylesheet from "../styles/showcases/proof-cards.css?url";
import proofStylesheet from "../styles/showcases/proofs.css?url";
import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

const description =
  "Edit a live ledger, watch its pending write land in IndexedDB, then reopen the same durable document. The journal shows each acknowledgement as it happens.";

export const Route = createFileRoute("/showcases/database")({
  head: () => ({
    meta: pageMeta("Database and document lifecycle — Sheetwrite", description),
    links: [
      { rel: "stylesheet", href: artStylesheet },
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: proofStylesheet },
      { rel: "stylesheet", href: proofCardsStylesheet },
    ],
  }),
  component: DatabaseShowcase,
});

const DATABASE_PAGE: ProofPageContent = {
  boundary: [
    {
      concern: "Persistence contract",
      owner: "sheetwrite",
      detail:
        "PersistenceAdapter: snapshot load plus append-only DocumentOp[] commits with applied / duplicate / conflict acknowledgements.",
    },
    {
      concern: "Durable offline queue",
      owner: "sheetwrite",
      detail:
        "IndexedDbPendingCommitStorage keeps unacknowledged local commits durable across reloads, with bounded restore.",
    },
    {
      concern: "Server database",
      owner: "host",
      detail:
        "The IndexedDB adapter on this page is demo-only. Production documents live in your database behind your own PersistenceAdapter.",
    },
    {
      concern: "Authentication & authorization",
      owner: "host",
      detail:
        "Sheetwrite never sees credentials. Identity, session, and per-document permissions are enforced by your backend before a commit is sequenced.",
    },
    {
      concern: "Transport & deployment",
      owner: "host",
      detail:
        "HTTP, WebSocket, queues, regions, backups: the adapter interface is transport-neutral by design and ships no network code.",
    },
  ],
  boundaryInterfaces: [["PersistenceAdapter", ["load(documentId)", "commit(request)"]]],
  boundaryLede:
    "This showcase runs the full save-and-reload flow against a real browser database so you can inspect it. The pieces a product must own stay explicitly yours.",
  description,
  eyebrow: "Data",
  facts: [
    { label: "Storage", value: "Browser IndexedDB" },
    { label: "Commits", value: "Append-only operations" },
    { label: "Durability", value: "Pending queue survives reload" },
  ],
  guideHref: "/docs/features/data/persistence/",
  guideLabel: "Read the persistence guide",
  slug: "database",
  title: "Edit once. Reload the same durable document.",
  verification: [
    {
      title: "No lost updates",
      detail:
        "Each commit checks its base version against the stored latest version, one commit at a time. A writer on an old version gets a conflict it can recover from, so no update is lost.",
    },
    {
      title: "A retry is applied once",
      detail:
        "If an acknowledgement is lost and the client retries with the same mutation id, the server answers duplicate with the original version and applies nothing twice.",
    },
    {
      title: "Storage stays bounded",
      detail:
        "The stored operations are capped by count and by bytes. Past either cap, they fold into one compacted snapshot. Watch the gauges.",
    },
    {
      title: "Reload and carry on",
      detail:
        "Close and reopen the session, or reload this page: the saved state and the queue of unsent edits come back from IndexedDB, once.",
    },
    {
      title: "Large undo",
      detail:
        "Clearing 100,000 cells and undoing once restores them in one compressed restoreBlock commit: one history step and one server version. The commit journal shows the size before and after compression.",
    },
    {
      title: "An undo that is too large",
      detail:
        "When an undo exceeds the transaction limits, the Grid emits mutation-rejected with a resource-limit issue, drops that step and keeps older steps undoable. Try it under the 128-byte limit in the failure lab.",
    },
  ],
};

function DatabaseShowcase() {
  return (
    <NoHydration>
      <ProofPage
        proofArt={DATABASE_PROOF_ART}
        explain={
          <ShowcaseSection
            figure={<StorageDiagram />}
            id="database-failure-lab"
            layout="half"
            title="Failure lab and storage"
          >
            <Island
              component={DatabaseLab}
              name="showcase-database-lab"
              props={{
                maxTailRecords: COMPACTION.maxTailRecords,
                maxTailBytes: COMPACTION.maxTailBytes,
              }}
            />
          </ShowcaseSection>
        }
        code={{
          title: "The code behind it",
          Snippet: DatabaseSnippet,
          source: DatabaseSnippetSource,
        }}
        content={DATABASE_PAGE}
        stage={
          <Island
            component={DatabaseStage}
            name="showcase-database"
            props={{ demoLabel: `${DATABASE_PAGE.title} live scenario` }}
          />
        }
      ></ProofPage>
    </NoHydration>
  );
}
