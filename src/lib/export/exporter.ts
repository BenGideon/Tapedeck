import type { EditDoc, Segment } from "@/lib/store/types";
import type {
  AudioSample as AudioSampleT,
  VideoSample as VideoSampleT,
  VideoSampleSink as VideoSampleSinkT,
} from "mediabunny";
import { drawOverlayToCanvas } from "@/lib/editor/overlayStyle";
import { bubbleRect, bubbleAspect } from "@/lib/editor/bubbleLayout";
import { createNoiseFilterState, processNoiseBlock } from "@/lib/audio/noiseDsp";

export type ExportMode = "fast" | "balanced" | "high";

export interface ExportRequest {
  mainBlob: Blob;
  bubbleBlob?: Blob;
  bubbleOffsetSec: number;
  edit: EditDoc;
  width: number;
  height: number;
  mode: ExportMode;
  onProgress?: (fraction: number) => void;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  fileExtension: string;
}

export interface ExportHandle {
  result: Promise<ExportResult>;
  cancel: () => void;
}

const MODE_BITS_PER_PIXEL: Record<ExportMode, number> = {
  fast: 0.09,
  balanced: 0.125,
  high: 0.17,
};

const EPSILON = 0.05;

function normalizeSegments(segments: Segment[], duration: number): Segment[] {
  return segments
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(duration, s.end) }))
    .filter((s) => s.end - s.start > 0.01)
    .sort((a, b) => a.start - b.start);
}

/** Maps a source timestamp to output time. Returns null inside cuts. */
function buildRetimer(segments: Segment[]) {
  const outputStarts: number[] = [];
  let acc = 0;
  for (const segment of segments) {
    outputStarts.push(acc);
    acc += segment.end - segment.start;
  }
  return (t: number): number | null => {
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (t >= s.start - EPSILON && t < s.end) return outputStarts[i] + Math.max(0, t - s.start);
    }
    return null;
  };
}

/**
 * Export the project. One mediabunny Conversion drives everything:
 *  - untouched project + fast mode → remux/passthrough (no re-encode)
 *  - trims/cuts → samples dropped and retimed in the process callbacks
 *  - camera bubble / overlays → canvas compositing per frame
 */
