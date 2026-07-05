import type { EditDoc } from "@/lib/store/types";

type TickListener = (timeSec: number, playing: boolean) => void;

/**
 * Owns playback of the main video + synchronized camera bubble video.
 * Lives outside React: listeners do direct DOM writes on each frame, so the
 * component tree never re-renders during playback.
 */
export class PlaybackController {
  private main: HTMLVideoElement | null = null;
  private bubble: HTMLVideoElement | null = null;
  private bubbleOffsetSec = 0;
  private edit: EditDoc | null = null;
  private rafId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeUpdateHandler: (() => void) | null = null;
  private listeners = new Set<TickListener>();
  private lastBubbleSyncMs = 0;
  private bubblePlayPending = false;

  attach(main: HTMLVideoElement, bubble: HTMLVideoElement | null, bubbleOffsetSec: number): void {
    this.main = main;
    this.bubble = bubble;
    this.bubbleOffsetSec = bubbleOffsetSec;
    this.startLoop();
    // rAF freezes in background/occluded tabs; the interval + timeupdate
    // fallbacks keep cut-skipping and overlay timing working there.
    this.intervalId = setInterval(() => this.tick(), 250);
    this.timeUpdateHandler = () => this.tick();
    main.addEventListener("timeupdate", this.timeUpdateHandler);
  }

  detach(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.main && this.timeUpdateHandler) {
      this.main.removeEventListener("timeupdate", this.timeUpdateHandler);
    }
    this.timeUpdateHandler = null;
    this.main = null;
    this.bubble = null;
    this.listeners.clear();
  }

  setEdit(edit: EditDoc): void {
    this.edit = edit;
  }

  get currentTime(): number {
    return this.main?.currentTime ?? 0;
  }

  get playing(): boolean {
    return Boolean(this.main && !this.main.paused && !this.main.ended);
  }

  subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async play(): Promise<void> {
    const { main, edit } = this;
    if (!main) return;
    if (edit && edit.segments.length > 0) {
      const first = edit.segments[0];
      const last = edit.segments[edit.segments.length - 1];
      // Restart from the first kept frame when at the end.
      if (main.currentTime >= last.end - 0.05) main.currentTime = first.start;
      if (main.currentTime < first.start) main.currentTime = first.start;
    }
    await main.play().catch(() => undefined);
    this.syncBubble(true);
  }

  pause(): void {
    this.main?.pause();
    this.bubble?.pause();
  }

  async togglePlay(): Promise<void> {
    if (this.playing) this.pause();
    else await this.play();
  }

  setPlaybackRate(rate: number): void {
    if (this.main) this.main.playbackRate = rate;
    if (this.bubble) this.bubble.playbackRate = rate;
  }

  seek(timeSec: number): void {
    if (!this.main) return;
    const duration = Number.isFinite(this.main.duration) ? this.main.duration : Infinity;
    this.main.currentTime = Math.max(0, Math.min(timeSec, duration - 0.01));
    this.syncBubble(true);
    this.emit();
  }

  private emit(): void {
    const time = this.currentTime;
    const playing = this.playing;
    for (const listener of this.listeners) listener(time, playing);
  }

  private startLoop(): void {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.tick();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private tick(): void {
    const { main, edit } = this;
    if (!main) return;

    if (this.playing && edit && edit.segments.length > 0) {
      const t = main.currentTime;
      const last = edit.segments[edit.segments.length - 1];
      if (t >= last.end) {
        this.pause();
        main.currentTime = last.end;
      } else {
        // Skip cut regions while playing.
        let inKept = false;
        let nextStart: number | null = null;
        for (const segment of edit.segments) {
          if (t >= segment.start - 0.01 && t < segment.end) {
            inKept = true;
            break;
          }
          if (segment.start > t) {
            nextStart = segment.start;
            break;
          }
        }
        if (!inKept && nextStart !== null) main.currentTime = nextStart;
      }
    }

    this.syncBubble(false);
    this.emit();
  }

  /** Keep the bubble video aligned with the main video. Hard sync on seeks,
   * drift-corrected at most twice a second during playback. Never seeks while
   * a play() request is pending — seeking would cancel it. */
  private syncBubble(force: boolean): void {
    const { main, bubble } = this;
    if (!main || !bubble) return;
    const now = performance.now();
    if (!force && now - this.lastBubbleSyncMs < 500) return;
    this.lastBubbleSyncMs = now;

    const target = Math.max(0, main.currentTime - this.bubbleOffsetSec);
    const drift = Math.abs((bubble.currentTime ?? 0) - target);

    if (this.playing) {
      if (bubble.paused && !this.bubblePlayPending) {
        bubble.currentTime = target;
        this.bubblePlayPending = true;
        bubble
          .play()
          .catch(() => undefined)
          .finally(() => {
            this.bubblePlayPending = false;
          });
      } else if (!bubble.paused && (force || drift > 0.25)) {
        bubble.currentTime = target;
      }
    } else {
      if (!bubble.paused) bubble.pause();
      if (!this.bubblePlayPending && (force || drift > 0.05)) bubble.currentTime = target;
    }
  }
}

/** MediaRecorder WebM blobs report duration=Infinity until seeked. This
 * forces the real duration to become available. */
export async function ensureSeekableDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.currentTime = 0;
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = 1e9;
  });
}
