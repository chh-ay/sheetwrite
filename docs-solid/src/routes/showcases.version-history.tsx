import { pageMeta } from "@docs/lib/seo.js";
import { authorName, BASELINE_NAME, SAM, YOU } from "@docs/showcases/scenarios/version-history.js";
import VersionHistorySnippet from "@docs/showcases/snippets/version-history.mdx";
import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { Island } from "../islands/Island.js";
import { ShowcasePage, ShowcaseSection } from "../showcases/layout/ShowcaseLayout.js";
import { VersionHistoryStage } from "../showcases/version-history/VersionHistoryStage.js";

import targetsStylesheet from "../styles/showcases/touch-targets.css?url";
import featureStylesheet from "@docs/styles/feature-showcases.css?url";
import layoutStylesheet from "@docs/styles/showcase-layout.css?url";

export const Route = createFileRoute("/showcases/version-history")({
  head: () => ({
    meta: pageMeta(
      "Version history — Sheetwrite showcases",
      "Edit a shared budget with a teammate, save named versions, compare a version with the current document by author, and restore a range or a sheet.",
    ),
    links: [
      { rel: "stylesheet", href: targetsStylesheet },
      { rel: "stylesheet", href: layoutStylesheet },
      { rel: "stylesheet", href: featureStylesheet },
    ],
  }),
  component: VersionHistoryShowcase,
});

function VersionHistoryShowcase() {
  return (
    <NoHydration>
      <ShowcasePage
        code={{ title: "The code behind it", Snippet: VersionHistorySnippet }}
        eyebrow="Collaboration"
        facts={[
          { label: "Authors", value: `${authorName(YOU)}, ${authorName(SAM)}` },
          { label: "Starts from", value: BASELINE_NAME },
          { label: "Entry point", value: "@sheetwrite/core/history", code: true },
        ]}
        guide={{
          href: "/docs/features/data/persistence/#opt-in-version-archives",
          label: "Read the version history guide",
        }}
        id="version-history"
        stage={
          <Island component={VersionHistoryStage} name="showcase-version-history" props={{}} />
        }
        task={
          <>
            Edit a shared budget with a teammate, save a version, compare it with the approved
            budget and restore part of it.
          </>
        }
        title="Save, compare and restore versions"
      >
        <ShowcaseSection id="version-history-rules" title="How versions are kept">
          <ul>
            <li>
              The document authority journals each committed change in the archive, with its author.
              Edits that are not committed yet never reach a version.
            </li>
            <li>
              Versions are stored in content-addressed chunks, so unchanged cells are shared between
              them. A compare loads a small WASM kernel the first time it runs.
            </li>
            <li>
              A restore is one undoable change and one synced transaction, so Sam's client receives
              it like any other edit.
            </li>
          </ul>
        </ShowcaseSection>
      </ShowcasePage>
    </NoHydration>
  );
}
