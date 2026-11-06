/** Syntax roles; each has a `--sw-code-<role>` colour token in both themes. */
export const CODE_ROLES = [
  "comment",
  "keyword",
  "function",
  "string",
  "number",
  "type",
  "property",
  "punctuation",
] as const;

/** One syntax role. */
export type CodeRole = (typeof CODE_ROLES)[number];