export function exportProject(request: ExportRequest): ExportHandle {
  let cancelled = false;
  let cancelFn: (() => void) | null = null;

  const result = (async (): Promise<ExportResult> => {
    const mb = await import("mediabunny");
    const {
      Input,
      Output,
      Conversion,
      BlobSource,
      BufferTarget,
      Mp4OutputFormat,
      WebMOutputFormat,
      ALL_FORMATS,
      VideoSampleSink,
      VideoSample,
      canEncodeVideo,
      canEncodeAudio,
    } = mb;

    const input = new Input({ source: new BlobSource(request.mainBlob), formats: ALL_FORMATS });
    const bubbleInput = request.bubbleBlob
      ? new Input({ source: new BlobSource(request.bubbleBlob), formats: ALL_FORMATS })
      : null;

    try {
      const duration = await input.computeDuration();
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error("The recording has no video track.");
      const audioTrack = await input.getPrimaryAudioTrack();

      const width = videoTrack.displayWidth || request.width;
      const height = videoTrack.displayHeight || request.height;

      const segments = normalizeSegments(request.edit.segments, duration);
      if (segments.length === 0) throw new Error("Everything has been cut — nothing to export.");
      const isFullRange =
        segments.length === 1 &&
        segments[0].start < EPSILON &&
        segments[0].end > duration - EPSILON;
      const hasBubble = Boolean(bubbleInput) && request.edit.camera.visible;
      const activeOverlays = request.edit.overlays.filter((o) => o.text.trim().length > 0);
      const needsCompositing = hasBubble || activeOverlays.length > 0;
      const needsRetiming = !isFullRange;
      const needsVideoWork = needsCompositing || needsRetiming;
      const applyNoiseFilter = request.edit.audio.noiseFilter && Boolean(audioTrack);
      const needsAudioWork = needsRetiming || applyNoiseFilter;

      // Pick the output container/codec from real encoder support.
      const canAvc = await canEncodeVideo("avc", { width, height }).catch(() => false);
      const useMp4 = canAvc;
      const outputFormat = useMp4
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat();
      const videoCodec = useMp4 ? ("avc" as const) : ("vp9" as const);
      const audioCodec = useMp4
        ? (await canEncodeAudio("aac").catch(() => false))
          ? ("aac" as const)
          : ("opus" as const)
        : ("opus" as const);

      // Pure remux when nothing needs to change and mode is fast.
      const pureRemux = !needsVideoWork && !needsAudioWork && request.mode === "fast";

      let frameRate = 30;
      try {
        const stats = await videoTrack.computePacketStats(120);
        if (stats.averagePacketRate > 1) frameRate = Math.min(60, Math.round(stats.averagePacketRate));
      } catch {
        // keep default
      }
      const videoBitrate = Math.round(
        Math.min(70_000_000, Math.max(2_000_000, width * height * frameRate * MODE_BITS_PER_PIXEL[request.mode])),
      );

      const output = new Output({ format: outputFormat, target: new BufferTarget() });

      const retime = buildRetimer(segments);

      // ---- compositing setup ----
      let compose:
        | ((sample: VideoSampleT, outputTime: number, sourceTime: number) => Promise<VideoSampleT>)
        | null = null;
      let bubbleSink: VideoSampleSinkT | null = null;
      let bubbleIterator: AsyncGenerator<VideoSampleT, void, unknown> | null = null;
      const bubbleFrames: { current: VideoSampleT | null; next: VideoSampleT | null } = {
        current: null,
        next: null,
      };

      if (needsCompositing) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create a rendering context for export.");

        if (hasBubble && bubbleInput) {
          const bubbleTrack = await bubbleInput.getPrimaryVideoTrack();
          if (bubbleTrack) {
            bubbleSink = new VideoSampleSink(bubbleTrack);
            bubbleIterator = bubbleSink.samples(0);
          }
        }

        const advanceBubbleTo = async (sourceTime: number) => {
          if (!bubbleIterator) return;
          const bubbleTime = sourceTime - request.bubbleOffsetSec;
          // Pull frames until the next frame is beyond the requested time.
          for (;;) {
            if (bubbleFrames.next === null) {
              const { value, done } = await bubbleIterator.next();
              if (done) break;
              bubbleFrames.next = value;
            }
            if (bubbleFrames.next.timestamp <= bubbleTime) {
              bubbleFrames.current?.close();
              bubbleFrames.current = bubbleFrames.next;
              bubbleFrames.next = null;
            } else {
              break;
            }
          }
        };

        compose = async (sample, outputTime, sourceTime) => {
          ctx.clearRect(0, 0, width, height);
          sample.draw(ctx, 0, 0, width, height);

          if (bubbleIterator) {
            await advanceBubbleTo(sourceTime);
            const bubbleFrame = bubbleFrames.current;
            if (bubbleFrame) {
              const layout = request.edit.camera;
              const rect = bubbleRect(layout, width, height);
              const aspect = bubbleAspect(layout.shape);
              const srcW = bubbleFrame.displayWidth;
              const srcH = bubbleFrame.displayHeight;
              // Cover-crop the camera frame to the bubble aspect.
              let cropW = srcW;
              let cropH = srcW / aspect;
              if (cropH > srcH) {
                cropH = srcH;
                cropW = srcH * aspect;
              }
              const cropX = (srcW - cropW) / 2;
              const cropY = (srcH - cropH) / 2;

              ctx.save();
              ctx.beginPath();
              if (layout.shape === "circle") {
                ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
              } else {
                ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.h * 0.12);
              }
              ctx.clip();
              bubbleFrame.draw(ctx, cropX, cropY, cropW, cropH, rect.x, rect.y, rect.w, rect.h);
              ctx.restore();
            }
          }

          for (const overlay of activeOverlays) {
            if (sourceTime >= overlay.start && sourceTime <= overlay.end) {
              drawOverlayToCanvas(ctx, overlay, width, height);
            }
          }

          return new VideoSample(canvas, {
            timestamp: outputTime,
            duration: sample.duration,
          });
        };
      }

      // ---- audio noise filter state (stateful across sequential samples) ----
      const noiseState = applyNoiseFilter ? createNoiseFilterState(48_000) : null;

      const conversion = await Conversion.init({
        input,
        output,
        trim:
          !needsVideoWork && !needsAudioWork && !isFullRange
            ? { start: segments[0].start, end: segments[0].end }
            : undefined,
        video: pureRemux
          ? undefined
          : {
              codec: videoCodec,
              bitrate: videoBitrate,
              forceTranscode: needsVideoWork,
              processedWidth: needsCompositing ? width : undefined,
              processedHeight: needsCompositing ? height : undefined,
              process: needsVideoWork
                ? async (sample: VideoSampleT) => {
                    const sourceTime = sample.timestamp;
                    const outputTime = retime(sourceTime);
                    if (outputTime === null) return null;
                    if (compose) return compose(sample, outputTime, sourceTime);
                    const clone = sample.clone();
                    clone.setTimestamp(outputTime);
                    return clone;
                  }
                : undefined,
            },
        audio:
          pureRemux || !audioTrack
            ? undefined
            : {
                codec: audioCodec,
                bitrate: 128_000,
                sampleRate: 48_000,
                forceTranscode: needsAudioWork,
                process: needsAudioWork
                  ? async (sample: AudioSampleT) => {
                      const outputTime = retime(sample.timestamp);
                      if (outputTime === null) return null;
                      let processed = sample;
                      if (noiseState) {
                        processed = processNoiseBlock(sample, noiseState, mb);
                      }
                      const clone = processed === sample ? sample.clone() : processed;
                      clone.setTimestamp(outputTime);
                      return clone;
                    }
                  : undefined,
              },
      });

      if (!conversion.isValid) {
        throw new Error("This recording cannot be converted in this browser.");
      }
      conversion.onProgress = (progress) => request.onProgress?.(progress);
      cancelFn = () => void conversion.cancel();
      if (cancelled) throw new Error("Export cancelled.");

      await conversion.execute();

      bubbleFrames.current?.close();
      bubbleFrames.next?.close();

      const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
      if (!buffer) throw new Error("Export produced no data.");
      const exportResult: ExportResult = {
        blob: new Blob([buffer], { type: outputFormat.mimeType }),
        mimeType: outputFormat.mimeType,
        fileExtension: outputFormat.fileExtension.replace(".", ""),
      };
      if (process.env.NODE_ENV === "development") {
        // Dev-only: lets automated browser tests inspect the exported file.
        (window as unknown as Record<string, unknown>).__lastExport = exportResult;
      }
      return exportResult;
    } finally {
      input.dispose();
      bubbleInput?.dispose();
    }
  })();

  return {
    result,
    cancel: () => {
      cancelled = true;
      cancelFn?.();
    },
  };
}
