import type { ReactNode } from "react";

import { type ShowcaseCode, ShowcaseLayout, ShowcaseSection } from "./layout/ShowcaseLayout.js";

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
  /** The named contract that crosses the ownership boundary (e.g. PersistenceAdapter). */
  boundaryContract: string;
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
  /** The workbook or app the demo shows, named in its window bar. */
  demoTitle: string;
  /** Small controls of the demo window, such as its status. */
  demoActions?: ReactNode;
  demo: ReactNode;
  controls: ReactNode;
  /** Sections after the code, before the proof points and the ownership map. */
  children?: ReactNode;
}

/**
 * The layout of the protocol showcases (database, collaboration): the shared
 * showcase layout, then what the scenario proves and an explicit map of what
 * Sheetwrite ships and what the host owns.
 */
export function ProofPage({
  content,
  code,
  demoTitle,
  demoActions,
  demo,
  controls,
  children,
}: Readonly<ProofPageProps>) {
  const { slug, boundary } = content;
  return (
    <ShowcaseLayout
      code={code}
      controls={controls}
      demo={demo}
      demoActions={demoActions}
      demoLabel={`${content.title} live scenario`}
      demoTitle={demoTitle}
      eyebrow={content.eyebrow}
      facts={content.facts}
      guide={{ href: content.guideHref, label: content.guideLabel }}
      id={slug}
      task={content.description}
      title={content.title}
    >
      {children}
      <ShowcaseSection id={`${slug}-proof-points`} title="What the scenario proves">
        <ol className="sw-proofs-points">
          {content.verification.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ol>
      </ShowcaseSection>
      <section
        aria-labelledby={`${slug}-boundary`}
        className="sw-showcase__section sw-prose sw-proofs-boundary"
        data-testid="proof-boundary"
      >
        <h2 className="sw-showcase__section-title" id={`${slug}-boundary`}>
          What Sheetwrite provides, and what your host owns
        </h2>
        <p>{content.boundaryLede}</p>
        <div className="sw-proofs-boundary__map">
          <BoundaryLane
            label="Sheetwrite-owned responsibilities"
            lane="sheetwrite"
            note="ships in the library"
            owner="Sheetwrite"
            rows={boundary.filter((row) => row.owner === "sheetwrite")}
          />
          <p className="sw-proofs-boundary__contract">
            <code>{content.boundaryContract}</code>
          </p>
          <BoundaryLane
            label="Host-owned responsibilities"
            lane="host"
            note="you implement and deploy"
            owner="Your host"
            rows={boundary.filter((row) => row.owner === "host")}
          />
        </div>
      </section>
    </ShowcaseLayout>
  );
}

function BoundaryLane({
  label,
  lane,
  note,
  owner,
  rows,
}: Readonly<{
  label: string;
  lane: BoundaryRow["owner"];
  note: string;
  owner: string;
  rows: readonly BoundaryRow[];
}>) {
  return (
    <section aria-label={label} className="sw-proofs-boundary__lane" data-lane={lane}>
      <header>
        <strong>{owner}</strong>
        <span>{note}</span>
      </header>
      <ul>
        {rows.map((row) => (
          <li data-owner={row.owner} key={row.concern}>
            <strong>{row.concern}</strong>
            <span>{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
