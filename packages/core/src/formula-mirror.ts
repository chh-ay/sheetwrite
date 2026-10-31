// The coloured copy of a formula editor's text. A text field cannot colour
// part of its text, so formula help draws the text again in a layer over the
// field, with the references in their range colours and errors underlined,
// and makes the field's own glyphs transparent. The field keeps the caret, the
// selection and every input event; the layer ignores the pointer.

/** One run of the mirrored text that gets a colour or an error mark. */
export interface MirrorMark {
  readonly from: number;
  readonly to: number;
  readonly color?: string;
  readonly error?: boolean;
}

/** The styles that decide where glyphs fall; the layer copies them from the field. */
const GEOMETRY_STYLES = [
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "fontStretch",
  "fontVariant",
  "letterSpacing",
  "wordSpacing",
  "textAlign",
  "textIndent",
  "textTransform",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "boxSizing",
  "tabSize",
] as const;

/** Offset of `element`'s border box inside `parent`'s padding box, for absolute children. */
export function boxIn(
  element: HTMLElement,
  parent: HTMLElement,
): { left: number; top: number; width: number; height: number } {
  const box = element.getBoundingClientRect();
  const frame = parent.getBoundingClientRect();

  return {
    left: box.left - frame.left - parent.clientLeft + parent.scrollLeft,
    top: box.top - frame.top - parent.clientTop + parent.scrollTop,
    width: box.width,
    height: box.height,
  };
}

/** The element that absolute layers over `element` are positioned in. */
export function layerParent(element: HTMLElement): HTMLElement {
  return element.offsetParent instanceof HTMLElement ? element.offsetParent : document.body;
}

/** Runs of equal colour and error mark, so the layer needs one span per run. */
function runs(
  length: number,
  marks: readonly MirrorMark[],
): { from: number; to: number; color: string; error: boolean }[] {
  const colors = new Array<string>(length).fill("");
  const errors = new Array<boolean>(length).fill(false);
  for (const mark of marks) {
    for (let index = mark.from; index < Math.min(mark.to, length); index++) {
      if (mark.color !== undefined) colors[index] = mark.color;
      if (mark.error === true) errors[index] = true;
    }
  }

  const result: { from: number; to: number; color: string; error: boolean }[] = [];
  for (let index = 0; index < length; index++) {
    const color = colors[index] ?? "";
    const error = errors[index] ?? false;
    const last = result.at(-1);
    if (last !== undefined && last.color === color && last.error === error) last.to = index + 1;
    else result.push({ from: index, to: index + 1, color, error });
  }

  return result;
}

/** The coloured layer over one text field; `remove` restores the field. */
export class TextMirror {
  private readonly layer: HTMLDivElement;

  constructor(private readonly field: HTMLInputElement | HTMLTextAreaElement) {
    const style = getComputedStyle(field);
    const layer = document.createElement("div");
    layer.className = "sheetwrite-formula-mirror";
    layer.setAttribute("aria-hidden", "true");
    for (const name of GEOMETRY_STYLES) layer.style[name] = style[name];
    layer.style.color = style.color;
    layer.style.lineHeight = this.lineHeight(style);

    // The field's glyphs become transparent; its caret keeps the text colour.
    field.style.caretColor = style.color;
    field.classList.add("sheetwrite-formula-text");

    layerParent(field).appendChild(layer);
    this.layer = layer;
  }

  /** Draw `text` with `marks`, then align the layer with the field. */
  render(text: string, marks: readonly MirrorMark[]): void {
    const spans = runs(text.length, marks).map(({ from, to, color, error }) => {
      const span = document.createElement("span");
      span.textContent = text.slice(from, to);
      if (color !== "") span.style.color = color;
      if (error) span.className = "sheetwrite-formula-mirror-error";
      return span;
    });

    // A trailing newline needs a character after it to take up a line.
    this.layer.replaceChildren(...spans, text.endsWith("\n") ? " " : "");
    this.sync();
  }

  /** Follow the field's position, size and scroll. */
  sync(): void {
    const box = boxIn(this.field, layerParent(this.field));
    const style = this.layer.style;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    this.layer.scrollLeft = this.field.scrollLeft;
    this.layer.scrollTop = this.field.scrollTop;
  }

  remove(): void {
    this.layer.remove();
    this.field.classList.remove("sheetwrite-formula-text");
    this.field.style.caretColor = "";
  }

  /**
   * A one-line input centres its text vertically, which a block does only when
   * its line fills the content box; a textarea keeps its own line height.
   */
  private lineHeight(style: CSSStyleDeclaration): string {
    if (this.field instanceof HTMLTextAreaElement) return style.lineHeight;

    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    const borders =
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    return `${this.field.offsetHeight - padding - borders}px`;
  }
}
