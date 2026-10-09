import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "../components/DocsShell.js";
import { pageMeta } from "../lib/seo.js";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: pageMeta(
      "Sheetwrite documentation",
      "Get started with Sheetwrite, choose a framework, browse the API, or give your AI agent the complete reference.",
    ),
  }),
  component: DocsOverview,
});

const frameworks = [
  { name: "Vanilla", slug: "vanilla", package: "core", detail: "Own the grid lifecycle directly." },
  { name: "React", slug: "react", package: "react", detail: "Components, refs, and callbacks." },
  { name: "Vue", slug: "vue", package: "vue", detail: "Props, events, and exposed state." },
  { name: "Svelte", slug: "svelte", package: "svelte", detail: "Bindings and callback props." },
];

function DocsOverview() {
  return (
    <DocsShell
      activeHref="/docs/"
      description="Everything you need to build a spreadsheet your application controls."
      title="Build with Sheetwrite"
    >
      <div className="sw-doc-home">
        <section className="sw-doc-start">
          <div>
            <span className="sw-doc-eyebrow">Start here</span>
            <h2>Your first grid, from install to edit.</h2>
            <p>
              Choose a package, mount a workbook, and listen for changes. Start with the setup guide
              for your framework.
            </p>
            <a className="sw-doc-primary" href="/docs/start/installation/">
              Install Sheetwrite <span aria-hidden="true">→</span>
            </a>
            <a className="sw-doc-secondary" href="/docs/start/first-grid/">
              Read the quickstart
            </a>
          </div>
          <ol className="sw-doc-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Install</strong>
                <small>Package, styles, and runtime</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Mount</strong>
                <small>Your framework, your lifecycle</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Build</strong>
                <small>Data, editing, and persistence</small>
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="new-in-release">
          <div className="sw-doc-section-head">
            <h2 id="new-in-release">New in 0.5.0</h2>
            <a href="/docs/start/whats-new/">Read the release notes →</a>
          </div>
          <div className="sw-doc-destinations">
            <a href="/docs/guides/analysis-formulas/">
              <span className="sw-doc-eyebrow">Full formula engine</span>
              <strong>
                Analyze in the sheet <span aria-hidden="true">→</span>
              </strong>
              <span>
                GROUPBY, PIVOTBY, LAMBDA, regression, finance, and regex in the optional
                @sheetwrite/formulas engine.
              </span>
            </a>
            <a href="/docs/guides/formulas/#spill-references">
              <span className="sw-doc-eyebrow">Both engines</span>
              <strong>
                Spill references <span aria-hidden="true">→</span>
              </strong>
              <span>A1# follows a spill as it grows, and array constants spill in place.</span>
            </a>
            <a href="/docs/start/whats-new/#upgrade-checklist">
              <span className="sw-doc-eyebrow">Upgrade</span>
              <strong>
                Upgrade checklist <span aria-hidden="true">→</span>
              </strong>
              <span>What a persistence server and direct @sheetwrite/wasm users must change.</span>
            </a>
          </div>
        </section>

        <section aria-labelledby="choose-framework">
          <div className="sw-doc-section-head">
            <h2 id="choose-framework">Choose your framework</h2>
            <a href="/docs/frameworks/lifecycle/">Compare lifecycles →</a>
          </div>
          <div className="sw-doc-frameworks">
            {frameworks.map((framework) => (
              <a href={`/docs/frameworks/${framework.slug}/`} key={framework.slug}>
                <strong>
                  {framework.name}
                  <span aria-hidden="true">↗</span>
                </strong>
                <code>@sheetwrite/{framework.package}</code>
                <span>{framework.detail}</span>
              </a>
            ))}
          </div>
        </section>

        <section aria-labelledby="find-answer">
          <div className="sw-doc-section-head">
            <h2 id="find-answer">Find what you need</h2>
          </div>
          <div className="sw-doc-destinations">
            <a href="/docs/api/">
              <span className="sw-doc-eyebrow">Reference</span>
              <strong>
                Explore the API <span aria-hidden="true">→</span>
              </strong>
              <span>Browse packages, filter exports, and inspect exact TypeScript signatures.</span>
            </a>
            <a href="/docs/concepts/runtime-ownership/">
              <span className="sw-doc-eyebrow">Concepts</span>
              <strong>
                Understand ownership <span aria-hidden="true">→</span>
              </strong>
              <span>
                Know what belongs to your application, the adapter, the grid, and the engine.
              </span>
            </a>
            <a href="/showcases/">
              <span className="sw-doc-eyebrow">Live examples</span>
              <strong>
                See it in action <span aria-hidden="true">→</span>
              </strong>
              <span>
                Try real workbooks, framework integrations, and capability demonstrations.
              </span>
            </a>
          </div>
        </section>

        <section aria-labelledby="build-features">
          <div className="sw-doc-section-head">
            <h2 id="build-features">Build a feature</h2>
          </div>
          <div className="sw-doc-recipes">
            <a href="/docs/guides/configuration/">
              <strong>Configure a grid</strong>
              <span>Options, shell, and rendering</span>
            </a>
            <a href="/docs/guides/interaction/">
              <strong>Editing & interaction</strong>
              <span>Selection, clipboard, and validation</span>
            </a>
            <a href="/docs/guides/data-operations/">
              <strong>Connect your data</strong>
              <span>Rows, transactions, and datasources</span>
            </a>
            <a href="/docs/guides/formulas/">
              <strong>Work with formulas</strong>
              <span>Expressions, references, and functions</span>
            </a>
            <a href="/docs/guides/analysis-formulas/">
              <strong>Analyze data</strong>
              <span>Group, pivot, forecast, and clean text</span>
            </a>
            <a href="/docs/guides/host-owned-rows/">
              <strong>Use your own row store</strong>
              <span>Host-owned rows and entity IDs</span>
            </a>
            <a href="/docs/guides/persistence/">
              <strong>Save & recover</strong>
              <span>Snapshots, pending work, and large undo</span>
            </a>
            <a href="/docs/guides/collaboration/">
              <strong>Collaborate</strong>
              <span>Ordered commits, offline work, and rebase</span>
            </a>
            <a href="/docs/guides/styling/">
              <strong>Style the grid</strong>
              <span>Themes, cell styles, and number formats</span>
            </a>
            <a href="/docs/guides/xlsx-export/">
              <strong>Import & export</strong>
              <span>XLSX, CSV, and workbook interchange</span>
            </a>
          </div>
        </section>

        <section className="sw-doc-agent" aria-labelledby="agent-context">
          <div>
            <span className="sw-doc-eyebrow">For AI-assisted development</span>
            <h2 id="agent-context">Give your agent the same reference.</h2>
            <p>
              A plain-text index and a single-file reference with every authored guide and public
              API declaration. Generated from the same sources as this site.
            </p>
          </div>
          <div className="sw-doc-agent__links">
            <a href="/llms.txt">
              <code>llms.txt</code>
              <span>Start with the index →</span>
            </a>
            <a href="/llms-full.txt">
              <code>llms-full.txt</code>
              <span>Read the full reference →</span>
            </a>
          </div>
        </section>
      </div>
    </DocsShell>
  );
}
