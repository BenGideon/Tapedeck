/** Project + non-destructive edit document model. Media blobs live in a
 * separate IndexedDB store, never inside these metadata objects. */

export type CameraShape = "circle" | "rounded";
export type CameraCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface CameraLayout {
  visible: boolean;
  shape: CameraShape;
  /** Center position as fraction of the video frame (0..1). */
  x: number;
  y: number;
  /** Bubble height as fraction of video frame height (0..1). */
  size: number;
}

export type OverlayPreset = "heading" | "caption" | "callout" | "label";

export interface Overlay {
  id: string;
  kind: "text" | "link";
  text: string;
  /** Only for kind === "link". */
  url?: string;
  preset: OverlayPreset;
  /** Center position as fraction of the video frame (0..1). */
  x: number;
  y: number;
  /** Source-time window in seconds. */
  start: number;
  end: number;
}

/** A kept range of the source recording, in source seconds. */
export interface Segment {
  start: number;
  end: number;
}

export interface AudioSettings {
  noiseFilter: boolean;
}

export interface EditDoc {
  /** Kept ranges, ascending, non-overlapping. Everything else is cut. */
  segments: Segment[];
  camera: CameraLayout;
  overlays: Overlay[];
  audio: AudioSettings;
}

export interface ProjectMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Full source duration in seconds (recorder-measured). */
  duration: number;
  width: number;
  height: number;
  mainMimeType: string;
  mainExtension: string;
  hasAudio: boolean;
  hasBubble: boolean;
  bubbleMimeType?: string;
  /** bubble start minus main start, seconds. */
  bubbleOffsetSec: number;
  /** Approximate stored media size in bytes. */
  sizeBytes: number;
  edit: EditDoc;
}

export function defaultCameraLayout(): CameraLayout {
  return { visible: true, shape: "circle", x: 0.11, y: 0.85, size: 0.24 };
}

export function defaultEditDoc(duration: number): EditDoc {
  return {
    segments: [{ start: 0, end: duration }],
    camera: defaultCameraLayout(),
    overlays: [],
    audio: { noiseFilter: false },
  };
}

/** Total output duration after cuts. */
export function editedDuration(edit: EditDoc): number {
  return edit.segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

/** Map a source time to output time; null when inside a cut. */
export function sourceToOutputTime(edit: EditDoc, sourceTime: number): number | null {
  let acc = 0;
  for (const segment of edit.segments) {
    if (sourceTime < segment.start) return null;
    if (sourceTime <= segment.end) return acc + (sourceTime - segment.start);
    acc += segment.end - segment.start;
  }
  return null;
}

/** Find the segment containing a source time, or the next one after it. */
export function segmentAtOrAfter(edit: EditDoc, sourceTime: number): Segment | null {
  for (const segment of edit.segments) {
    if (sourceTime <= segment.end) return segment;
  }
  return null;
}
