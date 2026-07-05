/**
 * Runtime capability detection for recording.
 * Nothing here is assumed — every format is confirmed against the current
 * browser via MediaRecorder.isTypeSupported before use.
 */

export interface RecordingFormat {
  mimeType: string;
  container: "mp4" | "webm";
  fileExtension: string;
}

const AV_CANDIDATES: RecordingFormat[] = [
  // MP4 + H.264 first: hardware-encoded in Chromium, plays everywhere after
  // download, and remuxes/trims without transcoding.
  { mimeType: 'video/mp4;codecs="avc1.640028,mp4a.40.2"', container: "mp4", fileExtension: "mp4" },
  { mimeType: 'video/mp4;codecs="avc1.640028,opus"', container: "mp4", fileExtension: "mp4" },
  { mimeType: "video/mp4", container: "mp4", fileExtension: "mp4" },
  { mimeType: 'video/webm;codecs="vp9,opus"', container: "webm", fileExtension: "webm" },
  { mimeType: 'video/webm;codecs="vp8,opus"', container: "webm", fileExtension: "webm" },
  { mimeType: "video/webm", container: "webm", fileExtension: "webm" },
];

const VIDEO_ONLY_CANDIDATES: RecordingFormat[] = [
  { mimeType: 'video/mp4;codecs="avc1.640028"', container: "mp4", fileExtension: "mp4" },
  { mimeType: 'video/webm;codecs="vp9"', container: "webm", fileExtension: "webm" },
  { mimeType: 'video/webm;codecs="vp8"', container: "webm", fileExtension: "webm" },
  { mimeType: "video/webm", container: "webm", fileExtension: "webm" },
];

function firstSupported(candidates: RecordingFormat[]): RecordingFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }
  return null;
}

export function bestRecordingFormat(withAudio: boolean): RecordingFormat | null {
  return firstSupported(withAudio ? AV_CANDIDATES : VIDEO_ONLY_CANDIDATES);
}

export interface BrowserSupport {
  canRecordScreen: boolean;
  canRecordCamera: boolean;
  hasMediaRecorder: boolean;
  supported: boolean;
  reason?: string;
}

export function detectBrowserSupport(): BrowserSupport {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return {
      canRecordScreen: false,
      canRecordCamera: false,
      hasMediaRecorder: false,
      supported: false,
      reason: "Media capture is not available in this browser.",
    };
  }
  const canRecordScreen = typeof navigator.mediaDevices.getDisplayMedia === "function";
  const canRecordCamera = typeof navigator.mediaDevices.getUserMedia === "function";
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const supported = (canRecordScreen || canRecordCamera) && hasMediaRecorder;
  return {
    canRecordScreen,
    canRecordCamera,
    hasMediaRecorder,
    supported,
    reason: supported
      ? undefined
      : "This browser cannot record media. Use a recent Chromium-based browser (Chrome, Edge, Brave) for the full experience.",
  };
}

export function extensionForMime(mimeType: string): string {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}
