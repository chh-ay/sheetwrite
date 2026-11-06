/**
 * The figure kit's value panels open on hover and keyboard focus in CSS. This
 * adds what CSS cannot: a click or tap on a row's name keeps its panel open
 * (where there is no hover, a tap is the only way in), and Escape closes an
 * open panel without moving the pointer or focus. A closed panel stays closed
 * until the row is left.
 */
const ROW_SELECTOR = ".fig-range-row";
const NAME_SELECTOR = ".fig-range-row__name";

/** Pins a row's panel open or closed; `dismiss` also hides it under the pointer and focus until the row is left. */
function setOpen(row: HTMLElement, open: boolean, dismiss: boolean): void {
  row.toggleAttribute("data-tip-open", open);
  row.toggleAttribute("data-tip-dismissed", dismiss);
  row.querySelector(NAME_SELECTOR)?.setAttribute("aria-expanded", String(open));
}

function handleClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const name = event.target.closest(NAME_SELECTOR);
  const row = name?.closest<HTMLElement>(ROW_SELECTOR);
  // One panel at a time: opening one, or clicking elsewhere, closes the others.
  for (const open of document.querySelectorAll<HTMLElement>(`${ROW_SELECTOR}[data-tip-open]`)) {
    if (open !== row) setOpen(open, false, false);
  }
  if (row) {
    const opening = !row.hasAttribute("data-tip-open");
    setOpen(row, opening, !opening);
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  for (const row of document.querySelectorAll<HTMLElement>(
    `${ROW_SELECTOR}:is(:hover, :focus-within, [data-tip-open])`,
  )) {
    setOpen(row, false, true);
  }
}

function handleLeave(event: Event): void {
  if (!(event.target instanceof Element)) return;
  // Focus leaves through the row's name button; the pointer leaves the row itself.
  event.target.closest(ROW_SELECTOR)?.removeAttribute("data-tip-dismissed");
}

export function installFigureTips(): () => void {
  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleKeyDown);
  // `pointerleave` does not bubble; a capturing listener sees it for every row.
  document.addEventListener("pointerleave", handleLeave, true);
  document.addEventListener("focusout", handleLeave, true);
  return () => {
    document.removeEventListener("click", handleClick);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("pointerleave", handleLeave, true);
    document.removeEventListener("focusout", handleLeave, true);
  };
}
