/**
 * Lazy media inspection helpers built on mediabunny (dynamically imported so
 * the landing page and recorder never pay for it).
 */

export interface ProbeInfo {
  duration: number;
  width: number;
  height: number;
}

export async function probeBlob(blob: Blob): Promise<ProbeInfo | null> {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const duration = await input.computeDuration();
    const videoTrack = await input.getPrimaryVideoTrack();
    return {
      duration,
      width: videoTrack?.displayWidth ?? 0,
      height: videoTrack?.displayHeight ?? 0,
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** Generate small timeline thumbnails at the given timestamps.
 * Returns object URLs (PNG); caller revokes them. */
export async function generateThumbnails(
  blob: Blob,
  timestamps: number[],
  height: number,
): Promise<string[]> {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return [];
    const aspect = (videoTrack.displayWidth || 16) / (videoTrack.displayHeight || 9);
    const sink = new CanvasSink(videoTrack, {
      width: Math.round(height * aspect),
      height,
      fit: "cover",
    });
    const urls: string[] = [];
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (!wrapped) continue;
      const canvas = wrapped.canvas as HTMLCanvasElement | OffscreenCanvas;
      const outputBlob =
        canvas instanceof OffscreenCanvas
          ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 })
          : await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/jpeg", 0.7),
            );
      if (outputBlob) urls.push(URL.createObjectURL(outputBlob));
    }
    return urls;
  } catch {
    return [];
  } finally {
    input.dispose();
  }
}

/** Capture one poster frame as a JPEG blob (for project cards). */
export async function capturePoster(blob: Blob, timestamp: number): Promise<Blob | null> {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return null;
    const aspect = (videoTrack.displayWidth || 16) / (videoTrack.displayHeight || 9);
    const sink = new CanvasSink(videoTrack, {
      width: Math.round(320 * aspect) > 568 ? 568 : Math.round(320 * aspect),
      height: 320,
      fit: "cover",
    });
    const wrapped = await sink.getCanvas(timestamp);
    if (!wrapped) return null;
    const canvas = wrapped.canvas as HTMLCanvasElement | OffscreenCanvas;
    return canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 })
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
