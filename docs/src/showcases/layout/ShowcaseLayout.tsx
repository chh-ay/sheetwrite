import { ArrowRight, BookOpen, Code } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { SiteTopbar } from "../../components/SiteTopbar.js";
import type { CapabilityOwnerId } from "../capabilities.js";

import "../../styles/showcase-layout.css";

/** One measured fact in the showcase header, such as a row count or a timing. */
export interface ShowcaseFact {
  readonly label: string;
  /** The value, read from the showcase's data or a generated source; never typed by hand. */
  readonly value: string;
}

/** The code that produced the demo: an MDX snippet, highlighted at build time. */
export interface ShowcaseCode {
  readonly title: string;
  /** The default export of a `.mdx` snippet file holding one fenced code block. */
  readonly Snippet: ComponentType;
}

/** A link from the showcase to the guide that explains it. */
export interface ShowcaseGuide {
  readonly href: string;
  readonly label: string;
}

/** Props of {@link ShowcaseLayout}. */
export interface ShowcaseLayoutProps {
  /** The showcase's id in the capability inventory; marks it in the top bar. */
  readonly id: CapabilityOwnerId;
  /** The capability group, shown above the title. */
  readonly eyebrow: string;
  readonly title: string;
  /** One or two sentences: what the reader can do with the demo. */
  readonly task: ReactNode;
  readonly facts?: readonly ShowcaseFact[];
  /** Accessible name of the demo region. */
  readonly demoLabel: string;
  /** The live demo: the page's main element, given the full stage width. */
  readonly demo: ReactNode;
  /** The side panel: one or more {@link ShowcaseControlGroup}s. */
  readonly controls?: ReactNode;
  readonly code?: ShowcaseCode;
  readonly guide?: ShowcaseGuide;
  /** Further explanation after the code, as {@link ShowcaseSection}s. */
  readonly children?: ReactNode;
}

/**
 * The one layout every showcase uses: a short task statement, the live demo
 * as the main element with a side panel of controls, then the code that
 * produced it. On tablets and phones the panel follows the demo.
 */
export function ShowcaseLayout({
  id,
  eyebrow,
  title,
  task,
  facts = [],
  demoLabel,
  demo,
  controls,
  code,
  guide,
  children,
}: ShowcaseLayoutProps) {
  return (
    <div className="sw-showcase">
      <SiteTopbar active={id} />
      <main className="sw-showcase__page" id="main-content">
        <header className="sw-showcase__header">
          <div className="sw-showcase__intro">
            <p className="sw-eyebrow">{eyebrow}</p>
            <h1 className="sw-showcase__title">{title}</h1>
            <p className="sw-showcase__task">{task}</p>
          </div>
          {facts.length > 0 && <ShowcaseFacts facts={facts} />}
        </header>
        <div className="sw-showcase__stage" data-has-controls={controls !== undefined}>
          <section aria-label={demoLabel} className="sw-showcase__demo">
            {demo}
          </section>
          {controls !== undefined && (
            <aside aria-label="Controls" className="sw-showcase__controls">
              {controls}
            </aside>
          )}
        </div>
        {code !== undefined && <ShowcaseCodeBlock code={code} guide={guide} />}
        {children}
      </main>
    </div>
  );
}

function ShowcaseFacts({ facts }: { readonly facts: readonly ShowcaseFact[] }) {
  return (
    <dl aria-label="Scenario scope" className="sw-showcase__facts">
      {facts.map((fact) => (
        <div className="sw-showcase__fact" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ShowcaseCodeBlock({
  code,
  guide,
}: {
  readonly code: ShowcaseCode;
  readonly guide: ShowcaseGuide | undefined;
}) {
  const { Snippet } = code;
  return (
    <section aria-labelledby="showcase-code-title" className="sw-showcase__code">
      <header className="sw-showcase__section-header">
        <h2 className="sw-showcase__section-title" id="showcase-code-title">
          <Code aria-hidden="true" className="sw-icon" />
          {code.title}
        </h2>
        {guide !== undefined && (
          <a className="sw-link-arrow" href={guide.href}>
            <BookOpen aria-hidden="true" className="sw-icon" />
            {guide.label}
            <ArrowRight aria-hidden="true" className="sw-icon" />
          </a>
        )}
      </header>
      <Snippet />
    </section>
  );
}

/** Props of {@link ShowcaseControlGroup}. */
export interface ShowcaseControlGroupProps {
  readonly title: string;
  /** One short sentence on what the controls change. */
  readonly description?: ReactNode;
  readonly children: ReactNode;
}

/** A titled group of controls in the side panel. */
export function ShowcaseControlGroup({ title, description, children }: ShowcaseControlGroupProps) {
  return (
    <section className="sw-showcase__control-group">
      <h2 className="sw-showcase__control-title">{title}</h2>
      {description !== undefined && (
        <p className="sw-showcase__control-description">{description}</p>
      )}
      <div className="sw-showcase__control-body">{children}</div>
    </section>
  );
}

/** Props of {@link ShowcaseSection}. */
export interface ShowcaseSectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}

/** A section of explanation after the demo and its code. */
export function ShowcaseSection({ id, title, children }: ShowcaseSectionProps) {
  return (
    <section aria-labelledby={id} className="sw-showcase__section">
      <h2 className="sw-showcase__section-title" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}
