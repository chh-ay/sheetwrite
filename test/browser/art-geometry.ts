/**
 * Geometry checks for the docs art (docs/src/art and the section card
 * pictures in docs/public/figures/illustrations), run in the page by the
 * browser specs. In every picture:
 *
 * - every arrow starts and ends on a box edge, and arrowheads into one box
 *   don't pile up;
 * - no text runs out of the box it sits in, and nothing is clipped by the
 *   drawing's edges;
 * - no two boxes partly overlap, and a shape drawn over another either stays
 *   clear of it or hides what is under it with a fill;
 * - nothing inside a rounded frame pokes out of its rounded corners;
 * - text reads at 4.5:1 or more against the shape or page behind it.
 *
 * Coordinates are the picture's own units (its viewBox), so the checks don't
 * depend on the width the page shows it at. Everything runs inside one
 * function, because Playwright sends it to the page as source.
 */

/** One defect in one picture. */
export interface ArtDefect {
  readonly picture: string;
  readonly problem: string;
}

/** Checks every drawn picture on the page; section card pictures are loaded from their files. */
export async function findArtDefects(): Promise<ArtDefect[]> {
  /** How far a point may sit from an edge and still be on it, in picture units. */
  const TOLERANCE = 1.5;
  /** Arrowheads closer than this into one box overlap. */
  const HEAD_SPACING = 8;
  /** The arrowhead the art draws: two strokes of this length from the tip. */
  const HEAD_LENGTH = 6;
  /** Rects smaller than this are marks, swatches or cells, not boxes. */
  const MIN_BOX = { width: 24, height: 16 };
  /** A bent connector whose legs sit closer than this is a jog: the boxes should line up instead. */
  const MIN_JOG = 8;
  /** Shapes smaller than this are dots and ticks; they can't hide anything. */
  const MIN_SHAPE = 8;
  /** A frame with at least this corner radius has corners a shape can poke out of. */
  const MIN_FRAME_RADIUS = 4;
  /** WCAG AA for body-size text; every label in the art is body size or smaller. */
  const MIN_CONTRAST = 4.5;

  interface Point {
    x: number;
    y: number;
  }
  interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  const round = (value: number) => Math.round(value * 10) / 10;
  const at = (point: Point) => `(${round(point.x)}, ${round(point.y)})`;
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  /** The vertices of each subpath of a path's `d`, with curves reduced to their end points. */
  function subpaths(d: string): Point[][] {
    const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
    const counts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
    const result: Point[][] = [];
    let current: Point = { x: 0, y: 0 };
    let start = current;
    let command = "M";
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index] ?? "";
      if (/[a-z]/i.test(token)) {
        command = token;
        index += 1;
        if (command === "Z" || command === "z") {
          current = start;
          result.at(-1)?.push(current);
          continue;
        }
      }
      const upper = command.toUpperCase();
      const relative = command !== upper;
      const values = Array.from({ length: counts[upper] ?? 2 }, () => Number(tokens[index++]));
      if (upper === "H") {
        current = { x: (relative ? current.x : 0) + (values[0] ?? 0), y: current.y };
      } else if (upper === "V") {
        current = { x: current.x, y: (relative ? current.y : 0) + (values[0] ?? 0) };
      } else {
        const x = values.at(-2) ?? 0;
        const y = values.at(-1) ?? 0;
        current = relative ? { x: current.x + x, y: current.y + y } : { x, y };
      }
      if (upper === "M") {
        start = current;
        result.push([current]);
        // Coordinates after an M without a new command are line-tos.
        command = relative ? "l" : "L";
      } else {
        result.at(-1)?.push(current);
      }
    }
    return result;
  }

  /** The distance from a point to a box's outline. */
  function toEdge(point: Point, box: Box): number {
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
    if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
    return Math.min(
      point.x - box.x,
      box.x + box.width - point.x,
      point.y - box.y,
      box.y + box.height - point.y,
    );
  }

  function toSegment(point: Point, a: Point, b: Point): number {
    const length = distance(a, b) ** 2;
    if (length === 0) return distance(point, a);
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length),
    );
    return distance(point, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }

  const contains = (outer: Box, inner: Box) =>
    inner.x >= outer.x - TOLERANCE &&
    inner.y >= outer.y - TOLERANCE &&
    inner.x + inner.width <= outer.x + outer.width + TOLERANCE &&
    inner.y + inner.height <= outer.y + outer.height + TOLERANCE;

  /** The overlap of two boxes, or undefined when they only touch. */
  function overlap(a: Box, b: Box): { width: number; height: number } | undefined {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > TOLERANCE && height > TOLERANCE ? { width, height } : undefined;
  }

  /** An element's box in the picture's units, through any transforms between them. */
  function boxIn(svg: SVGSVGElement, element: SVGGraphicsElement): Box {
    const local = element.getBBox();
    const toPicture = svg
      .getScreenCTM()
      ?.inverse()
      .multiply(element.getScreenCTM() ?? new DOMMatrix());
    if (toPicture === undefined) return local;
    const corners = [
      new DOMPoint(local.x, local.y),
      new DOMPoint(local.x + local.width, local.y),
      new DOMPoint(local.x, local.y + local.height),
      new DOMPoint(local.x + local.width, local.y + local.height),
    ].map((corner) => corner.matrixTransform(toPicture));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  /** A path made only of zero-length strokes: a dot grid, which hides nothing and needs nothing hidden. */
  const isDotGrid = (path: SVGPathElement) =>
    subpaths(path.getAttribute("d") ?? "").every((points) =>
      points.every((point) => distance(point, points[0] as Point) === 0),
    );

  const isFilled = (element: Element) => {
    const fill = getComputedStyle(element).fill;
    return fill !== "none" && !fill.startsWith("rgba(0, 0, 0, 0)");
  };

  type Rgb = readonly [red: number, green: number, blue: number];

  /** A CSS colour as sRGB over `under`: a canvas normalises every colour syntax to sRGB. */
  const canvas = document.createElement("canvas").getContext("2d");
  function colourOf(value: string, under: Rgb): Rgb {
    if (canvas === null) throw new Error("No 2D canvas to read colours with");
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = `rgb(${under.join(" ")})`;
    canvas.fillRect(0, 0, 1, 1);
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = canvas.getImageData(0, 0, 1, 1).data;
    return [red, green, blue];
  }

  /** The page colour behind a picture: the nearest ancestor with a background colour. */
  function pageBackground(svg: SVGSVGElement): Rgb {
    let colour: Rgb = [255, 255, 255];
    const layers: string[] = [];
    for (let element: Element | null = svg; element !== null; element = element.parentElement) {
      const background = getComputedStyle(element).backgroundColor;
      if (background !== "rgba(0, 0, 0, 0)" && background !== "transparent")
        layers.push(background);
    }
    for (const layer of layers.reverse()) colour = colourOf(layer, colour);
    return colour;
  }

  function luminance([red, green, blue]: Rgb): number {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  }

  function contrast(a: Rgb, b: Rgb): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
  }

  function check(svg: SVGSVGElement, picture: string, defects: ArtDefect[]) {
    const report = (problem: string) => defects.push({ picture, problem });
    const view = svg.viewBox.baseVal;
    const drawn = [
      ...svg.querySelectorAll<SVGGraphicsElement>(
        "rect, path, text, circle, ellipse, line, polygon",
      ),
    ]
      .filter((element) => element.closest("pattern, defs, title, desc") === null)
      .filter(
        (element) =>
          !(element.tagName === "rect" && element.getAttribute("fill")?.startsWith("url(")),
      )
      .filter((element) => !(element instanceof SVGPathElement && isDotGrid(element)))
      .map((element) => ({ element, box: boxIn(svg, element) }))
      .filter(({ box }) => box.width > 0 || box.height > 0);
    const boxes = drawn.filter(
      ({ element, box }) =>
        element.tagName === "rect" &&
        !element.classList.contains("shade") &&
        box.width >= MIN_BOX.width &&
        box.height >= MIN_BOX.height,
    );

    // Nothing leaves the drawing.
    for (const { element, box } of drawn) {
      if (
        box.x < view.x - TOLERANCE ||
        box.y < view.y - TOLERANCE ||
        box.x + box.width > view.x + view.width + TOLERANCE ||
        box.y + box.height > view.y + view.height + TOLERANCE
      ) {
        const label =
          element.tagName === "text" ? `"${element.textContent}"` : `a ${element.tagName}`;
        report(`${label} at ${at(box)} is clipped by the picture's edge`);
      }
    }

    // Text stays inside the box it sits in.
    for (const { element, box } of drawn) {
      if (element.tagName !== "text") continue;
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const holder = boxes
        .map((candidate) => candidate.box)
        .filter(
          (candidate) =>
            toEdge(centre, candidate) >= 0 &&
            contains(candidate, { ...centre, width: 0, height: 0 }),
        )
        .sort((a, b) => a.width * a.height - b.width * b.height)[0];
      if (holder === undefined) continue;
      const over = Math.max(
        holder.x + 2 - box.x,
        box.x + box.width - (holder.x + holder.width - 2),
      );
      if (over > TOLERANCE) report(`"${element.textContent}" runs ${round(over)} past its box`);
    }

    // Text reads at 4.5:1 or more against what is behind it: the topmost filled
    // shape under it, else the page behind the picture.
    for (const { element, box } of drawn) {
      if (element.tagName !== "text" || (element.textContent ?? "").trim() === "") continue;
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const index = drawn.findIndex((entry) => entry.element === element);
      const backing = drawn
        .slice(0, index)
        .filter(
          (entry) =>
            entry.element.tagName !== "text" &&
            isFilled(entry.element) &&
            contains(entry.box, { ...centre, width: 0, height: 0 }) &&
            entry.box.width >= MIN_SHAPE,
        )
        .at(-1);
      const behind =
        backing === undefined
          ? pageBackground(svg)
          : colourOf(getComputedStyle(backing.element).fill, pageBackground(svg));
      const ink = colourOf(getComputedStyle(element).fill, behind);
      const ratio = contrast(ink, behind);
      if (ratio < MIN_CONTRAST) {
        report(
          `"${element.textContent}" has ${ratio.toFixed(2)}:1 contrast against its background`,
        );
      }
    }

    // Shapes drawn later than a box either stay clear of it, sit inside it, or hide what is under them.
    drawn.forEach((later, laterIndex) => {
      if (later.element.tagName === "text") return;
      if (later.box.width < MIN_SHAPE || later.box.height < MIN_SHAPE) return;
      for (const earlier of boxes) {
        if (drawn.indexOf(earlier) >= laterIndex) continue;
        if (contains(earlier.box, later.box) || contains(later.box, earlier.box)) continue;
        const shared = overlap(earlier.box, later.box);
        if (shared === undefined) continue;
        if (
          later.element.tagName === "rect" &&
          boxes.some((box) => box.element === later.element)
        ) {
          report(
            `boxes at ${at(earlier.box)} and ${at(later.box)} overlap by ${round(shared.width)} × ${round(shared.height)}`,
          );
        } else if (!isFilled(later.element)) {
          report(
            `a ${later.element.tagName} at ${at(later.box)} is drawn over the box at ${at(earlier.box)} without hiding it`,
          );
        }
      }
    });

    // Nothing inside a rounded frame pokes out of its corners.
    for (const frame of boxes) {
      const radius = Number(frame.element.getAttribute("rx") ?? 0);
      if (radius < MIN_FRAME_RADIUS) continue;
      for (const { element, box } of drawn) {
        if (element === frame.element || element.tagName === "text" || !contains(frame.box, box))
          continue;
        const ownRadius = Number(element.getAttribute("rx") ?? 0);
        const reachesX =
          box.x < frame.box.x + radius - ownRadius ||
          box.x + box.width > frame.box.x + frame.box.width - radius + ownRadius;
        const reachesY =
          box.y < frame.box.y + radius - ownRadius ||
          box.y + box.height > frame.box.y + frame.box.height - radius + ownRadius;
        const isFill = element.tagName === "rect" && isFilled(element);
        if (isFill && reachesX && reachesY && box.width < frame.box.width - TOLERANCE) {
          report(
            `a filled ${element.tagName} at ${at(box)} pokes out of the rounded corner of the frame at ${at(frame.box)}`,
          );
        }
      }
    }

    // Arrows: the lines that end in the art's arrowhead.
    const paths = drawn.filter(({ element }) => element instanceof SVGPathElement);
    const lines = paths.map(({ element }) => subpaths(element.getAttribute("d") ?? ""));
    const tips: { tip: Point; box: Box }[] = [];
    const nearestBox = (point: Point) =>
      boxes.map(({ box }) => ({ box, gap: toEdge(point, box) })).sort((a, b) => a.gap - b.gap)[0];
    lines.forEach((parts, index) => {
      const head = parts.at(-1);
      const shaft = parts.slice(0, -1);
      if (
        head === undefined ||
        head.length !== 3 ||
        shaft.length === 0 ||
        Math.abs(distance(head[0] as Point, head[1] as Point) - HEAD_LENGTH) > 0.5 ||
        Math.abs(distance(head[2] as Point, head[1] as Point) - HEAD_LENGTH) > 0.5
      ) {
        return;
      }
      const tip = head[1] as Point;
      const start = shaft[0]?.[0] as Point;
      // A shaft that bends but stays within a narrow band is a jog between nearly aligned boxes.
      const shaftPoints = shaft.flat();
      const xs = shaftPoints.map((point) => point.x);
      const ys = shaftPoints.map((point) => point.y);
      const spread = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (spread > 0.5 && spread < MIN_JOG) {
        report(`an arrow into ${at(tip)} jogs ${round(spread)} sideways; line its boxes up`);
      }
      const end = nearestBox(tip);
      if (end === undefined || end.gap > TOLERANCE) {
        report(
          `an arrow ends at ${at(tip)}, ${end === undefined ? "with no box" : `${round(end.gap)} from the nearest box edge`}`,
        );
      } else {
        tips.push({ tip, box: end.box });
      }
      // A branch may start on another line, such as a fan's bus.
      const onLine = lines.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.some((points) =>
            points
              .slice(1)
              .some(
                (point, pointIndex) =>
                  toSegment(start, points[pointIndex] as Point, point) <= TOLERANCE,
              ),
          ),
      );
      const begin = nearestBox(start);
      if (!onLine && (begin === undefined || begin.gap > TOLERANCE)) {
        report(
          `an arrow starts at ${at(start)}, ${begin === undefined ? "with no box" : `${round(begin.gap)} from the nearest box edge`}`,
        );
      }
    });
    tips.forEach((a, i) => {
      for (const b of tips.slice(i + 1)) {
        if (a.box === b.box && distance(a.tip, b.tip) < HEAD_SPACING) {
          report(`arrowheads at ${at(a.tip)} and ${at(b.tip)} pile up on one box`);
        }
      }
    });
  }

  /** A picture's name: its title, else the card or section it illustrates. */
  function nameOf(svg: SVGSVGElement): string {
    const title = svg.querySelector("title")?.textContent;
    if (title) return title;
    const holder = svg.closest(".sw-card, a, section, header, article");
    const heading = holder
      ?.querySelector("h1, h2, h3, h4, strong, .sw-card__title")
      ?.textContent?.trim();
    return `the ${heading ?? "unnamed"} picture`;
  }

  const defects: ArtDefect[] = [];
  const visible = (svg: SVGSVGElement) => svg.getBoundingClientRect().width > 0;
  for (const svg of document.querySelectorAll<SVGSVGElement>("svg.sw-art")) {
    if (visible(svg)) check(svg, nameOf(svg), defects);
  }

  // Section card pictures are files a <use> points at. Each file is drawn once,
  // inline, beside its first use, so it gets the card's colours and background.
  const uses = new Map<string, SVGUseElement>();
  for (const use of document.querySelectorAll<SVGUseElement>("svg use")) {
    const href = use.getAttribute("href") ?? "";
    if (href.startsWith("/figures/illustrations/") && !uses.has(href)) uses.set(href, use);
  }
  for (const [href, use] of uses) {
    const [file = href] = href.split("#");
    const source = await (await fetch(file)).text();
    const symbol = new DOMParser().parseFromString(source, "image/svg+xml").querySelector("symbol");
    const shown = use.ownerSVGElement;
    if (symbol === null || shown === null || !visible(shown)) continue;
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    probe.setAttribute("viewBox", symbol.getAttribute("viewBox") ?? "0 0 320 160");
    probe.setAttribute("class", shown.getAttribute("class") ?? "");
    probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden";
    for (const child of [...symbol.childNodes]) probe.append(document.importNode(child, true));
    shown.after(probe);
    check(probe, file, defects);
    probe.remove();
  }
  return defects;
}
