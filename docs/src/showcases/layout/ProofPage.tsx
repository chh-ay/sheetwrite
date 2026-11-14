import { For, type JSX } from "solid-js";

import { BoundarySeam } from "../../art/diagrams.js";
import { ShowcaseSection } from "./ShowcaseLayout.js";
import { type ShowcaseCode, ShowcasePage } from "./ShowcasePage.js";

export interface ProofFact {
  label: string;
  value: string;
}

export interface VerificationPoint {
  title: string;
  detail: string;
}

/** One responsibility split row: what Sheetwrite ships vs. what the host owns. */
export interface BoundaryRow {
  concern: string;
  owner: "sheetwrite" | "host";
  detail: string;
}

/** The text of a protocol showcase page, which its route owns. */
export interface ProofPageContent {
  boundary: readonly BoundaryRow[];
  /** The interfaces the host implements and Sheetwrite calls, each with its methods. */
  boundaryInterfaces: readonly (readonly [name: string, methods: readonly string[]])[];
  boundaryLede: string;
  description: string;
  eyebrow: string;
  facts: readonly ProofFact[];
  guideHref: string;
  guideLabel: string;
  slug: "database" | "collaboration";
  title: string;
  verification: readonly VerificationPoint[];
}

interface ProofPageProps {
  content: ProofPageContent;
  code: ShowcaseCode;
  /** The page's island: the demo and its side panel. */
  stage: JSX.Element;
  /** How it works: sections with their pictures, between the demo and the code. */
  explain?: JSX.Element;
  /** A picture for each verification point, by its title. */
  proofArt?: Readonly<Record<string, () => JSX.Element>>;
  /** Sections after the code, before the proof points and the ownership map. */
  children?: JSX.Element;
}

/**
 * The layout of the protocol showcases (database, collaboration): the shared
 * showcase layout, then what the scenario proves and an explicit map of what
 * Sheetwrite ships and what the host owns. Renders on the server only.
 */
export function ProofPage(props: Readonly<ProofPageProps>) {
  const content = props.content;
  return (
    <ShowcasePage
      code={props.code}
      eyebrow={content.eyebrow}
      explain={props.explain}
      facts={content.facts}
      guide={{ href: content.guideHref, label: content.guideLabel }}
      id={content.slug}
      stage={props.stage}
      task={content.description}
      title={content.title}
    >
      {props.children}
      <ShowcaseSection id={`${content.slug}-proof-points`} title="What the scenario proves">
        <ProofCards art={props.proofArt} points={content.verification} />
      </ShowcaseSection>
      <section
        aria-labelledby={`${content.slug}-boundary`}
        class="sw-showcase__section sw-prose sw-proofs-boundary"
        data-testid="proof-boundary"
      >
        <h2 class="sw-showcase__section-title" id={`${content.slug}-boundary`}>
          What Sheetwrite provides, and what your host owns
        </h2>
        <p>{content.boundaryLede}</p>
        <div class="sw-proofs-boundary__map">
          <BoundaryLane
            label="Sheetwrite-owned responsibilities"
            lane="sheetwrite"
            note="ships in the library"
            owner="Sheetwrite"
            rows={content.boundary.filter((row) => row.owner === "sheetwrite")}
          />
          <div class="sw-proofs-boundary__seam">
            <BoundarySeam interfaces={content.boundaryInterfaces} />
          </div>
          <BoundaryLane
            label="Host-owned responsibilities"
            lane="host"
            note="you implement and deploy"
            owner="Your host"
            rows={content.boundary.filter((row) => row.owner === "host")}
          />
        </div>
      </section>
    </ShowcasePage>
  );
}

/**
 * What a scenario proves, as cards: each claim with the picture of it (when
 * one is drawn) above its title and detail. Styles: showcase-layout.css.
 */
export function ProofCards(
  props: Readonly<{
    points: readonly VerificationPoint[];
    art?: Readonly<Record<string, () => JSX.Element>> | undefined;
  }>,
) {
  return (
    <ul class="sw-proof-cards">
      <For each={props.points}>
        {(point) => {
          const Art = props.art?.[point.title];
          return (
            <li>
              <article class="sw-proof-card">
                {Art === undefined ? null : (
                  <div class="sw-proof-card__art">
                    <Art />
                  </div>
                )}
                <div class="sw-proof-card__body">
                  <strong>{point.title}</strong>
                  <p>{point.detail}</p>
                </div>
              </article>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

function BoundaryLane(
  props: Readonly<{
    label: string;
    lane: BoundaryRow["owner"];
    note: string;
    owner: string;
    rows: readonly BoundaryRow[];
  }>,
) {
  return (
    <section aria-label={props.label} class="sw-proofs-boundary__lane" data-lane={props.lane}>
      <header>
        <strong>{props.owner}</strong>
        <span>{props.note}</span>
      </header>
      <ul>
        <For each={props.rows}>
          {(row) => (
            <li data-owner={row.owner}>
              <strong>{row.concern}</strong>
              <span>{row.detail}</span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
