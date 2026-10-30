const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Attribute values that an SVG builder writes as strings. */
export type SvgAttributes = Readonly<Record<string, string | number>>;

/** Creates SVG elements in one document, so a chart can draw into an iframe's host. */
export class SvgBuilder {
  constructor(private readonly document: Document) {}

  element<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: SvgAttributes,
    parent?: Element,
  ): SVGElementTagNameMap[K] {
    const node = this.document.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    parent?.append(node);
    return node;
  }

  text(content: string, attributes: SvgAttributes, parent: Element): SVGTextElement {
    const node = this.element("text", attributes, parent);
    node.textContent = content;
    return node;
  }
}
