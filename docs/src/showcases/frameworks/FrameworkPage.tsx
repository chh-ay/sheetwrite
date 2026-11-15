import { SHOWCASE_NAVIGATION } from "@docs/lib/site-links.js";
import { ANALYTICS_ROWS } from "@docs/showcases/scenarios/analytics.js";
import { BUSINESS_ROWS } from "@docs/showcases/scenarios/business.js";
import { ENGINE_ROWS } from "@docs/showcases/scenarios/engine.js";
import { OFFLINE_ROWS } from "@docs/showcases/scenarios/offline.js";
import { For, type JSX } from "solid-js";

import corePackage from "../../../../packages/core/package.json" with { type: "json" };
import { Icon } from "../../components/Icon.js";
import { SiteTopbar } from "../../components/SiteTopbar.js";
import { PackageCommand } from "../../islands/content.js";
import { ProofCards } from "../layout/ProofPage.js";

/*
 * The page around each framework workbench (/vanilla/, /react/, /vue/,
 * /svelte/): the capability hero, the live workbench as the page's island,
 * what it demonstrates, and the install and next links. Renders on the
 * server only. Styles: @docs/styles/workbench-stage.css and
 * @docs/styles/showcase-capability-hero.css.
 */

export type Framework = "vanilla" | "react" | "vue" | "svelte";

export interface FrameworkProof {
  readonly title: string;
  readonly detail: string;
}

interface FrameworkPageProps {
  readonly framework: Framework;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly prompt: string;
  readonly proof: readonly FrameworkProof[];
  /** A picture for each proof, by its title. */
  readonly proofArt?: Readonly<Record<string, () => JSX.Element>>;
  readonly guide: string;
  readonly packageName: string;
  readonly sourcePath: string;
  /** The workbench island. */
  readonly children: JSX.Element;
}

/** The dataset each adapter page loads, sized from its scenario constant. */
const SCENARIO: Readonly<Record<Framework, string>> = {
  vanilla: `${ENGINE_ROWS.toLocaleString("en-US")} accounts`,
  react: `${ANALYTICS_ROWS.toLocaleString("en-US")} accounts`,
  vue: `${BUSINESS_ROWS.toLocaleString("en-US")} purchase orders`,
  svelte: `${OFFLINE_ROWS.toLocaleString("en-US")} field tickets`,
};

/** What the host side of each workbench owns. */
const OWNS: Readonly<Record<Framework, string>> = {
  vanilla: "Grid lifecycle",
  react: "Query + analytics",
  vue: "Rules + permissions",
  svelte: "Offline outbox",
};

export function FrameworkPage(props: FrameworkPageProps) {
  const index = SHOWCASE_NAVIGATION.findIndex(
    (item) => item.href.replaceAll("/", "") === props.framework,
  );
  const current = SHOWCASE_NAVIGATION[index] ?? SHOWCASE_NAVIGATION[0];
  const next = SHOWCASE_NAVIGATION[(index + 1) % SHOWCASE_NAVIGATION.length] ?? current;
  const facts = [
    { label: "Adapter", value: current.label },
    { label: "Scenario", value: SCENARIO[props.framework] },
    { label: "Owns", value: OWNS[props.framework] },
    { label: "Version", value: `Sheetwrite ${corePackage.version}` },
  ];
  const detailsId = `${props.framework}-runtime-details`;

  return (
    <div class="sw-showcase-frame sw-showcase-frame--workbench">
      <SiteTopbar pathname="/showcases/" />
      <main class="sw-showcase-page" data-framework={props.framework} id="main-content">
        <header class="sw-capability-hero">
          <div class="sw-capability-hero__copy">
            <p class="sw-capability-hero__eyebrow">{props.eyebrow}</p>
            <h1>{props.title}</h1>
            <p class="sw-capability-hero__lede">{props.description}</p>
          </div>
          <dl aria-label="Scenario scope" class="sw-capability-hero__facts">
            <For each={facts}>
              {(fact) => (
                <div>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </header>

        <section
          aria-label={`${props.title} live example`}
          class="sw-showcase-page__stage sw-workbench-stage"
        >
          <div class="sw-showcase-stage__viewport">{props.children}</div>
          <footer class="sw-showcase-stage__prompt">
            <strong>Try it</strong>
            <span>{props.prompt}</span>
            <span>Keyboard ready · Canvas rendered</span>
          </footer>
        </section>

        <section aria-labelledby={detailsId} class="sw-showcase-page__proof">
          <header>
            <p class="sw-showcase-page__eyebrow">Public API in use</p>
            <h2 id={detailsId}>What this example demonstrates.</h2>
            <p>
              No mock controls or copied state. Every interaction above crosses the public adapter
              and Grid APIs.
            </p>
          </header>
          <ProofCards art={props.proofArt} points={props.proof} />
        </section>

        <footer class="sw-showcase-page__footer">
          <div class="sw-showcase-page__footer-install">
            <span>Build with this adapter</span>
            <strong>Install {props.packageName}.</strong>
            <p>The guide documents lifecycle, SSR, reset, and event contracts for this adapter.</p>
            <PackageCommand packages={props.packageName} />
          </div>
          <nav aria-label="Example resources" class="sw-showcase-page__footer-links">
            <a href={props.guide}>
              <span>Guide</span>
              <strong>Read the {current.label} guide</strong>
            </a>
            <a href={`https://github.com/chh-ay/sheetwrite/blob/develop/${props.sourcePath}`}>
              <span>Source</span>
              <strong>View this example on GitHub</strong>
            </a>
            <a href={next.href}>
              <span>Next example</span>
              <strong>
                {next.label}
                <Icon name="arrow-right" size="sm" />
              </strong>
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
