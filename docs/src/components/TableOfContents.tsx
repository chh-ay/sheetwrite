import { MIN_OUTLINE_ENTRIES, type OutlineItem } from "@docs/lib/outline.js";
import { For, Show } from "solid-js";

import { Icon } from "./Icon.js";

/*
 * The page outline, ported from docs/src/components/TableOfContents.tsx. The
 * build collects it from the page's headings (lib/outline.ts); it renders as
 * static markup, and lib/shell.ts marks the section being read and hides
 * entries whose headings the symbol filter hides.
 */

function OutlineLinks(props: { readonly items: readonly OutlineItem[] }) {
  return (
    <ul>
      <For each={props.items}>
        {(item) => (
          <li data-depth={item.depth}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        )}
      </For>
    </ul>
  );
}

/**
 * Right-rail outline for guide and API pages on wide screens. Smaller
 * viewports use the disclosure above the article instead.
 */
export function TableOfContents(props: { readonly items: readonly OutlineItem[] }) {
  return (
    <Show when={props.items.length >= MIN_OUTLINE_ENTRIES}>
      <nav aria-label="On this page" class="sw-toc" data-pagefind-ignore>
        <span class="sw-toc__label">On this page</span>
        <OutlineLinks items={props.items} />
      </nav>
    </Show>
  );
}

/**
 * The same outline as a disclosure under the page title: a long guide needs an
 * outline on a laptop and a phone too, not only in the rail's 88rem-and-up
 * window. Native `<details>`, so opening it needs no script.
 */
export function InlineTableOfContents(props: { readonly items: readonly OutlineItem[] }) {
  return (
    <details class="sw-toc-inline" data-pagefind-ignore>
      <summary>
        <span class="sw-toc__label">On this page</span>
        <Icon class="sw-disclosure-icon" name="chevron-right" />
      </summary>
      <Show when={props.items.length >= MIN_OUTLINE_ENTRIES}>
        <OutlineLinks items={props.items} />
      </Show>
    </details>
  );
}
