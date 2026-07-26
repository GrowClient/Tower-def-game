/**
 * Letterboxing: fit the fixed 16:9 world rectangle into whatever window we get.
 *
 * Desktop browser and phone-in-landscape are the SAME code path — a desktop
 * window just produces bigger bars. The sim never knows about pixels; it only
 * ever works in world units, and this file is the single translation layer.
 */

import { WORLD } from '../config/balance';

export interface Viewport {
  /** Device pixel ratio actually applied to the backing store. */
  dpr: number;
  /** CSS pixel size of the canvas element. */
  cssW: number;
  cssH: number;
  /** World units -> CSS pixels. */
  scale: number;
  /** Top-left of the world rect, in CSS pixels. */
  offsetX: number;
  offsetY: number;
  /** True when the window is portrait enough that we should ask for a rotate. */
  portrait: boolean;
}

export function resizeCanvas(canvas: HTMLCanvasElement): Viewport {
  // Cap DPR: on a 3x phone screen a full-res backing store costs a lot of
  // fill rate for flat shapes that gain nothing from it.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, window.innerWidth);
  const cssH = Math.max(1, window.innerHeight);

  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }

  const scale = Math.min(cssW / WORLD.width, cssH / WORLD.height);
  return {
    dpr,
    cssW,
    cssH,
    scale,
    offsetX: (cssW - WORLD.width * scale) / 2,
    offsetY: (cssH - WORLD.height * scale) / 2,
    portrait: cssH > cssW,
  };
}

/**
 * Set up the context so every subsequent draw call can use world coordinates
 * directly. Call once at the top of each frame.
 */
export function applyWorldTransform(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  ctx.setTransform(
    vp.scale * vp.dpr,
    0,
    0,
    vp.scale * vp.dpr,
    vp.offsetX * vp.dpr,
    vp.offsetY * vp.dpr,
  );
}

/** Pointer/touch client coordinates -> world coordinates. */
export function screenToWorld(vp: Viewport, clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: (clientX - vp.offsetX) / vp.scale,
    y: (clientY - vp.offsetY) / vp.scale,
  };
}
