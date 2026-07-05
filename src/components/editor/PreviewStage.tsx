"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackController } from "@/lib/editor/controller";
import { ensureSeekableDuration } from "@/lib/editor/controller";
import { bubbleRect } from "@/lib/editor/bubbleLayout";
import { OVERLAY_PRESETS, OVERLAY_FONT_FAMILY, overlayDisplayText } from "@/lib/editor/overlayStyle";
import type { EditDoc, Overlay, ProjectMeta } from "@/lib/store/types";

interface PreviewStageProps {
  controller: PlaybackController;
  meta: ProjectMeta;
  mainUrl: string;
  bubbleUrl: string | null;
  edit: EditDoc;
  playing: boolean;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateEdit: (updater: (current: EditDoc) => EditDoc) => void;
  onDurationKnown: (duration: number) => void;
}

/** Pointer-drag helper: reports movement as fractions of the stage size. */
function useFractionDrag(
  stageRef: React.RefObject<HTMLDivElement | null>,
  onDrag: (dxFrac: number, dyFrac: number) => void,
) {
  return useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      let lastX = event.clientX;
      let lastY = event.clientY;
      const onMove = (moveEvent: PointerEvent) => {
        const dxFrac = (moveEvent.clientX - lastX) / rect.width;
        const dyFrac = (moveEvent.clientY - lastY) / rect.height;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        onDrag(dxFrac, dyFrac);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [stageRef, onDrag],
  );
}

