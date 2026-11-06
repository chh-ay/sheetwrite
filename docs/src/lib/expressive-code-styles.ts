/**
 * Expressive Code's copy button dims its inner fill with rules such as
 * `.copy button:hover div`. A rule ending in a bare `div` after a state
 * pseudo-class makes the browser restyle every `div` under any element whose
 * hover or active state changes, which is each line of a code block when the
 * pointer enters it. The rewrite below moves those states onto a custom
 * property on the button, which only the button's own fill inherits.
 */

/** The custom property that carries the copy button's fill opacity. */
const FILL_OPACITY_PROPERTY = "--sw-copy-fill-opacity";
/** A rule that styles the copy button's `div` from a button state. */
const STATE_RULE = /([^{}]*\.copy button:(?:hover|focus|active)[^{}]*?)\{([^{}]*)\}/g;
/** The copy button's resting fill rule, whose opacity is the idle value. */
const IDLE_RULE = /\.copy button div\s*\{[^{}]*?opacity\s*:\s*([^;}]+)/;

/** Drops a trailing ` div` from each selector in a selector list. */
function withoutDivSubject(selectors: string): string | null {
  const list = selectors.split(",");
  if (!list.every((selector) => /\sdiv\s*$/.test(selector))) return null;
  return list.map((selector) => selector.replace(/\s+div\s*$/, "")).join(",");
}

/**
 * Rewrites Expressive Code's base styles so the copy button's hover, focus
 * and active fill reach only the button's own fill. Throws when the styles no
 * longer contain the rules this expects, so an Expressive Code upgrade that
 * changes them is noticed.
 */
export function scopeCopyButtonStates(css: string): string {
  const idle = IDLE_RULE.exec(css)?.[1]?.trim();
  if (idle === undefined) throw new Error("Expressive Code styles have no copy button fill rule");
  let rewritten = 0;
  const scoped = css.replace(STATE_RULE, (rule, selectors: string, body: string) => {
    const buttonSelectors = withoutDivSubject(selectors);
    if (buttonSelectors === null) return rule;
    rewritten += 1;
    return `${buttonSelectors}{${body.replace(/(^|;)\s*opacity\s*:/g, `$1${FILL_OPACITY_PROPERTY}:`)}}`;
  });
  if (rewritten === 0) throw new Error("Expressive Code styles have no copy button state rules");
  return `${scoped}\n.expressive-code .copy button div{opacity:var(${FILL_OPACITY_PROPERTY},${idle})}`;
}
