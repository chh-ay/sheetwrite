import { ICON_ID_PREFIX } from "../icons/icon-href.js";
import type { IconName } from "../icons/icon-names.js";
import { element, type HastNode } from "./build-hast.js";
import { RELEASES, releaseDate, releaseHref } from "./releases.js";

/**
 * Content components for MDX pages: Steps,
 * Card and CardGroup, Note, Tip, Warning, Info, Check and Danger, Tabs and
 * CodeGroup, Accordion, Frame, Badge, Tooltip and Update, plus the figure
 * kit's Screenshot, Diagram, Annotated and Compare.
 *
 * Pages write them as JSX. This rehype plugin turns each into static HTML at
 * build time, so a page carries its markup and no component code. Tabs and
 * CodeGroup switch panels, so they stay components; the plugin imports them
 * only into the pages that use them.
 */

/** A hast node as MDX hands it to rehype: elements, text and JSX elements. */
interface ContentNode extends HastNode {
  name?: string;
  attributes?: JsxAttribute[];
  data?: Record<string, unknown>;
  children?: ContentNode[];
}

/** One attribute of a JSX element: a string, a `{expression}` or a bare name. */
interface JsxAttribute {
  type: string;
  name: string;
  value?: string | { type: string; value: string } | null;
}

/** Every component and the props it reads; the Markdown export maps the same names. */
export const CONTENT_COMPONENTS = {
  Steps: [],
  Step: ["title", "id", "titleSize"],
  CardGroup: ["cols"],
  Card: ["title", "href", "icon", "illustration", "cta"],
  Note: ["title"],
  Tip: ["title"],
  Warning: ["title"],
  Info: ["title"],
  Check: ["title"],
  Danger: ["title"],
  Tabs: ["sync"],
  Tab: ["title"],
  CodeGroup: ["sync"],
  AccordionGroup: [],
  Accordion: ["title", "description", "defaultOpen", "id"],
  Frame: ["caption", "hint"],
  Screenshot: ["name", "alt", "size", "eager"],
  Diagram: ["name", "alt", "caption", "width", "height"],
  Annotated: ["name", "alt", "size", "caption", "points"],
  Compare: ["before", "after"],
  Badge: ["color", "size"],
  Tooltip: ["tip", "headline", "href"],
  Update: ["version", "tags"],
} as const satisfies Record<string, readonly string[]>;

type ComponentName = keyof typeof CONTENT_COMPONENTS;

/** A callout tone: the class tone, the default title and the sprite icon. */
interface CalloutTone {
  readonly tone: string;
  readonly title: string;
  readonly icon: IconName;
}

/** The callouts, by component name; Markdown alerts (`> [!NOTE]`) map onto the same set. */
export const CALLOUTS = {
  Note: { tone: "note", title: "Note", icon: "info" },
  Info: { tone: "note", title: "Info", icon: "info" },
  Tip: { tone: "tip", title: "Tip", icon: "tip" },
  Check: { tone: "tip", title: "Done", icon: "check" },
  Warning: { tone: "warning", title: "Warning", icon: "warning" },
  Danger: { tone: "danger", title: "Caution", icon: "danger" },
} as const satisfies Record<string, CalloutTone>;

/** Badge colours, each mapped to a design-system tone. */
const BADGE_TONES: Readonly<Record<string, string>> = {
  green: "accent",
  blue: "info",
  yellow: "warning",
  red: "danger",
  violet: "violet",
  gray: "neutral",
};

/** Screenshot sizes: the capture viewport of each, in CSS pixels. */
export const SHOT_SIZES = {
  app: { width: 1200, height: 720 },
  panel: { width: 720, height: 480 },
  wide: { width: 1200, height: 480 },
  card: { width: 640, height: 400 },
} as const;

export type ShotSize = keyof typeof SHOT_SIZES;

/** Where the capture script writes screenshots, and the URL of one capture. */
export const SHOTS_PATH = "/figures/shots/";
export function shotUrl(name: string, theme: "light" | "dark", scale: 1 | 2): string {
  return `${SHOTS_PATH}${name}-${theme}@${scale}x.avif`;
}

/** Where diagram and illustration SVG files live. */
export const DIAGRAMS_PATH = "/figures/diagrams/";
export const ILLUSTRATIONS_PATH = "/figures/illustrations/";

const text = (value: string): ContentNode => ({ type: "text", value });

