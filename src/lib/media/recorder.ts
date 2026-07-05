import { bestRecordingFormat, type RecordingFormat } from "./support";
import {
  AUDIO_BITRATE,
  cameraConstraintsFor,
  displayConstraintsFor,
  videoBitrateFor,
  type QualityMode,
} from "./quality";

export interface RecordingConfig {
  screen: boolean;
  camera: boolean;
  mic: boolean;
  systemAudio: boolean;
  cameraDeviceId?: string;
  micDeviceId?: string;
  quality: QualityMode;
}

export interface RecordedTrack {
  blob: Blob;
  mimeType: string;
  fileExtension: string;
}

export interface RecordingResult {
  /** Primary recording: screen (or camera when screen is off) + audio. */
  main: RecordedTrack;
  /** Separate camera recording when screen + camera were both captured. */
  bubble?: RecordedTrack;
  /** Seconds of recorded content (pauses excluded). */
  durationSec: number;
  /** bubble recorder start minus main recorder start, in seconds. */
  bubbleOffsetSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export class RecordingError extends Error {
  constructor(
    public readonly code:
      | "screen-cancelled"
      | "camera-denied"
      | "mic-denied"
      | "no-format"
      | "recorder-failed",
    message: string,
  ) {
    super(message);
  }
}

type SessionState = "idle" | "recording" | "paused" | "stopped";

/**
 * Owns every media resource of one recording: streams, recorders, and the
 * audio mixing graph. All resources are released in stop()/dispose() —
 * nothing leaks past the session.
 */
export class RecordingSession {
  private displayStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;

  private mainRecorder: MediaRecorder | null = null;
  private bubbleRecorder: MediaRecorder | null = null;
  private mainChunks: Blob[] = [];
  private bubbleChunks: Blob[] = [];
  private mainFormat: RecordingFormat | null = null;
  private bubbleFormat: RecordingFormat | null = null;

  private mainStartMs = 0;
  private bubbleStartMs = 0;
  private recordStartMs = 0;
  private pausedAtMs = 0;
  private pausedTotalMs = 0;

  private captureWidth = 0;
  private captureHeight = 0;
  private hasAudio = false;

  state: SessionState = "idle";

  /** Fired when capture ends outside the app (e.g. browser "Stop sharing"). */
  onExternalStop: (() => void) | null = null;

  /** Live camera stream for the on-screen bubble preview during recording. */
  get liveCameraStream(): MediaStream | null {
    return this.cameraStream;
  }

  constructor(private readonly config: RecordingConfig) {}

  /** Request permissions and acquire all streams. Throws RecordingError. */
  async acquire(): Promise<void> {
    const { config } = this;
    try {
      if (config.screen) {
        const options = {
          video: displayConstraintsFor(config.quality),
          audio: config.systemAudio,
          // Chromium-only hints; ignored elsewhere.
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
          systemAudio: "include",
        } as DisplayMediaStreamOptions;
        this.displayStream = await navigator.mediaDevices.getDisplayMedia(options);
        const [videoTrack] = this.displayStream.getVideoTracks();
        videoTrack.addEventListener("ended", () => {
          if (this.state === "recording" || this.state === "paused") {
            this.onExternalStop?.();
          }
        });
      }
    } catch (error: unknown) {
      this.dispose();
      throw new RecordingError(
        "screen-cancelled",
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Screen sharing was cancelled."
          : "Could not start screen capture.",
      );
    }

    try {
      if (config.camera) {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: cameraConstraintsFor(config.quality, config.cameraDeviceId),
        });
      }
    } catch {
      this.dispose();
      throw new RecordingError(
        "camera-denied",
        "Camera access was denied. Allow camera access in the browser, or turn the camera off.",
      );
    }

