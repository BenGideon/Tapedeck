/**
 * Animated GIF thumbnail generation — 3–5s loop, reduced frame rate, small
 * dimensions. Runs fully locally via mediabunny frame extraction + gifenc.
 */

export interface GifOptions {
  startSec: number;
  durationSec?: number;
  width?: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
}

export const GIF_DEFAULT_DURATION = 4;
const GIF_DEFAULT_WIDTH = 480;
const GIF_DEFAULT_FPS = 10;

export async function generateGif(blob: Blob, options: GifOptions): Promise<Blob | null> {
  const [{ Input, BlobSource, ALL_FORMATS, CanvasSink }, { GIFEncoder, quantize, applyPalette }] =
    await Promise.all([import("mediabunny"), import("gifenc")]);

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;

    const width = options.width ?? GIF_DEFAULT_WIDTH;
    const aspect = (track.displayWidth || 16) / (track.displayHeight || 9);
    const height = Math.round(width / aspect / 2) * 2;
    const fps = options.fps ?? GIF_DEFAULT_FPS;
    const clipDuration = options.durationSec ?? GIF_DEFAULT_DURATION;

    const sink = new CanvasSink(track, { width, height, fit: "cover", poolSize: 2 });
    const frameCount = Math.round(clipDuration * fps);
    const timestamps = Array.from(
      { length: frameCount },
      (_, i) => options.startSec + i / fps,
    );

    const gif = GIFEncoder();
    const delayMs = Math.round(1000 / fps);
    let processed = 0;

    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      processed += 1;
      options.onProgress?.(processed / frameCount);
      if (!wrapped) continue;
      const canvas = wrapped.canvas;
      const ctx = (canvas as OffscreenCanvas).getContext("2d") as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (!ctx) continue;
      const imageData = ctx.getImageData(0, 0, width, height);
      const palette = quantize(imageData.data, 256);
      const indexed = applyPalette(imageData.data, palette);
      gif.writeFrame(indexed, width, height, { palette, delay: delayMs });
    }

    gif.finish();
    const bytes = gif.bytes();
    if (bytes.length < 100) return null;
    return new Blob([bytes.slice().buffer], { type: "image/gif" });
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** Pick a sensible default GIF start: a quarter into the first kept segment. */
export function defaultGifStart(segments: { start: number; end: number }[], duration: number): number {
  const first = segments[0] ?? { start: 0, end: duration };
  const length = first.end - first.start;
  return first.start + Math.min(length * 0.25, Math.max(0, length - GIF_DEFAULT_DURATION));
}
