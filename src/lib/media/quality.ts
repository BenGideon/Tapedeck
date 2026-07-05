/**
 * User-facing quality modes and resolution-aware bitrate targets.
 * Bitrate is computed from the *actual* captured track settings, never from
 * the requested constraints — browsers may deliver something different.
 */

export type QualityMode = "efficient" | "standard" | "smooth" | "maximum";

export interface QualityModeSpec {
  id: QualityMode;
  label: string;
  hint: string;
  /** Ideal max capture height; undefined = native resolution. */
  maxHeight?: number;
  /** Ideal capture frame rate. */
  frameRate: number;
  /** Bits per pixel per frame used to derive the video bitrate. */
  bitsPerPixel: number;
}

export const QUALITY_MODES: QualityModeSpec[] = [
  {
    id: "efficient",
    label: "Efficient",
    hint: "Up to 720p · 30 fps · smallest files",
    maxHeight: 720,
    frameRate: 30,
    bitsPerPixel: 0.1,
  },
  {
    id: "standard",
    label: "Standard",
    hint: "1080p · 30 fps · recommended",
    maxHeight: 1080,
    frameRate: 30,
    bitsPerPixel: 0.13,
  },
  {
    id: "smooth",
    label: "Smooth",
    hint: "1080p · up to 60 fps · motion-heavy content",
    maxHeight: 1080,
    frameRate: 60,
    bitsPerPixel: 0.105,
  },
  {
    id: "maximum",
    label: "Maximum",
    hint: "Native resolution · up to 60 fps · largest files",
    maxHeight: undefined,
    frameRate: 60,
    bitsPerPixel: 0.15,
  },
];

export function qualitySpec(mode: QualityMode): QualityModeSpec {
  const spec = QUALITY_MODES.find((m) => m.id === mode);
  if (!spec) throw new Error(`Unknown quality mode: ${mode}`);
  return spec;
}

const MIN_VIDEO_BITRATE = 2_500_000;
const MAX_VIDEO_BITRATE = 70_000_000;

/** Derive a video bitrate from real capture dimensions and frame rate. */
export function videoBitrateFor(
  width: number,
  height: number,
  frameRate: number,
  mode: QualityMode,
): number {
  const spec = qualitySpec(mode);
  const raw = width * height * frameRate * spec.bitsPerPixel;
  return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, raw)));
}

export const AUDIO_BITRATE = 128_000;

/** Display-capture constraints for a quality mode. Uses ideal values only —
 * never hard `exact` constraints that could make capture fail. */
export function displayConstraintsFor(mode: QualityMode): MediaTrackConstraints {
  const spec = qualitySpec(mode);
  const constraints: MediaTrackConstraints = {
    frameRate: { ideal: spec.frameRate },
  };
  if (spec.maxHeight) {
    constraints.height = { ideal: spec.maxHeight, max: spec.maxHeight };
    constraints.width = { ideal: Math.round((spec.maxHeight * 16) / 9) };
  }
  return constraints;
}

/** Camera constraints — the bubble never needs more than 1080p. */
export function cameraConstraintsFor(mode: QualityMode, deviceId?: string): MediaTrackConstraints {
  const height = mode === "maximum" ? 1080 : 720;
  const constraints: MediaTrackConstraints = {
    height: { ideal: height },
    width: { ideal: Math.round((height * 16) / 9) },
    frameRate: { ideal: 30 },
  };
  if (deviceId) constraints.deviceId = { exact: deviceId };
  return constraints;
}
