/** The build plugins also visit roots and text nodes before HTML is complete. */
export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

export function element(
  tagName: string,
  children: HastNode[],
  properties: Record<string, unknown> = {},
) {
  return { type: "element", tagName, properties, children } satisfies HastNode;
}