    try {
      if (config.mic) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: config.micDeviceId ? { exact: config.micDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48_000,
            channelCount: 1,
          },
        });
      }
    } catch {
      this.dispose();
      throw new RecordingError(
        "mic-denied",
        "Microphone access was denied. Allow microphone access in the browser, or turn the mic off.",
      );
    }
  }

  /** Build streams and start the recorder(s). Call after acquire(). */
  start(): void {
    const mainVideoTrack = this.config.screen
      ? this.displayStream!.getVideoTracks()[0]
      : this.cameraStream!.getVideoTracks()[0];

    const settings = mainVideoTrack.getSettings();
    this.captureWidth = settings.width ?? 1920;
    this.captureHeight = settings.height ?? 1080;
    const frameRate = settings.frameRate ?? 30;

    const audioTrack = this.buildAudioTrack();
    this.hasAudio = audioTrack !== null;

    this.mainFormat = bestRecordingFormat(this.hasAudio);
    if (!this.mainFormat) {
      this.dispose();
      throw new RecordingError("no-format", "No supported recording format found in this browser.");
    }

    const mainTracks = audioTrack ? [mainVideoTrack, audioTrack] : [mainVideoTrack];
    const mainStream = new MediaStream(mainTracks);
    this.mainRecorder = new MediaRecorder(mainStream, {
      mimeType: this.mainFormat.mimeType,
      videoBitsPerSecond: videoBitrateFor(
        this.captureWidth,
        this.captureHeight,
        frameRate,
        this.config.quality,
      ),
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    this.mainRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.mainChunks.push(e.data);
    };
    this.mainRecorder.onstart = () => {
      this.mainStartMs = performance.now();
    };

    // Separate synchronized camera recording, so the bubble stays editable
    // after recording (position, size, visibility).
    if (this.config.screen && this.config.camera && this.cameraStream) {
      this.bubbleFormat = bestRecordingFormat(false);
      if (this.bubbleFormat) {
        const cameraTrack = this.cameraStream.getVideoTracks()[0];
        const cameraSettings = cameraTrack.getSettings();
        this.bubbleRecorder = new MediaRecorder(new MediaStream([cameraTrack]), {
          mimeType: this.bubbleFormat.mimeType,
          videoBitsPerSecond: videoBitrateFor(
            cameraSettings.width ?? 1280,
            cameraSettings.height ?? 720,
            cameraSettings.frameRate ?? 30,
            "standard",
          ),
        });
        this.bubbleRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.bubbleChunks.push(e.data);
        };
        this.bubbleRecorder.onstart = () => {
          this.bubbleStartMs = performance.now();
        };
      }
    }

    this.recordStartMs = performance.now();
    this.pausedTotalMs = 0;
    this.mainRecorder.start(1000);
    this.bubbleRecorder?.start(1000);
    this.state = "recording";
  }

  pause(): void {
    if (this.state !== "recording") return;
    this.mainRecorder?.pause();
    this.bubbleRecorder?.pause();
    this.pausedAtMs = performance.now();
    this.state = "paused";
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.mainRecorder?.resume();
    this.bubbleRecorder?.resume();
    this.pausedTotalMs += performance.now() - this.pausedAtMs;
    this.state = "recording";
  }

  /** Recorded seconds so far, excluding paused time. */
  elapsedSec(): number {
    if (this.state === "idle") return 0;
    const pausedExtra = this.state === "paused" ? performance.now() - this.pausedAtMs : 0;
    return Math.max(0, (performance.now() - this.recordStartMs - this.pausedTotalMs - pausedExtra) / 1000);
  }

  /** Stop recording, release every resource, and return the recorded media. */
  async stop(): Promise<RecordingResult> {
    if (!this.mainRecorder) throw new RecordingError("recorder-failed", "Recording never started.");
    const durationSec = this.elapsedSec();
    this.state = "stopped";

    const stopRecorder = (recorder: MediaRecorder): Promise<void> =>
      new Promise((resolve) => {
        if (recorder.state === "inactive") return resolve();
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });

    const recorders = [stopRecorder(this.mainRecorder)];
    if (this.bubbleRecorder) recorders.push(stopRecorder(this.bubbleRecorder));
    await Promise.all(recorders);

    const main: RecordedTrack = {
      blob: new Blob(this.mainChunks, { type: this.mainFormat!.mimeType }),
      mimeType: this.mainFormat!.mimeType,
      fileExtension: this.mainFormat!.fileExtension,
    };
    let bubble: RecordedTrack | undefined;
    if (this.bubbleRecorder && this.bubbleChunks.length > 0) {
      bubble = {
        blob: new Blob(this.bubbleChunks, { type: this.bubbleFormat!.mimeType }),
        mimeType: this.bubbleFormat!.mimeType,
        fileExtension: this.bubbleFormat!.fileExtension,
      };
    }
    const bubbleOffsetSec =
      bubble && this.bubbleStartMs > 0 ? (this.bubbleStartMs - this.mainStartMs) / 1000 : 0;

    this.mainChunks = [];
    this.bubbleChunks = [];
    this.dispose();

    return {
      main,
      bubble,
      durationSec,
      bubbleOffsetSec,
      width: this.captureWidth,
      height: this.captureHeight,
      hasAudio: this.hasAudio,
    };
  }

  /** Release all streams, tracks, and audio nodes. Safe to call twice. */
  dispose(): void {
    for (const stream of [this.displayStream, this.cameraStream, this.micStream]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    this.displayStream = null;
    this.cameraStream = null;
    this.micStream = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.mainRecorder = null;
    this.bubbleRecorder = null;
  }

  /**
   * Pick the audio track for the main recording.
   * Single source → used directly (no extra processing). Mic + system audio
   * → mixed through a lightweight Web Audio graph.
   */
  private buildAudioTrack(): MediaStreamTrack | null {
    const micTrack = this.micStream?.getAudioTracks()[0] ?? null;
    const systemTrack = this.displayStream?.getAudioTracks()[0] ?? null;

    if (micTrack && systemTrack) {
      this.audioContext = new AudioContext({ sampleRate: 48_000 });
      const destination = this.audioContext.createMediaStreamDestination();
      this.audioContext
        .createMediaStreamSource(new MediaStream([micTrack]))
        .connect(destination);
      this.audioContext
        .createMediaStreamSource(new MediaStream([systemTrack]))
        .connect(destination);
      return destination.stream.getAudioTracks()[0];
    }
    return micTrack ?? systemTrack;
  }
}
