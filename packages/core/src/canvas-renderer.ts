import { type PaintTarget, paintTargetFrame, paintTargetPanes } from "./canvas-paint.js";
import { SheetwriteError } from "./errors.js";
import type {
  CellRenderer,
  PanePaint,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
} from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

/**
 * Canvas 2D backend (main thread). Owns Layer 1 (the cell canvas) and paints the
 * visible window in one pass via the shared `paintFrame`. Never reads the store.
 */
export class CanvasRenderer implements Renderer {
  private readonly target: PaintTarget<HTMLCanvasElement> = {
    canvas: null,
    ctx: null,
    layout: null,
    theme: null,
    viewport: { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 },
    dpr: 1,
    renderers: new Map(),
    lastViewport: null,
    lastDpr: 1,
  };
  private cssWidth = -1;
  private cssHeight = -1;

  mount(host: HTMLElement, theme: Theme): void {
    this.target.theme = theme;
    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new SheetwriteError(
        "unavailable",
        "create-grid",
        "Sheetwrite: 2D canvas context is unavailable",
      );
    }
    this.target.canvas = canvas;
    this.target.ctx = ctx;
  }

  setLayout(layout: RenderLayout): void {
    this.target.layout = layout;
    this.target.lastViewport = null;
  }

  setTheme(theme: Theme): void {
    this.target.theme = theme;
    this.target.lastViewport = null;
  }

  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void {
    this.target.renderers = renderers;
    this.target.lastViewport = null;
  }

  setViewport(viewport: Viewport): void {
    this.target.viewport = viewport;
    const canvas = this.target.canvas;
    if (!canvas) return;
    this.target.dpr = globalThis.devicePixelRatio ?? 1;
    const w = Math.max(1, Math.round(viewport.width * this.target.dpr));
    const h = Math.max(1, Math.round(viewport.height * this.target.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (this.cssWidth !== viewport.width || this.cssHeight !== viewport.height) {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      this.cssWidth = viewport.width;
      this.cssHeight = viewport.height;
    }
  }

  paint(view: VisibleWindowView): void {
    paintTargetFrame(this.target, view);
  }

  paintPanes(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void {
    paintTargetPanes(this.target, panes, (pane) => pane.view, divider);
  }

  destroy(): void {
    this.target.canvas?.remove();
    this.target.canvas = null;
    this.target.ctx = null;
  }
}
