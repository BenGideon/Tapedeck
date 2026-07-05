"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackController } from "@/lib/editor/controller";
import { formatTimecode, formatClock } from "@/lib/media/format";
import type { EditDoc } from "@/lib/store/types";

interface TimelineProps {
  controller: PlaybackController;
  duration: number;
  edit: EditDoc;
  mainBlob: Blob;
  playing: boolean;
  selectedSegment: number | null;
  onSelectSegment: (index: number | null) => void;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateEdit: (updater: (current: EditDoc) => EditDoc) => void;
}

const MIN_SEGMENT_SEC = 0.2;
const THUMB_HEIGHT = 56;

export function Timeline({
  controller,
  duration,
  edit,
  mainBlob,
  playing,
  selectedSegment,
  onSelectSegment,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateEdit,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  // Playhead + clock update via direct DOM writes — zero React re-renders.
  useEffect(() => {
    return controller.subscribe((time) => {
      if (playheadRef.current && duration > 0) {
        playheadRef.current.style.left = `${Math.min(100, (time / duration) * 100)}%`;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatTimecode(time);
      }
    });
  }, [controller, duration]);

  // Sampled thumbnails: at most 14, generated once per project.
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    if (duration <= 0) return;
    const count = Math.max(6, Math.min(14, Math.ceil(duration / 5)));
    const timestamps = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * duration);
    void import("@/lib/media/probe").then(async ({ generateThumbnails }) => {
      const generated = await generateThumbnails(mainBlob, timestamps, THUMB_HEIGHT * 2);
      if (cancelled) {
        generated.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      urls = generated;
      setThumbnails(generated);
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainBlob, duration > 0]);

  const timeAtClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return frac * duration;
    },
    [duration],
  );

  const beginSeekDrag = useCallback(
    (event: React.PointerEvent) => {
      controller.seek(timeAtClientX(event.clientX));
      const onMove = (moveEvent: PointerEvent) => controller.seek(timeAtClientX(moveEvent.clientX));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [controller, timeAtClientX],
  );

  const beginHandleDrag = useCallback(
    (event: React.PointerEvent, segmentIndex: number, side: "start" | "end") => {
      event.stopPropagation();
      const onMove = (moveEvent: PointerEvent) => {
        const t = timeAtClientX(moveEvent.clientX);
        onUpdateEdit((current) => {
          const segments = current.segments.map((s) => ({ ...s }));
          const segment = segments[segmentIndex];
          if (!segment) return current;
          if (side === "start") {
            const lowerBound = segmentIndex > 0 ? segments[segmentIndex - 1].end + 0.05 : 0;
            segment.start = Math.min(segment.end - MIN_SEGMENT_SEC, Math.max(lowerBound, t));
          } else {
            const upperBound =
              segmentIndex < segments.length - 1 ? segments[segmentIndex + 1].start - 0.05 : duration;
            segment.end = Math.max(segment.start + MIN_SEGMENT_SEC, Math.min(upperBound, t));
          }
          return { ...current, segments };
        });
        controller.seek(t);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [controller, duration, onUpdateEdit, timeAtClientX],
  );

  const splitAtPlayhead = useCallback(() => {
    const t = controller.currentTime;
    onUpdateEdit((current) => {
      const index = current.segments.findIndex(
        (s) => t > s.start + MIN_SEGMENT_SEC && t < s.end - MIN_SEGMENT_SEC,
      );
      if (index === -1) return current;
      const segment = current.segments[index];
      const segments = [
        ...current.segments.slice(0, index),
        { start: segment.start, end: t },
        { start: t, end: segment.end },
        ...current.segments.slice(index + 1),
      ];
      return { ...current, segments };
    });
  }, [controller, onUpdateEdit]);

  const deleteSelectedSegment = useCallback(() => {
    if (selectedSegment === null) return;
    onUpdateEdit((current) => {
      if (current.segments.length <= 1) return current;
      return { ...current, segments: current.segments.filter((_, i) => i !== selectedSegment) };
    });
    onSelectSegment(null);
  }, [selectedSegment, onUpdateEdit, onSelectSegment]);

  const restoreAll = useCallback(() => {
    onUpdateEdit((current) => ({ ...current, segments: [{ start: 0, end: duration }] }));
    onSelectSegment(null);
  }, [duration, onUpdateEdit, onSelectSegment]);

  const overlayRow = edit.overlays.length > 0;
  const isTrimmed =
    edit.segments.length > 1 ||
    (edit.segments[0] && (edit.segments[0].start > 0.05 || edit.segments[0].end < duration - 0.05));

  return (
    <div className="shrink-0 border-t border-edge-soft bg-panel px-4 pb-4 pt-2">
      <div className="mb-2 flex items-center gap-3">
        <button
          onClick={() => void controller.togglePlay()}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg hover:opacity-85"
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4 2.5v11L14 8 4 2.5z" />
            </svg>
          )}
        </button>
        <span className="tnum text-[13px] text-ink-dim">
          <span ref={timeLabelRef} className="text-ink">0:00.0</span>
          {"  /  "}
          {formatClock(duration)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={splitAtPlayhead}
            className="rounded-md border border-edge px-2.5 py-1 text-[12px] text-ink-dim hover:border-ink-faint hover:text-ink"
            title="Split the clip at the playhead"
          >
            Split
          </button>
          <button
            onClick={deleteSelectedSegment}
            disabled={selectedSegment === null || edit.segments.length <= 1}
            className="rounded-md border border-edge px-2.5 py-1 text-[12px] text-ink-dim hover:border-rec hover:text-rec disabled:opacity-35"
            title="Delete the selected section"
          >
            Delete section
          </button>
          {isTrimmed && (
            <button
              onClick={restoreAll}
              className="rounded-md px-2.5 py-1 text-[12px] text-ink-faint hover:text-ink"
              title="Undo all trims and cuts"
            >
              Restore all
            </button>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative select-none overflow-hidden rounded-md border border-edge bg-bg"
        style={{ height: THUMB_HEIGHT + (overlayRow ? 22 : 0) }}
        onPointerDown={beginSeekDrag}
      >
        {/* Thumbnail strip */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex" style={{ height: THUMB_HEIGHT }}>
          {thumbnails.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              className="h-full min-w-0 flex-1 object-cover opacity-80"
              draggable={false}
            />
          ))}
        </div>

        {/* Cut regions (dimmed) + segments */}
        {duration > 0 &&
          buildCutRegions(edit, duration).map((cut, i) => (
            <div
              key={`cut-${i}`}
              className="pointer-events-none absolute top-0 bg-black/72 backdrop-saturate-0"
              style={{
                left: `${(cut.start / duration) * 100}%`,
                width: `${((cut.end - cut.start) / duration) * 100}%`,
                height: THUMB_HEIGHT,
              }}
            />
          ))}

        {duration > 0 &&
          edit.segments.map((segment, index) => {
            const left = (segment.start / duration) * 100;
            const width = ((segment.end - segment.start) / duration) * 100;
            const selected = selectedSegment === index;
            return (
              <div key={`seg-${index}`}>
                <div
                  className={`absolute top-0 cursor-pointer border-y-2 ${
                    selected ? "border-accent bg-accent/10" : "border-transparent hover:border-ink-faint/40"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%`, height: THUMB_HEIGHT }}
                  onPointerDown={(e) => {
                    onSelectSegment(index);
                    beginSeekDrag(e);
                  }}
                />
                {/* Trim handles */}
                <div
                  role="slider"
                  aria-label={`Section ${index + 1} start`}
                  aria-valuenow={segment.start}
                  className="absolute top-0 z-10 w-[10px] -translate-x-1/2 cursor-ew-resize"
                  style={{ left: `${left}%`, height: THUMB_HEIGHT }}
                  onPointerDown={(e) => beginHandleDrag(e, index, "start")}
                >
                  <div className="mx-auto h-full w-[4px] rounded-sm bg-accent" />
                </div>
                <div
                  role="slider"
                  aria-label={`Section ${index + 1} end`}
                  aria-valuenow={segment.end}
                  className="absolute top-0 z-10 w-[10px] -translate-x-1/2 cursor-ew-resize"
                  style={{ left: `${left + width}%`, height: THUMB_HEIGHT }}
                  onPointerDown={(e) => beginHandleDrag(e, index, "end")}
                >
                  <div className="mx-auto h-full w-[4px] rounded-sm bg-accent" />
                </div>
              </div>
            );
          })}

        {/* Overlay chips */}
        {overlayRow &&
          duration > 0 &&
          edit.overlays.map((overlay) => (
            <button
              key={overlay.id}
              className={`absolute bottom-[2px] h-[16px] truncate rounded-sm px-1.5 text-left text-[10px] leading-[16px] ${
                selectedOverlayId === overlay.id
                  ? "bg-accent text-bg"
                  : "bg-panel-2 text-ink-dim hover:text-ink"
              }`}
              style={{
                left: `${(overlay.start / duration) * 100}%`,
                width: `${Math.max(2, ((overlay.end - overlay.start) / duration) * 100)}%`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectOverlay(overlay.id);
                beginOverlayDrag(e, overlay.id, overlay.start, overlay.end);
              }}
              title={overlay.text}
            >
              {overlay.text || (overlay.kind === "link" ? "Link" : "Text")}
            </button>
          ))}

        {/* Playhead */}
        <div
          ref={playheadRef}
          className="pointer-events-none absolute top-0 z-20 h-full w-px bg-ink"
          style={{ left: "0%" }}
        >
          <div className="absolute -left-[5px] -top-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink" />
        </div>
      </div>
    </div>
  );

  function beginOverlayDrag(
    event: React.PointerEvent,
    overlayId: string,
    startAtDown: number,
    endAtDown: number,
  ) {
    const downX = event.clientX;
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const width = track.getBoundingClientRect().width;
    const length = endAtDown - startAtDown;
    const onMove = (moveEvent: PointerEvent) => {
      const deltaSec = ((moveEvent.clientX - downX) / width) * duration;
      const newStart = Math.min(duration - length, Math.max(0, startAtDown + deltaSec));
      onUpdateEdit((current) => ({
        ...current,
        overlays: current.overlays.map((o) =>
          o.id === overlayId ? { ...o, start: newStart, end: newStart + length } : o,
        ),
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
}

function buildCutRegions(edit: EditDoc, duration: number): { start: number; end: number }[] {
  const cuts: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const segment of edit.segments) {
    if (segment.start > cursor + 0.01) cuts.push({ start: cursor, end: segment.start });
    cursor = segment.end;
  }
  if (cursor < duration - 0.01) cuts.push({ start: cursor, end: duration });
  return cuts;
}
