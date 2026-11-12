import {
  CURRENT_RELEASE,
  type DocsTabId,
  type NavigationItem,
  type NavigationLocation,
  type NavigationSection,
  navigationBadge,
  nearestNavigationItem,
  tabSections,
} from "@docs/lib/navigation.js";
import { createUniqueId, For, Show } from "solid-js";

import { Icon } from "./Icon.js";

/*
 * The docs navigation tree, ported from docs/src/components/DocsNavigation.tsx.
 * Static markup: groups are native <details>, so opening them needs no script.
 */

/**
 * The one sidebar marker: "New" on a page added in the current release; text,
 * so screen readers announce it. Only page links carry it: a group marker
 * would repeat its pages' markers on a collapsed row.
 */
function NavigationBadgeLabel(props: { readonly item: NavigationItem }) {
  return (
    <Show
      when={
        props.item.items === undefined && navigationBadge(props.item, CURRENT_RELEASE) === "new"
      }
    >
      <span class="sw-nav-badge">New</span>
    </Show>
  );
}

interface NavigationEntriesProps {
  readonly items: readonly NavigationItem[];
  readonly current: NavigationLocation | undefined;
}

/**
 * One level of the tree. A group is a collapsible block that opens when the
 * current page is inside it; its own page, if any, is the first link inside,
 * because a link in the toggle row would also toggle the group.
 */
function NavigationEntries(props: NavigationEntriesProps) {
  return (
    <For each={props.items}>
      {(item) => {
        const children = item.items;
        if (children === undefined) {
          return (
            <a
              aria-current={props.current?.href === item.href ? "page" : undefined}
              href={item.href}
            >
              <Show when={item.icon}>{(icon) => <Icon name={icon()} />}</Show>
              <span>{item.label}</span>
              <NavigationBadgeLabel item={item} />
            </a>
          );
        }
        // A group's own page opens the group too; its link is called Overview to avoid repeating the name.
        const open =
          (props.current?.ancestors.includes(item) ?? false) ||
          (item.href !== undefined && props.current?.href === item.href);
        const ownPage: NavigationItem[] =
          item.href === undefined
            ? []
            : [
                {
                  label: "Overview",
                  href: item.href,
                  icon: item.icon,
                  added: item.added,
                  updated: item.updated,
                },
              ];
        return (
          <details class="sw-nav-subgroup" open={open}>
            <summary>
              <Show when={item.icon}>{(icon) => <Icon name={icon()} />}</Show>
              <span>{item.label}</span>
              <Icon class="sw-disclosure-icon" name="chevron-right" />
            </summary>
            <div>
              <NavigationEntries current={props.current} items={[...ownPage, ...children]} />
            </div>
          </details>
        );
      }}
    </For>
  );
}

/** A section of one page and no overview leads with that page, unlabelled. */
function sectionLabelHidden(section: NavigationSection): boolean {
  return section.href === undefined && section.items.length === 1;
}

/**
 * One section: a small label over its pages. The label is a paragraph that
 * names the group, not a heading, so the page's own headings lead its outline.
 */
function NavigationSectionBlock(props: {
  readonly section: NavigationSection;
  readonly current: NavigationLocation | undefined;
}) {
  const labelId = createUniqueId();
  const labelled = !sectionLabelHidden(props.section);
  const section = props.section;
  return (
    <div
      aria-labelledby={labelled ? labelId : undefined}
      class="sw-nav-section"
      role={labelled ? "group" : undefined}
    >
      <Show when={labelled}>
        <p class="sw-nav-section__label" id={labelId}>
          {section.label}
        </p>
      </Show>
      <NavigationEntries
        current={props.current}
        // A section's own page leads its list, named Overview as a group's is.
        items={
          section.href === undefined
            ? section.items
            : [{ label: "Overview", href: section.href, icon: section.icon }, ...section.items]
        }
      />
    </div>
  );
}

/**
 * The current tab's sections, shared by the sidebar and the drawer so the two
 * can never advertise different documentation.
 */
export function NavigationSections(props: {
  readonly activeHref?: string;
  readonly tab: DocsTabId;
}) {
  const current = nearestNavigationItem(props.activeHref);
  return (
    <nav aria-label="Documentation" class="sw-sidebar__nav">
      <For each={tabSections(props.tab)}>
        {(section) => <NavigationSectionBlock current={current} section={section} />}
      </For>
    </nav>
  );
}
