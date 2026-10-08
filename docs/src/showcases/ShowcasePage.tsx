import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { InstallCommand } from "../components/InstallCommand.js";
import { SiteTopbar } from "../components/SiteTopbar.js";
import { SHOWCASE_NAVIGATION } from "../lib/navigation.js";
import { CapabilityHero } from "./CapabilityHero.js";
import "../styles/workbench-stage.css";

export interface ShowcaseProof {
  detail: string;
  title: string;
}

interface ShowcasePageProps {
  active: "vanilla" | "react" | "vue" | "svelte";
  children: ReactNode;
  description: string;
  eyebrow: string;
  guide: string;
  packageName: string;
  proof: readonly ShowcaseProof[];
  prompt: string;
  sourcePath: string;
  title: string;
}

export function ShowcasePage({
  active,
  children,
  description,
  eyebrow,
  guide,
  packageName,
  proof,
  prompt,
  sourcePath,
  title,
}: Readonly<ShowcasePageProps>) {
  const activeIndex = SHOWCASE_NAVIGATION.findIndex(
    (item) => item.href.replaceAll("/", "") === active,
  );
  const activeItem = SHOWCASE_NAVIGATION[activeIndex] ?? SHOWCASE_NAVIGATION[0]!;
  const nextItem = SHOWCASE_NAVIGATION[(activeIndex + 1) % SHOWCASE_NAVIGATION.length]!;

  return (
    <div className="sw-showcase-frame">
      <SiteTopbar active={active} />

      <main className="sw-showcase-page" data-framework={active}>
        <CapabilityHero
          eyebrow={eyebrow}
          title={title}
          description={description}
          facts={[
            { label: "Adapter", value: activeItem.label },
            {
              label: "Scenario",
              value:
                active === "vue"
                  ? "500 purchase orders"
                  : active === "svelte"
                    ? "240 field tickets"
                    : "100,000 accounts",
            },
            {
              label: "Owns",
              value:
                active === "vanilla"
                  ? "Grid lifecycle"
                  : active === "react"
                    ? "Query + analytics"
                    : active === "vue"
                      ? "Rules + permissions"
                      : "Offline outbox",
            },
            { label: "Version", value: "Sheetwrite 0.5.0" },
          ]}
        />

        <section
          aria-label={`${title} live example`}
          className="sw-showcase-page__stage sw-workbench-stage"
        >
          <div className="sw-showcase-stage__viewport">{children}</div>
          <footer className="sw-showcase-stage__prompt">
            <strong>Try it</strong>
            <span>{prompt}</span>
            <span>Keyboard ready · Canvas rendered</span>
          </footer>
        </section>

        <section aria-labelledby={`${active}-runtime-details`} className="sw-showcase-page__proof">
          <header>
            <p className="sw-showcase-page__eyebrow">Public API in use</p>
            <h2 id={`${active}-runtime-details`}>What this example demonstrates.</h2>
            <p>
              No mock controls or copied state. Every interaction above crosses the public adapter
              and Grid APIs.
            </p>
          </header>
          <ol>
            {proof.map((item, index) => (
              <li key={item.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="sw-showcase-page__footer">
          <div className="sw-showcase-page__footer-install">
            <span>Build with this adapter</span>
            <strong>Install {packageName}.</strong>
            <p>The guide documents lifecycle, SSR, reset, and event contracts for this adapter.</p>
            <InstallCommand packageName={packageName} />
          </div>
          <nav aria-label="Example resources" className="sw-showcase-page__footer-links">
            <a href={guide}>
              <span>Guide</span>
              <strong>Read the {activeItem.label} guide</strong>
            </a>
            <a href={`https://github.com/chh-ay/sheetwrite/blob/develop/${sourcePath}`}>
              <span>Source</span>
              <strong>View this example on GitHub</strong>
            </a>
            <Link to={nextItem.href}>
              <span>Next example</span>
              <strong>{nextItem.label} →</strong>
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
