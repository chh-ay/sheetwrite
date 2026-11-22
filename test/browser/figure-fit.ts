/**
 * Fit checks for the docs' blueprint figures (docs/src/art/blueprint.tsx) and
 * the section card illustrations (docs/public/figures/illustrations), run in
 * the page by docs-figure-fit.spec.ts. In every visible picture:
 *
 * - every box, connector and label sits inside the picture with at least
 *   `framePadding` CSS pixels to its edge, and the drawing is centred: the
 *   left and right padding of its boxes and connectors, and their top and
 *   bottom padding, differ by at most CENTRE_TOLERANCE pixels (a label must
 *   not stick out past them, or the drawing it widens shows off centre);
 * - each box's text is centred in the box to within TEXT_CENTRE_TOLERANCE
 *   pixels, and keeps its `inset` to the border (in drawing units: CSS
 *   pixels at full size) on every side;
 * - no two boxes overlap or sit closer than `gap` drawing units, and no
 *   connector's label covers a box.
 *
 * Diagrams and the smaller card pictures each have their own limits, from
 * the kit's spacing scale (SPACING in blueprint.tsx). Section card
 * illustrations are checked in their own units: the drawing centred in its
 * frame with at least ILLUSTRATION.padding to each edge, and no two boxes
 * closer than ILLUSTRATION.gap.
 *
 * Everything runs inside one function, because Playwright sends it to the
 * page as source.
 */

/** One defect in one picture. */
export interface FitDefect {
  readonly picture: string;
  readonly problem: string;
}

