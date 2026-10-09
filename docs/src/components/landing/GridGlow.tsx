import { useEffect, useRef } from "react";

/**
 * Lights the page's background grid cells around the pointer. Cells near the
 * pointer fill in, then fade over about a second, so moving the pointer
 * leaves a short trail across the grid.
 *
 * The canvas is fixed to the viewport, behind the content, and ignores the
 * pointer. Cells are aligned to the grid the landing paints on `.sw-landing`
 * (4rem cells, centred horizontally, from its top edge). It reacts only to
 * mouse pointers (not touch or pen) and only when motion is allowed. The loop
 * stops as soon as every cell has faded.
 */

const RADIUS_CELLS = 1.6;
const FADE_PER_SECOND = 1.5;
const FILL_ALPHA = 0.13;
const LINE_ALPHA = 0.45;

export function GridGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const page = canvas?.closest<HTMLElement>(".sw-landing");
    const context = canvas?.getContext("2d");
    if (!canvas || !page || !context) return;
    const allowed = window.matchMedia("(prefers-reduced-motion: no-preference)");

    /** Cell key "column,row" → intensity in [0, 1]. */
    const cells = new Map<string, number>();
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let last = 0;
    let color = "#34d399";

    const cellSize = () =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 4;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    // Read on every wake, so a theme switch changes the colour.
    const readColor = () => {
      color = getComputedStyle(page).getPropertyValue("--sw-accent").trim() || color;
    };

    const frame = (now: number) => {
      const seconds = Math.min(0.1, (now - last) / 1000);
      last = now;
      const size = cellSize();
      const box = page.getBoundingClientRect();
      // The grid is drawn with `background-position: center top`.
      const origin = {
        left: box.left + (((((box.width - size) / 2) % size) + size) % size) - size,
        top: box.top,
      };

      // Light cells around the pointer, strongest at its cell.
      if (pointer) {
        const column = Math.floor((pointer.x - origin.left) / size);
        const row = Math.floor((pointer.y - origin.top) / size);
        const reach = Math.ceil(RADIUS_CELLS);
        for (let dy = -reach; dy <= reach; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const centreX = origin.left + (column + dx + 0.5) * size;
            const centreY = origin.top + (row + dy + 0.5) * size;
            const distance = Math.hypot(centreX - pointer.x, centreY - pointer.y) / size;
            const strength = 1 - distance / RADIUS_CELLS;
            if (strength <= 0) continue;
            const key = `${column + dx},${row + dy}`;
            cells.set(key, Math.max(cells.get(key) ?? 0, strength));
          }
        }
        // Cells are keyed in page coordinates, so the pointer is used once per
        // move; a still pointer lets its cells fade and the loop stop.
        pointer = null;
      }

      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      context.fillStyle = color;
      context.strokeStyle = color;
      context.lineWidth = 1;
      for (const [key, value] of cells) {
        const next = value - FADE_PER_SECOND * seconds;
        if (next <= 0) {
          cells.delete(key);
          continue;
        }
        cells.set(key, next);
        const [column = 0, row = 0] = key.split(",").map(Number);
        const x = origin.left + column * size;
        const y = origin.top + row * size;
        // Fill the cell, and brighten its grid lines a little more.
        context.globalAlpha = FILL_ALPHA * next;
        context.fillRect(x + 1, y + 1, size - 1, size - 1);
        context.globalAlpha = LINE_ALPHA * next;
        context.strokeRect(x + 0.5, y + 0.5, size, size);
      }
      context.globalAlpha = 1;
      raf = cells.size > 0 ? requestAnimationFrame(frame) : 0;
    };

    const wake = () => {
      if (raf !== 0) return;
      last = performance.now();
      readColor();
      raf = requestAnimationFrame(frame);
    };
    const onMove = (event: PointerEvent) => {
      if (!allowed.matches || event.pointerType !== "mouse") return;
      pointer = { x: event.clientX, y: event.clientY };
      wake();
    };
    const onLeave = () => {
      pointer = null;
    };
    // Scrolling moves the grid under a still pointer: redraw so cells stay aligned.
    const onScroll = () => {
      if (cells.size > 0) wake();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <canvas className="sw-landing__glow" ref={canvasRef} />;
}
