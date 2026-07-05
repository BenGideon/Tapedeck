import type { CameraLayout, CameraShape } from "@/lib/store/types";

/** Shared camera-bubble geometry for the DOM preview and the canvas export,
 * so the bubble lands in exactly the same place in both. */

export function bubbleAspect(shape: CameraShape): number {
  return shape === "circle" ? 1 : 16 / 10;
}

export interface BubbleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function bubbleRect(layout: CameraLayout, frameWidth: number, frameHeight: number): BubbleRect {
  const h = Math.max(0.06, Math.min(0.8, layout.size)) * frameHeight;
  const w = h * bubbleAspect(layout.shape);
  let x = layout.x * frameWidth - w / 2;
  let y = layout.y * frameHeight - h / 2;
  x = Math.max(0, Math.min(frameWidth - w, x));
  y = Math.max(0, Math.min(frameHeight - h, y));
  return { x, y, w, h };
}
