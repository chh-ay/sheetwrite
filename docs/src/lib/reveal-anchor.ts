import { fragmentId } from "./fragment.js";

/**
 * Fragment navigation to a generated API member marks its card. Two anchor
 * forms point at a member: the card's id (`#grid-apply-transaction`) and the
 * hidden search anchor just before it (`#applytransaction`), which CSS
 * `:target` cannot carry to the card, so a data flag marks it either way.
 */
function memberFor(target: Element): HTMLElement | null {
  const following = target.nextElementSibling;
  if (
    target.classList.contains("api-search-anchor") &&
    following?.classList.contains("api-member")
  ) {
    return following as HTMLElement;
  }
  return target.closest<HTMLElement>(".api-member");
}

export function revealAnchoredMember(): void {
  const id = fragmentId(window.location.hash);
  if (!id) return;
  // Content mounts lazily after route transitions; retry briefly.
  const started = performance.now();
  const attempt = (): void => {
    const target = document.getElementById(id);
    if (target === null) {
      if (performance.now() - started < 2000) requestAnimationFrame(attempt);
      return;
    }
    const member = memberFor(target);
    for (const previous of document.querySelectorAll<HTMLElement>(".api-member[data-revealed]")) {
      delete previous.dataset.revealed;
    }
    if (member !== null) member.dataset.revealed = "";
    requestAnimationFrame(() => {
      (member ?? target).scrollIntoView({ block: "start" });
    });
  };
  attempt();
}

/** Window-level wiring for in-page fragment jumps (ToC, popover links). */
export function installAnchorReveal(): () => void {
  window.addEventListener("hashchange", revealAnchoredMember);
  revealAnchoredMember();
  return () => window.removeEventListener("hashchange", revealAnchoredMember);
}
