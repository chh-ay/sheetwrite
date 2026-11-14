import publicApi from "@docs/generated/public-api.json" with { type: "json" };

import {
  type ApiManifestShape,
  apiMemberReferences,
  apiReferenceRoutes,
  apiSymbolPreviews,
} from "../../lib/api-reference-routes.js";

/*
 * The calls a showcase snippet makes, for the aside beside its code: each
 * call's API reference page and the first sentence of its docs. Server only:
 * the showcase page renders on the server, and the manifest stays out of the
 * scripts the page loads.
 */

/** One call listed beside a showcase's code. */
export interface ShowcaseCall {
  /** The call as the snippet writes it: `initSheetwrite`, `grid.setPivot`. */
  readonly label: string;
  /** The Sheetwrite symbol it names; code tokens carry it as `data-sw-symbol`. */
  readonly symbol: string;
  readonly href?: string;
  /** One sentence: what the call does. */
  readonly summary?: string;
}

/** At most this many calls are listed beside the code. */
const LISTED_CALLS = 8;
/** A call the snippet makes: a Grid method, a factory, an init, a constructed class, or a subscription. */
const CALL =
  /\b(?:grid\.[a-zA-Z.]+|create[A-Z][A-Za-z]+|init[A-Z][A-Za-z]+|new [A-Z][A-Za-z]+|[a-z]+\.(?:subscribe|on|ready))(?=\()/g;
const BUILT_IN = /^new (?:Promise|Map|Set|Error|URL|Date|Uint8Array)$/;

const manifest = publicApi as ApiManifestShape;
const routes = apiReferenceRoutes(manifest);
const previews = apiSymbolPreviews(manifest);
const members = apiMemberReferences(manifest);

/** The first sentence of a doc comment, with `{@link X}` written as `X`. */
function firstSentence(documentation: string | undefined): string | undefined {
  const lead = documentation
    ?.split(/\n\s*\n|\n@/)[0]
    ?.replace(/\{@link(?:code|plain)?\s+([^}|\s]+)(?:[\s|][^}]*)?\}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!lead) return undefined;
  return /^[\s\S]*?[.!?](?=\s|$)/.exec(lead)?.[0] ?? lead;
}

/**
 * The calls in `code`, in first-use order. `notes` replaces a call's summary
 * with what it does in this example.
 */
export function showcaseCalls(
  code: string,
  notes: Readonly<Record<string, string>> = {},
): ShowcaseCall[] {
  return [...new Set(code.match(CALL) ?? [])]
    .filter((call) => !BUILT_IN.test(call))
    .map((call) => call.replace(/^new /, ""))
    .slice(0, LISTED_CALLS)
    .map((label) => {
      const symbol = label.slice(label.lastIndexOf(".") + 1);
      const member = label.includes(".") ? members.get(symbol) : undefined;
      const href = member?.route ?? routes.get(symbol);
      const summary =
        notes[label] ?? firstSentence(member ? member.docs : previews.get(symbol)?.docs);
      return { label, symbol, href, summary };
    });
}