function attribute(node: ContentNode, name: string): string | undefined {
  const found = node.attributes?.find((item) => item.name === name);
  if (found === undefined) return undefined;
  if (found.value === null || found.value === undefined) return "true";
  return typeof found.value === "string" ? found.value : found.value.value.trim();
}

function required(node: ContentNode, name: string): string {
  const value = attribute(node, name);
  if (value === undefined || value === "") {
    throw new Error(`<${node.name}> needs a "${name}" attribute`);
  }
  return value;
}

/** A `{["a", "b"]}` list attribute, or a comma-separated string. */
function listAttribute(node: ContentNode, name: string): string[] {
  const value = attribute(node, name);
  if (value === undefined) return [];
  if (value.startsWith("[")) return JSON.parse(value) as string[];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** A sprite icon, drawn by the page's inline symbol sheet. */
export function spriteIcon(name: string, size: "sm" | "md" | "lg" = "sm"): ContentNode {
  return element("svg", [element("use", [], { href: `#${ICON_ID_PREFIX}${name}` })], {
    className: ["sw-icon"],
    dataSize: size,
    ariaHidden: "true",
    focusable: "false",
  });
}

/** The anchor of a heading or entry, as rehype-slug would make it. */
export function anchorOf(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * A static callout: the tone's icon beside the body,
 * with a title line only when the page gives one. The tone's name labels it
 * for assistive technology.
 */
export function callout(tone: CalloutTone, body: HastNode[], title?: string): HastNode {
  return element(
    "aside",
    [
      spriteIcon(tone.icon, "md"),
      element(
        "div",
        [
          ...(title === undefined
            ? []
            : [element("p", [text(title)], { className: ["sw-callout__title"] })]),
          ...body,
        ],
        { className: ["sw-callout__body"] },
      ),
    ],
    { className: ["sw-callout"], dataTone: tone.tone, ariaLabel: title ?? tone.title },
  );
}

function steps(node: ContentNode): ContentNode {
  const items = (node.children ?? []).filter((child) => child.name === "Step");
  return element("ol", items.map(step), { className: ["sw-steps"] });
}

function step(node: ContentNode): ContentNode {
  const title = required(node, "title");
  const level = attribute(node, "titleSize") === "h2" ? "h2" : "h3";
  const id = attribute(node, "id");
  return element(
    "li",
    [
      element(level, [text(title)], { className: ["sw-step__title"], ...(id ? { id } : {}) }),
      element("div", node.children ?? [], { className: ["sw-step__body"] }),
    ],
    { className: ["sw-step"] },
  );
}

function cardGroup(node: ContentNode): ContentNode {
  const cols = Number(attribute(node, "cols") ?? "2");
  if (![1, 2, 3, 4].includes(cols)) throw new Error("<CardGroup cols> is 1, 2, 3 or 4");
  return element("div", node.children ?? [], {
    className: ["sw-card-group"],
    dataCols: String(cols),
  });
}

function card(node: ContentNode): ContentNode {
  const title = required(node, "title");
  const href = attribute(node, "href");
  const icon = attribute(node, "icon");
  const illustration = attribute(node, "illustration");
  const cta = attribute(node, "cta");
  const art =
    illustration === undefined
      ? icon === undefined
        ? []
        : [element("span", [spriteIcon(icon, "lg")], { className: ["sw-card__icon"] })]
      : [
          element(
            "svg",
            [element("use", [], { href: `${ILLUSTRATIONS_PATH}${illustration}.svg#art` })],
            {
              className: ["sw-card__art"],
              viewBox: "0 0 320 160",
              ariaHidden: "true",
              focusable: "false",
            },
          ),
        ];
  const content = [
    ...art,
    element("span", [text(title)], { className: ["sw-card__title"] }),
    element("div", node.children ?? [], { className: ["sw-card__body"] }),
    ...(cta === undefined || href === undefined
      ? []
      : [element("span", [text(cta), spriteIcon("arrow-right")], { className: ["sw-card__cta"] })]),
  ];
  return href === undefined
    ? element("div", content, { className: ["sw-doc-card"] })
    : element("a", content, { className: ["sw-doc-card"], href });
}

/** Paragraph wrappers MDX adds around inline content of block components. */
function unwrapParagraph(children: ContentNode[]): ContentNode[] {
  const elements = children.filter((child) => !(child.type === "text" && !child.value?.trim()));
  const only = elements[0];
  return elements.length === 1 && only?.tagName === "p" ? (only.children ?? []) : children;
}

function accordion(node: ContentNode): ContentNode {
  const title = required(node, "title");
  const description = attribute(node, "description");
  const open = attribute(node, "defaultOpen") === "true";
  const id = attribute(node, "id") ?? anchorOf(title);
  return element(
    "details",
    [
      element(
        "summary",
        [
          element("span", [text(title)], { className: ["sw-accordion__title"] }),
          ...(description === undefined
            ? []
            : [element("span", [text(description)], { className: ["sw-accordion__description"] })]),
          spriteIcon("chevron-down"),
        ],
        {},
      ),
      element("div", node.children ?? [], { className: ["sw-accordion__body"] }),
    ],
    { className: ["sw-accordion"], id, ...(open ? { open: true } : {}) },
  );
}

function accordionGroup(node: ContentNode): ContentNode {
  return element("div", node.children ?? [], { className: ["sw-accordion-group"] });
}

function frame(node: ContentNode): ContentNode {
  const caption = attribute(node, "caption");
  const hint = attribute(node, "hint");
  return element(
    "figure",
    [
      ...(hint === undefined
        ? []
        : [element("p", [text(hint)], { className: ["sw-frame__hint"] })]),
      element("div", node.children ?? [], { className: ["sw-frame__media"] }),
      ...(caption === undefined ? [] : [element("figcaption", [text(caption)], {})]),
    ],
    { className: ["sw-frame"] },
  );
}

/** One theme's capture: 1× and 2× AVIF, lazy, so only the shown theme's file loads. */
function themedShot(
  name: string,
  theme: "light" | "dark",
  alt: string,
  size: ShotSize,
  eager: boolean,
) {
  const { width, height } = SHOT_SIZES[size];
  return element("img", [], {
    className: ["sw-shot", `sw-shot--${theme}`],
    src: shotUrl(name, theme, 1),
    srcSet: `${shotUrl(name, theme, 1)} 1x, ${shotUrl(name, theme, 2)} 2x`,
    alt,
    width,
    height,
    loading: eager ? "eager" : "lazy",
    decoding: "async",
  });
}

/**
 * A screenshot from the committed capture script, in the light and the dark
 * theme. The hidden theme's image is `display: none` and lazy, so it never
 * loads; a theme switch loads the other one then.
 */
function screenshot(node: ContentNode): ContentNode {
  const name = required(node, "name");
  const alt = required(node, "alt");
  const size = (attribute(node, "size") ?? "app") as ShotSize;
  if (!(size in SHOT_SIZES))
    throw new Error(`<Screenshot size> is one of ${Object.keys(SHOT_SIZES)}`);
  const eager = attribute(node, "eager") === "true";
  return element(
    "span",
    [themedShot(name, "light", alt, size, eager), themedShot(name, "dark", "", size, eager)],
    { className: ["sw-shots"] },
  );
}

/**
 * A diagram from `public/figures/diagrams/<name>.svg`, drawn with design-system
 * custom properties, so one cached file follows the page theme.
 */
function diagram(node: ContentNode): ContentNode {
  const name = required(node, "name");
  const alt = required(node, "alt");
  const caption = attribute(node, "caption");
  const width = required(node, "width");
  const height = required(node, "height");
  const titleId = `diagram-${name}`;
  const svg = element(
    "svg",
    [
      element("title", [text(alt)], { id: titleId }),
      element("use", [], { href: `${DIAGRAMS_PATH}${name}.svg#fig` }),
    ],
    {
      className: ["sw-diagram"],
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      ariaLabelledBy: titleId,
    },
  );
  return element(
    "figure",
    [
      element("div", [svg], { className: ["sw-frame__media"] }),
      ...(caption === undefined ? [] : [element("figcaption", [text(caption)], {})]),
    ],
    { className: ["sw-frame", "sw-frame--diagram"] },
  );
}

/**
 * A screenshot with numbered markers. `points` lists `[x, y]` positions in
 * percent of the image; the component's children are the list the numbers
 * refer to, in the same order.
 */
function annotated(node: ContentNode): ContentNode {
  const points = JSON.parse(required(node, "points")) as Array<[number, number]>;
  const caption = attribute(node, "caption");
  const markers = points.map(([x, y], index) =>
    element("span", [text(String(index + 1))], {
      className: ["sw-annotated__marker"],
      style: `left:${x}%;top:${y}%`,
      ariaHidden: "true",
    }),
  );
  const list = (node.children ?? []).find((child) => child.tagName === "ol");
  if (list === undefined)
    throw new Error("<Annotated> needs a numbered list of what each marker shows");
  list.properties = { ...list.properties, className: ["sw-annotated__list"] };
  return element(
    "figure",
    [
      element("div", [screenshot(node), ...markers], {
        className: ["sw-frame__media", "sw-annotated__media"],
      }),
      list,
      ...(caption === undefined ? [] : [element("figcaption", [text(caption)], {})]),
    ],
    { className: ["sw-frame", "sw-annotated"] },
  );
}

/** Two panes side by side, labelled; they stack on narrow screens. */
function compare(node: ContentNode): ContentNode {
  const labels = [attribute(node, "before") ?? "Before", attribute(node, "after") ?? "After"];
  const panes = (node.children ?? []).filter(
    (child) => child.type === "element" || child.type === "mdxJsxFlowElement",
  );
  if (panes.length !== 2) throw new Error("<Compare> holds exactly two blocks: before, then after");
  return element(
    "div",
    panes.map((pane, index) =>
      element(
        "div",
        [element("p", [text(labels[index] ?? "")], { className: ["sw-compare__label"] }), pane],
        { className: ["sw-compare__pane"], dataSide: index === 0 ? "before" : "after" },
      ),
    ),
    { className: ["sw-compare"] },
  );
}

function badge(node: ContentNode): ContentNode {
  const color = attribute(node, "color") ?? "gray";
  const tone = BADGE_TONES[color];
  if (tone === undefined) {
    throw new Error(`<Badge color> is one of ${Object.keys(BADGE_TONES).join(", ")}`);
  }
  return element("span", unwrapParagraph(node.children ?? []), {
    className: ["sw-badge"],
    dataTone: tone,
    dataSize: attribute(node, "size") ?? "md",
  });
}

let tooltipCount = 0;

/** A term with a definition shown on hover and focus, by CSS. */
function tooltip(node: ContentNode): ContentNode {
  const tip = required(node, "tip");
  const headline = attribute(node, "headline");
  const href = attribute(node, "href");
  const id = `tooltip-${(tooltipCount += 1)}`;
  const term = unwrapParagraph(node.children ?? []);
  const bubble = element(
    "span",
    [
      ...(headline === undefined ? [] : [element("strong", [text(headline)], {})]),
      element("span", [text(tip)], {}),
    ],
    { className: ["sw-tooltip__tip"], role: "tooltip", id },
  );
  const trigger =
    href === undefined
      ? element("span", term, { className: ["sw-tooltip__term"], tabIndex: 0, ariaDescribedBy: id })
      : element("a", term, { className: ["sw-tooltip__term"], href, ariaDescribedBy: id });
  return element("span", [trigger, bubble], { className: ["sw-tooltip"] });
}

/**
 * A changelog entry for one release: its date (or "Next"), version and
 * summary come from `lib/releases.ts`, so the page, the release list and the
 * RSS feed read one registry. The body holds the entry's figures and notes.
 */
function update(node: ContentNode): ContentNode {
  const version = required(node, "version");
  const release = RELEASES.find((entry) => entry.version === version);
  if (release === undefined)
    throw new Error(`<Update version="${version}"> is not in lib/releases.ts`);
  const tags = listAttribute(node, "tags");
  const id = anchorOf(version);
  const when =
    release.unreleased === true
      ? element("span", [text("Next release")], { className: ["sw-update__date"] })
      : element("time", [text(releaseDate(release))], {
          className: ["sw-update__date"],
          dateTime: release.date,
        });
  const meta = element(
    "div",
    [
      when,
      element("a", [text(release.unreleased === true ? `${version} (next)` : version)], {
        className: ["sw-update__version"],
        href: releaseHref(version),
      }),
      ...(tags.length === 0
        ? []
        : [
            element(
              "span",
              tags.map((tag) =>
                element("span", [text(tag)], {
                  className: ["sw-badge"],
                  dataTone: "neutral",
                  dataSize: "sm",
                }),
              ),
              { className: ["sw-update__tags"] },
            ),
          ]),
    ],
    { className: ["sw-update__meta"] },
  );
  return element(
    "section",
    [
      meta,
      element(
        "div",
        [
          element("h2", [text(release.summary)], { className: ["sw-update__title"], id }),
          ...(node.children ?? []),
        ],
        { className: ["sw-update__body"] },
      ),
    ],
    { className: ["sw-update"], ariaLabelledBy: id },
  );
}

const STATIC: Partial<Record<ComponentName, (node: ContentNode) => ContentNode>> = {
  Steps: steps,
  CardGroup: cardGroup,
  Card: card,
  AccordionGroup: accordionGroup,
  Accordion: accordion,
  Frame: frame,
  Screenshot: screenshot,
  Diagram: diagram,
  Annotated: annotated,
  Compare: compare,
  Badge: badge,
  Tooltip: tooltip,
  Update: update,
};

const jsxAttribute = (name: string, value: string): JsxAttribute => ({
  type: "mdxJsxAttribute",
  name,
  value,
});

/** The `title="…"` of a fence's meta, and the meta without it. */
function fenceTitle(pre: ContentNode): string {
  const code = pre.children?.find((child) => child.tagName === "code");
  const meta = typeof code?.data?.meta === "string" ? code.data.meta : "";
  const match = /\btitle="([^"]*)"/.exec(meta);
  if (code === undefined || match?.[1] === undefined) {
    throw new Error('Each fence in <CodeGroup> needs a title="…", which names its tab');
  }
  code.data = { ...code.data, meta: meta.replace(match[0], "").trim() };
  return match[1];
}

