import { Link } from "@tanstack/react-router";

import {
  CURRENT_RELEASE,
  type DocsTabId,
  type NavigationItem,
  type NavigationLocation,
  type NavigationSection,
  navigationBadge,
  nearestNavigationItem,
  tabSections,
} from "../lib/navigation.js";
import { Icon } from "./Icon.js";

/**
 * The one sidebar marker: "New" on a page added in the current release; text,
 * so screen readers announce it. Only page links carry it: a group marker
 * would repeat its pages' markers on a collapsed row.
 */
function NavigationBadgeLabel({ item }: Readonly<{ item: NavigationItem }>) {
  if (item.items !== undefined || navigationBadge(item, CURRENT_RELEASE) !== "new") {
    return null;
  }
  return <span className="sw-nav-badge">New</span>;
}

interface NavigationEntriesProps {
  items: readonly NavigationItem[];
  current: NavigationLocation | undefined;
  onNavigate?: () => void;
}

/**
 * One level of the tree. A group is a collapsible block that opens when the
 * current page is inside it; its own page, if any, is the first link inside,
 * because a link in the toggle row would also toggle the group.
 */
function NavigationEntries({ items, current, onNavigate }: Readonly<NavigationEntriesProps>) {
  return items.map((item) => {
    if (item.items === undefined) {
      return (
        <Link
          activeOptions={{ exact: true }}
          aria-current={current?.href === item.href ? "page" : undefined}
          key={item.href}
          onClick={onNavigate}
          to={item.href}
        >
          {item.icon === undefined ? null : <Icon name={item.icon} />}
          <span>{item.label}</span>
          <NavigationBadgeLabel item={item} />
        </Link>
      );
    }

    // A group's own page opens the group too; call its link Overview to avoid repeating the name.
    const open =
      (current?.ancestors.includes(item) ?? false) ||
      (item.href !== undefined && current?.href === item.href);
    const ownPage =
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
      <details className="sw-nav-subgroup" key={`${item.label}:${open}`} open={open}>
        <summary>
          {item.icon === undefined ? null : <Icon name={item.icon} />}
          <span>{item.label}</span>
          <Icon className="sw-disclosure-icon" name="chevron-right" />
        </summary>
        <div>
          <NavigationEntries
            current={current}
            items={[...ownPage, ...item.items]}
            onNavigate={onNavigate}
          />
        </div>
      </details>
    );
  });
}

/** A section of one page and no overview leads with that page, unlabelled. */
function sectionLabelHidden(section: NavigationSection): boolean {
  return section.href === undefined && section.items.length === 1;
}

/**
 * The current tab's sections, shared by the sidebar and the drawer so the two
 * can never advertise different documentation: each section is a small label
 * over its pages. `onNavigate` lets the drawer close once a reader has picked
 * a destination.
 */
export function NavigationSections({
  activeHref,
  tab,
  onNavigate,
}: Readonly<{ activeHref?: string; tab: DocsTabId; onNavigate?: () => void }>) {
  const current = nearestNavigationItem(activeHref);

  return (
    <nav aria-label="Documentation" className="sw-sidebar__nav">
      {tabSections(tab).map((section) => (
        <section className="sw-nav-section" key={section.label}>
          {sectionLabelHidden(section) ? null : <h2>{section.label}</h2>}
          <NavigationEntries
            current={current}
            // A section's own page leads its list, named Overview as a group's is.
            items={
              section.href === undefined
                ? section.items
                : [{ label: "Overview", href: section.href, icon: section.icon }, ...section.items]
            }
            onNavigate={onNavigate}
          />
        </section>
      ))}
    </nav>
  );
}
