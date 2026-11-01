import type { KeyboardEvent } from "react";

/**
 * Arrow, Home, and End keys for a WAI-ARIA tab list with automatic
 * activation: the key selects the next tab and moves focus to it.
 */
export function onTabListKey<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  ids: readonly T[],
  active: T,
  select: (id: T) => void,
  tabElementId: (id: T) => string,
): void {
  const index = ids.indexOf(active);
  let next: number;
  switch (event.key) {
    case "ArrowRight":
      next = (index + 1) % ids.length;
      break;
    case "ArrowLeft":
      next = (index - 1 + ids.length) % ids.length;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = ids.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  const id = ids[next];
  if (id === undefined) return;
  select(id);
  document.getElementById(tabElementId(id))?.focus();
}
