import { createSignal, For } from "solid-js";

/** One filter of the showcase index. */
export interface HubFilterGroup {
  readonly id: string;
  readonly label: string;
}

/** Props of {@link HubFilter}. */
export interface HubFilterProps {
  /** "All" first, then each group a card can belong to. */
  readonly groups: readonly HubFilterGroup[];
  readonly total: number;
}

/** The value of the filter that shows every card. */
export const ALL_GROUPS = "all";

/**
 * The index's filter buttons. The cards are static markup in the page; each
 * card names its group (`data-group` on its list item). The filter shows only
 * the chosen group's cards and only the sections that still hold one, and
 * names the chosen group on each list (`data-group` on `.sw-hub-scenes`),
 * which the layout reads.
 */
export function HubFilter(props: HubFilterProps) {
  let root!: HTMLDivElement;
  const [group, setGroup] = createSignal(ALL_GROUPS);
  const [shown, setShown] = createSignal(props.total);

  const choose = (next: string): void => {
    setGroup(next);
    const scenes = root.closest(".sw-hub__scenes");
    if (scenes === null) return;
    let visible = 0;
    for (const section of scenes.querySelectorAll<HTMLElement>(".sw-hub__group")) {
      let inSection = 0;
      for (const list of section.querySelectorAll<HTMLElement>(".sw-hub-scenes")) {
        list.dataset.group = next;
      }
      for (const card of section.querySelectorAll<HTMLElement>("li[data-group]")) {
        const show = next === ALL_GROUPS || card.dataset.group === next;
        card.hidden = !show;
        if (show) inSection += 1;
      }
      section.hidden = inSection === 0;
      visible += inSection;
    }
    setShown(visible);
  };

  return (
    <div class="sw-hub__toolbar" ref={root}>
      <fieldset class="sw-hub__filters">
        <legend>Filter product examples</legend>
        <For each={props.groups}>
          {(item) => (
            <button
              aria-pressed={group() === item.id}
              onClick={() => choose(item.id)}
              type="button"
            >
              {item.label}
            </button>
          )}
        </For>
      </fieldset>
      <p aria-live="polite" class="sw-hub__filter-status">
        {shown()} / {props.total} shown
      </p>
    </div>
  );
}