/**
 * A CodeGroup becomes Tabs with one Tab per fence, titled by the fence's
 * title, drawn as the code block's title bar. The fences stay children, so
 * Expressive Code and the "Try it" step see ordinary code blocks.
 */
function codeGroup(node: ContentNode): ContentNode {
  const fences = (node.children ?? []).filter((child) => child.tagName === "pre");
  const sync = attribute(node, "sync");
  return {
    type: "mdxJsxFlowElement",
    name: "Tabs",
    attributes: [
      jsxAttribute("variant", "code"),
      jsxAttribute("label", "Code examples"),
      ...(sync === undefined ? [] : [jsxAttribute("sync", sync)]),
    ],
    children: fences.map((pre) => ({
      type: "mdxJsxFlowElement",
      name: "Tab",
      attributes: [jsxAttribute("title", fenceTitle(pre))],
      children: [pre],
    })),
  };
}

/** The module that renders Tabs on the pages that use them, from the docs root. */
const TABS_MODULE = "/src/components/Tabs.tsx";

/** `import { Tab, Tabs } from "<Tabs.tsx>"`, as an MDX ESM node. */
function tabsImport(): ContentNode {
  const specifiers = ["Tab", "Tabs"].map((name) => ({
    type: "ImportSpecifier",
    imported: { type: "Identifier", name },
    local: { type: "Identifier", name },
  }));
  return {
    type: "mdxjsEsm",
    value: "",
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers,
            source: { type: "Literal", value: TABS_MODULE, raw: JSON.stringify(TABS_MODULE) },
          },
        ],
      },
    },
  };
}

