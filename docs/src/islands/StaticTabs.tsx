import { Tab, Tabs } from "../components/Tabs.js";

/** Props of {@link StaticTabs}: a Tabs group whose panels are finished HTML. */
export interface StaticTabsProps {
  readonly sync?: string;
  readonly label?: string;
  readonly variant?: "code";
  readonly titles: readonly string[];
  /** Each panel's server-rendered markup; the client reads it back with {@link panelsOf}. */
  readonly panels: readonly string[];
}

/**
 * `<Tabs>` as an island. The panels are static page content, so they enter
 * React as markup: the server renders them once and hydration keeps the DOM
 * it finds instead of shipping the panels again as JavaScript.
 */
export function StaticTabs({ titles, panels, ...tabs }: Readonly<StaticTabsProps>) {
  return (
    <Tabs {...tabs}>
      {titles.map((title, index) => (
        <Tab key={title} title={title}>
          <div
            dangerouslySetInnerHTML={{ __html: panels[index] ?? "" }}
            data-island-html=""
            style={{ display: "contents" }}
          />
        </Tab>
      ))}
    </Tabs>
  );
}

/** The panel markup of a server-rendered {@link StaticTabs} island, before it hydrates. */
export function panelsOf(island: HTMLElement): string[] {
  return Array.from(
    island.querySelectorAll(":scope > .sw-tabs > .sw-tabs__panel > [data-island-html]"),
    (panel) => panel.innerHTML,
  );
}
