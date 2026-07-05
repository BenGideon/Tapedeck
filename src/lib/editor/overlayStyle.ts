import type { Overlay, OverlayPreset } from "@/lib/store/types";

/**
 * One source of truth for overlay appearance, used by BOTH the DOM preview
 * and the canvas export renderer so what you see is what you export.
 * All sizes are fractions of the video frame height.
 */
export interface OverlayPresetStyle {
  label: string;
  fontSizeFrac: number;
  fontWeight: number;
  color: string;
  background: string | null;
  paddingXFrac: number;
  paddingYFrac: number;
  radiusFrac: number;
  uppercase: boolean;
  shadow: boolean;
}

export const OVERLAY_PRESETS: Record<OverlayPreset, OverlayPresetStyle> = {
  heading: {
    label: "Heading",
    fontSizeFrac: 0.065,
    fontWeight: 700,
    color: "#ffffff",
    background: null,
    paddingXFrac: 0.014,
    paddingYFrac: 0.008,
    radiusFrac: 0.012,
    uppercase: false,
    shadow: true,
  },
  caption: {
    label: "Caption",
    fontSizeFrac: 0.042,
    fontWeight: 500,
    color: "#ffffff",
    background: "rgba(12, 11, 9, 0.72)",
    paddingXFrac: 0.018,
    paddingYFrac: 0.011,
    radiusFrac: 0.012,
    uppercase: false,
    shadow: false,
  },
  callout: {
    label: "Callout",
    fontSizeFrac: 0.045,
    fontWeight: 600,
    color: "#1a1815",
    background: "#f5f0e8",
    paddingXFrac: 0.022,
    paddingYFrac: 0.013,
    radiusFrac: 0.05,
    uppercase: false,
    shadow: true,
  },
  label: {
    label: "Label",
    fontSizeFrac: 0.03,
    fontWeight: 600,
    color: "#ffffff",
    background: "rgba(196, 69, 46, 0.92)",
    paddingXFrac: 0.016,
    paddingYFrac: 0.009,
    radiusFrac: 0.008,
    uppercase: true,
    shadow: false,
  },
};

export function overlayDisplayText(overlay: Overlay): string {
  const base = OVERLAY_PRESETS[overlay.preset].uppercase
    ? overlay.text.toUpperCase()
    : overlay.text;
  return overlay.kind === "link" ? `${base}  ↗` : base;
}

export const OVERLAY_FONT_FAMILY =
  '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

/** Draw one overlay onto a canvas frame (used at export time). */
export function drawOverlayToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  overlay: Overlay,
  frameWidth: number,
  frameHeight: number,
): void {
  const style = OVERLAY_PRESETS[overlay.preset];
  const fontSize = style.fontSizeFrac * frameHeight;
  const text = overlayDisplayText(overlay);
  ctx.font = `${style.fontWeight} ${fontSize}px ${OVERLAY_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const centerX = overlay.x * frameWidth;
  const centerY = overlay.y * frameHeight;
  const metrics = ctx.measureText(text);
  const padX = style.paddingXFrac * frameHeight * 2.2;
  const padY = style.paddingYFrac * frameHeight * 2.2;
  const boxWidth = metrics.width + padX * 2;
  const boxHeight = fontSize * 1.25 + padY * 2;

  if (style.background) {
    ctx.save();
    ctx.fillStyle = style.background;
    const radius = Math.min(style.radiusFrac * frameHeight * 4, boxHeight / 2);
    ctx.beginPath();
    ctx.roundRect(centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (style.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = fontSize * 0.18;
    ctx.shadowOffsetY = fontSize * 0.04;
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, centerX, centerY);
  ctx.restore();
}