function isComponent(node: ContentNode): node is ContentNode & { name: ComponentName } {
  return (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    typeof node.name === "string" &&
    node.name in CONTENT_COMPONENTS
  );
}

/**
 * The rehype plugin: runs before Expressive Code, so fences inside a tab or a
 * step are highlighted as usual, and before rehype-slug, so step titles get
 * anchors and appear in "On this page".
 */
export function contentComponents() {
  return (tree: ContentNode): void => {
    let usesTabs = false;
    const visit = (node: ContentNode): ContentNode => {
      if (node.children !== undefined) node.children = node.children.map(visit);
      if (!isComponent(node)) return node;
      if (node.name === "Tabs" || node.name === "Tab") {
        usesTabs = true;
        return node;
      }
      if (node.name === "CodeGroup") {
        usesTabs = true;
        return codeGroup(node);
      }
      const tone = node.name in CALLOUTS ? CALLOUTS[node.name as keyof typeof CALLOUTS] : undefined;
      if (tone !== undefined) return callout(tone, node.children ?? [], attribute(node, "title"));
      const render = STATIC[node.name];
      // Step renders inside Steps.
      return render === undefined ? node : render(node);
    };
    visit(tree);
    if (usesTabs) tree.children = [tabsImport(), ...(tree.children ?? [])];
  };
}