export function PreviewStage({
  controller,
  meta,
  mainUrl,
  bubbleUrl,
  edit,
  playing,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateEdit,
  onDurationKnown,
}: PreviewStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLVideoElement>(null);
  const bubbleVideoRef = useRef<HTMLVideoElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [visibleOverlayIds, setVisibleOverlayIds] = useState("");
  const [playbackRate, setPlaybackRate] = useState(1);

  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Attach media elements to the playback controller.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    controller.attach(main, bubbleUrl ? bubbleVideoRef.current : null, meta.bubbleOffsetSec);
    const onMetadata = () => {
      void ensureSeekableDuration(main).then(onDurationKnown);
    };
    main.addEventListener("loadedmetadata", onMetadata);
    return () => {
      main.removeEventListener("loadedmetadata", onMetadata);
      controller.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, mainUrl, bubbleUrl]);

  // Measure the video frame box for fraction→pixel conversion. Immediate
  // measurement + window resize + ResizeObserver (belt and suspenders — some
  // environments deliver these signals unreliably).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setStageSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    const settleTimer = setInterval(measure, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearInterval(settleTimer);
    };
  }, []);

  // Show/hide overlays with playback time. React state changes only when the
  // visible set changes, not per frame.
  useEffect(() => {
    return controller.subscribe((time) => {
      const ids = edit.overlays
        .filter((o) => time >= o.start && time <= o.end)
        .map((o) => o.id)
        .join(",");
      setVisibleOverlayIds((prev) => (prev === ids ? prev : ids));
    });
  }, [controller, edit.overlays]);

  const dragBubble = useFractionDrag(stageRef, (dx, dy) => {
    onUpdateEdit((current) => ({
      ...current,
      camera: {
        ...current.camera,
        x: Math.min(1, Math.max(0, current.camera.x + dx)),
        y: Math.min(1, Math.max(0, current.camera.y + dy)),
      },
    }));
  });

  const resizeBubble = useFractionDrag(stageRef, (_dx, dy) => {
    onUpdateEdit((current) => ({
      ...current,
      camera: {
        ...current.camera,
        size: Math.min(0.6, Math.max(0.08, current.camera.size + dy)),
      },
    }));
  });

  const showBubble = Boolean(bubbleUrl) && edit.camera.visible;
  const rect =
    showBubble && stageSize.width > 0
      ? bubbleRect(edit.camera, stageSize.width, stageSize.height)
      : null;

  const handleSpeedChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      controller.setPlaybackRate(rate);
    },
    [controller],
  );

  const visibleSet = new Set(visibleOverlayIds.split(",").filter(Boolean));

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-black/40 p-6 gap-3">
      <div
        ref={stageRef}
        className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-black shadow-2xl shadow-black/50"
        style={{ aspectRatio: `${meta.width} / ${meta.height}`, width: "100%" }}
        onClick={() => {
          onSelectOverlay(null);
          void controller.togglePlay();
        }}
      >
        <video ref={mainRef} src={mainUrl} playsInline preload="auto" className="h-full w-full" />

        {showBubble && rect && (
          <div
            role="button"
            aria-label="Camera bubble — drag to move"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={dragBubble}
            className="group absolute cursor-grab border-[3px] border-white/85 shadow-xl shadow-black/50 transition-opacity active:cursor-grabbing"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              borderRadius: edit.camera.shape === "circle" ? "9999px" : `${rect.h * 0.12}px`,
              overflow: "hidden",
            }}
          >
            <video
              ref={bubbleVideoRef}
              src={bubbleUrl!}
              playsInline
              muted
              preload="auto"
              className="h-full w-full object-cover"
            />
            <span
              onPointerDown={resizeBubble}
              aria-label="Resize camera bubble"
              className="absolute bottom-1 right-1 hidden h-4 w-4 cursor-nwse-resize rounded-full border border-white/40 bg-black/60 group-hover:block"
            />
          </div>
        )}

        {/* Hidden bubble video for sync when bubble is hidden */}
        {bubbleUrl && !showBubble && (
          <video
            ref={bubbleVideoRef}
            src={bubbleUrl}
            playsInline
            muted
            preload="auto"
            className="sr-only"
          />
        )}

        {stageSize.height > 0 &&
          edit.overlays.map((overlay) => {
            const isVisible = visibleSet.has(overlay.id) || selectedOverlayId === overlay.id;
            if (!isVisible) return null;
            return (
              <OverlayElement
                key={overlay.id}
                overlay={overlay}
                stageHeight={stageSize.height}
                selected={selectedOverlayId === overlay.id}
                stageRef={stageRef}
                onSelect={() => onSelectOverlay(overlay.id)}
                onMove={(dx, dy) =>
                  onUpdateEdit((current) => ({
                    ...current,
                    overlays: current.overlays.map((o) =>
                      o.id === overlay.id
                        ? {
                            ...o,
                            x: Math.min(1, Math.max(0, o.x + dx)),
                            y: Math.min(1, Math.max(0, o.y + dy)),
                          }
                        : o,
                    ),
                  }))
                }
              />
            );
          })}

        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden>
                <path d="M8 5.5v13l11-6.5-11-6.5z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* ── Speed selector bar ── */}
      <div
        className="flex items-center gap-0.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 backdrop-blur-sm"
        aria-label="Playback speed"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mr-2 text-[11px] font-medium text-white/50 select-none">SPEED</span>
        {SPEED_OPTIONS.map((rate) => (
          <button
            key={rate}
            onClick={() => handleSpeedChange(rate)}
            aria-label={`${rate}× speed`}
            aria-pressed={playbackRate === rate}
            className={`min-w-[38px] rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors duration-100 ${
              playbackRate === rate
                ? "bg-accent text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {rate === 1 ? "1×" : `${rate}×`}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverlayElement({
  overlay,
  stageHeight,
  selected,
  stageRef,
  onSelect,
  onMove,
}: {
  overlay: Overlay;
  stageHeight: number;
  selected: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onMove: (dxFrac: number, dyFrac: number) => void;
}) {
  const style = OVERLAY_PRESETS[overlay.preset];
  const fontSize = style.fontSizeFrac * stageHeight;
  const drag = useFractionDrag(stageRef, onMove);

  return (
    <div
      role="button"
      aria-label={`Overlay: ${overlay.text}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => {
        onSelect();
        drag(e);
      }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab select-none whitespace-pre active:cursor-grabbing ${
        selected ? "ring-2 ring-accent/80 ring-offset-1 ring-offset-transparent" : ""
      }`}
      style={{
        left: `${overlay.x * 100}%`,
        top: `${overlay.y * 100}%`,
        fontFamily: OVERLAY_FONT_FAMILY,
        fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        background: style.background ?? "transparent",
        padding: `${style.paddingYFrac * stageHeight * 2.2}px ${style.paddingXFrac * stageHeight * 2.2}px`,
        borderRadius: Math.min(style.radiusFrac * stageHeight * 4, fontSize),
        textShadow: style.shadow ? "0 2px 8px rgba(0,0,0,0.55)" : undefined,
        letterSpacing: style.uppercase ? "0.06em" : undefined,
        lineHeight: 1.25,
      }}
    >
      {overlayDisplayText(overlay)}
    </div>
  );
}