export async function findFigureFitDefects(): Promise<FitDefect[]> {
  /** Limits for diagrams and card pictures: frame padding in CSS pixels, inset and gap in drawing units. */
  const DIAGRAM = { framePadding: 16, inset: { x: 15.5, y: 15.5 }, gap: 23.5 };
  const CARD = { framePadding: 8, inset: { x: 11.5, y: 7.5 }, gap: 11.5 };
  /** How far the drawing may sit off centre, in CSS pixels. */
  const CENTRE_TOLERANCE = 1.5;
  /** How far a box's text may sit off the box's centre, in CSS pixels. */
  const TEXT_CENTRE_TOLERANCE = 1;
  /** An illustration's drawing to its frame's edge, and between its boxes, in its own units. */
  const ILLUSTRATION = { padding: 16, gap: 16 };
  /** Rects smaller than this in an illustration are marks or cells, not boxes. */
  const MIN_BOX = { width: 24, height: 16 };

  interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  const round = (value: number) => Math.round(value * 10) / 10;
  const union = (boxes: readonly Box[]): Box | undefined => {
    if (boxes.length === 0) return undefined;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  /** How far apart two boxes are; negative when they overlap. */
  const gap_between = (a: Box, b: Box) =>
    Math.max(
      b.x - (a.x + a.width),
      a.x - (b.x + b.width),
      b.y - (a.y + a.height),
      a.y - (b.y + b.height),
    );
  const contains = (outer: Box, inner: Box) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;
  const screen_box = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  /** An element's box in its picture's units (the viewBox), through any transforms between them. */
  const user_box = (svg: SVGSVGElement, element: SVGGraphicsElement): Box => {
    const local = element.getBBox();
    const to_picture = svg
      .getScreenCTM()
      ?.inverse()
      .multiply(element.getScreenCTM() ?? new DOMMatrix());
    if (to_picture === undefined) return local;
    const corners = [
      new DOMPoint(local.x, local.y),
      new DOMPoint(local.x + local.width, local.y + local.height),
    ].map((corner) => corner.matrixTransform(to_picture));
    const [a, b] = corners as [DOMPoint, DOMPoint];
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  };

  function name_of(svg: SVGSVGElement): string {
    const title = svg.querySelector("title")?.textContent;
    if (title) return title;
    const holder = svg.closest(".sw-card, a, section, header, article");
    const heading = holder
      ?.querySelector("h1, h2, h3, h4, strong, .sw-card__title")
      ?.textContent?.trim();
    return `the ${heading ?? "unnamed"} picture`;
  }

  function check_blueprint(svg: SVGSVGElement, defects: FitDefect[]) {
    const picture = name_of(svg);
    const report = (problem: string) => defects.push({ picture, problem });
    const limits = svg.classList.contains("sw-blueprint--card") ? CARD : DIAGRAM;
    const frame = screen_box(svg);
    const nodes = [...svg.querySelectorAll<SVGGElement>(".bp-node")];
    const boxes = nodes.map((node) => ({
      node,
      element: node.querySelector<SVGRectElement>(".bp-node__box"),
      isLane: node.dataset.tone === "lane",
    }));
    const drawn = [
      ...svg.querySelectorAll<SVGGraphicsElement>(".bp-node__box, .bp-edge, .bp-edge__label"),
    ];
    const label = (element: Element) =>
      element.textContent?.trim() ||
      element.closest(".bp-node")?.querySelector("text")?.textContent ||
      element.tagName;

    // Inside the picture, with padding, and centred.
    for (const element of drawn) {
      const box = screen_box(element);
      const room = Math.min(
        box.x - frame.x,
        box.y - frame.y,
        frame.x + frame.width - (box.x + box.width),
        frame.y + frame.height - (box.y + box.height),
      );
      if (room < limits.framePadding) {
        report(`"${label(element)}" sits ${round(room)} px from the picture's edge`);
      }
    }
    const drawing = union(
      drawn.filter((element) => !element.classList.contains("bp-edge__label")).map(screen_box),
    );
    if (drawing !== undefined) {
      const left = drawing.x - frame.x;
      const right = frame.x + frame.width - (drawing.x + drawing.width);
      const top = drawing.y - frame.y;
      const bottom = frame.y + frame.height - (drawing.y + drawing.height);
      if (Math.abs(left - right) > CENTRE_TOLERANCE || Math.abs(top - bottom) > CENTRE_TOLERANCE) {
        report(
          `the drawing is off centre: padding left ${round(left)}, right ${round(right)}, top ${round(top)}, bottom ${round(bottom)} px`,
        );
      }
    }

    // Each box's text centred in it, inset from its border.
    const { inset } = limits;
    for (const { node, element, isLane: is_lane } of boxes) {
      if (element === null || is_lane) continue;
      const box = user_box(svg, element);
      const texts = [...node.querySelectorAll<SVGTextElement>(":scope > text")];
      const content = [...texts, ...node.querySelectorAll<SVGGElement>(":scope > .bp-sheet")];
      const block = union(content.map((each) => user_box(svg, each)));
      if (block === undefined) continue;
      const name = texts[0]?.textContent ?? "a box";
      const room = {
        left: block.x - box.x,
        right: box.x + box.width - (block.x + block.width),
        top: block.y - box.y,
        bottom: box.y + box.height - (block.y + block.height),
      };
      if (Math.min(room.left, room.right) < inset.x || Math.min(room.top, room.bottom) < inset.y) {
        report(
          `"${name}" is ${round(Math.min(room.left, room.right))} from its box's side and ${round(Math.min(room.top, room.bottom))} from its top or bottom`,
        );
      }
      // Sheets are laid out on a grid, not centred as text; the centring check is for text.
      if (content.length !== texts.length || texts.length === 0) continue;
      const text = union(texts.map(screen_box));
      const shown = screen_box(element);
      if (text === undefined) continue;
      const dx = text.x + text.width / 2 - (shown.x + shown.width / 2);
      const dy = text.y + text.height / 2 - (shown.y + shown.height / 2);
      if (Math.abs(dx) > TEXT_CENTRE_TOLERANCE || Math.abs(dy) > TEXT_CENTRE_TOLERANCE) {
        report(
          `"${name}" sits ${round(dx)} px across and ${round(dy)} px down from its box's centre`,
        );
      }
    }

    // Boxes apart; labels clear of boxes.
    const solid = boxes
      .filter(({ element, isLane: is_lane }) => element !== null && !is_lane)
      .map(({ node, element }) => ({
        name: node.querySelector("text")?.textContent ?? "a box",
        box: user_box(svg, element as SVGRectElement),
      }));
    solid.forEach((a, index) => {
      for (const b of solid.slice(index + 1)) {
        if (contains(a.box, b.box) || contains(b.box, a.box)) continue;
        const gap = gap_between(a.box, b.box);
        if (gap < limits.gap) {
          report(
            gap < 0
              ? `boxes "${a.name}" and "${b.name}" overlap`
              : `boxes "${a.name}" and "${b.name}" are ${round(gap)} apart`,
          );
        }
      }
    });
    for (const text of svg.querySelectorAll<SVGTextElement>(".bp-edge__label")) {
      const box = user_box(svg, text);
      for (const { name, box: node } of solid) {
        if (gap_between(box, node) < 0)
          report(`the label "${text.textContent}" covers the box "${name}"`);
      }
    }
  }

  /** A section card illustration, drawn into a probe as art-geometry.ts does. */
  function check_illustration(probe: SVGSVGElement, file: string, defects: FitDefect[]) {
    const report = (problem: string) => defects.push({ picture: file, problem });
    const view = probe.viewBox.baseVal;
    const dots = (element: Element) =>
      element instanceof SVGPathElement &&
      /^(M[\d.]+ [\d.]+h0)+$/.test((element.getAttribute("d") ?? "").replace(/\s+(?=M)/g, ""));
    const shapes = [
      ...probe.querySelectorAll<SVGGraphicsElement>(
        "rect, path, circle, ellipse, line, polygon, text",
      ),
    ]
      .filter((element) => !dots(element))
      .map((element) => ({ element, box: user_box(probe, element) }))
      .filter(({ box }) => box.width > 0 || box.height > 0);
    const drawing = union(shapes.map(({ box }) => box));
    if (drawing === undefined) return;
    const left = drawing.x - view.x;
    const right = view.x + view.width - (drawing.x + drawing.width);
    const top = drawing.y - view.y;
    const bottom = view.y + view.height - (drawing.y + drawing.height);
    if (Math.min(left, right, top, bottom) < ILLUSTRATION.padding - 0.5) {
      report(`the drawing is ${round(Math.min(left, right, top, bottom))} from the frame's edge`);
    }
    if (Math.abs(left - right) > 1 || Math.abs(top - bottom) > 1) {
      report(
        `the drawing is off centre: padding left ${round(left)}, right ${round(right)}, top ${round(top)}, bottom ${round(bottom)}`,
      );
    }
    const boxes = shapes.filter(
      ({ element, box }) =>
        element.tagName === "rect" && box.width >= MIN_BOX.width && box.height >= MIN_BOX.height,
    );
    boxes.forEach((a, index) => {
      for (const b of boxes.slice(index + 1)) {
        if (contains(a.box, b.box) || contains(b.box, a.box)) continue;
        const gap = gap_between(a.box, b.box);
        if (gap < ILLUSTRATION.gap) {
          report(
            `boxes at (${round(a.box.x)}, ${round(a.box.y)}) and (${round(b.box.x)}, ${round(b.box.y)}) are ${round(gap)} apart`,
          );
        }
      }
    });
  }

  const defects: FitDefect[] = [];
  const visible = (element: Element) => element.getBoundingClientRect().width > 0;
  for (const svg of document.querySelectorAll<SVGSVGElement>("svg.sw-blueprint")) {
    if (visible(svg)) check_blueprint(svg, defects);
  }
  const files = new Map<string, SVGUseElement>();
  for (const use of document.querySelectorAll<SVGUseElement>("svg use")) {
    const href = use.getAttribute("href") ?? "";
    if (href.startsWith("/figures/illustrations/") && !files.has(href)) files.set(href, use);
  }
  for (const [href, use] of files) {
    const [file = href] = href.split("#");
    const shown = use.ownerSVGElement;
    if (shown === null || !visible(shown)) continue;
    const source = await (await fetch(file)).text();
    const symbol = new DOMParser().parseFromString(source, "image/svg+xml").querySelector("symbol");
    if (symbol === null) continue;
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    probe.setAttribute("viewBox", symbol.getAttribute("viewBox") ?? "0 0 320 160");
    probe.style.cssText =
      "position:absolute;left:0;top:0;width:320px;height:160px;visibility:hidden";
    for (const child of [...symbol.childNodes]) probe.append(document.importNode(child, true));
    shown.after(probe);
    check_illustration(probe, file, defects);
    probe.remove();
  }
  return defects;
}
