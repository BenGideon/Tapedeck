"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/media/format";
import type { RecordingSession } from "@/lib/media/recorder";

interface RecordingHudProps {
  session: RecordingSession;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
}

/** Compact floating controls shown while recording. Timer updates via a
 * 500ms interval — never per frame. */
export function RecordingHud({
  session,
  paused,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: RecordingHudProps) {
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(session.elapsedSec()), 500);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    const stream = session.liveCameraStream;
    if (cameraRef.current && stream) {
      cameraRef.current.srcObject = stream;
    }
  }, [session]);

  return (
    <div className="rise-in fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
      {/* Camera bubble with pulsing ring */}
      {session.liveCameraStream && (
        <div className="relative">
          {/* Outer pulsing ring */}
          {!paused && (
            <span
              aria-hidden
              className="rec-ring-pulse absolute inset-0 rounded-full border-2 border-rec/60"
              style={{ margin: "-6px" }}
            />
          )}
          <div
            className={`h-36 w-36 overflow-hidden rounded-full border-[3px] shadow-2xl shadow-black/60 transition-all duration-300 ${
              paused ? "border-warn/70 opacity-70 grayscale" : "border-white/90"
            }`}
          >
            <video
              ref={cameraRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full scale-x-[-1] object-cover"
            />
          </div>
          {/* Paused overlay */}
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="white" aria-hidden>
                <rect x="4" y="3" width="3" height="10" rx="1" />
                <rect x="9" y="3" width="3" height="10" rx="1" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Controls pill */}
      <div className="flex items-center gap-1 rounded-full border border-edge bg-panel/95 py-1.5 pl-4 pr-1.5 shadow-xl shadow-black/40 backdrop-blur">
        {/* Status dot */}
        <span
          className={`mr-1 h-2.5 w-2.5 rounded-full transition-colors ${
            paused ? "bg-warn" : "bg-rec rec-pulse"
          }`}
          aria-hidden
        />
        {/* Timer */}
        <span
          className="tnum mr-2 min-w-[48px] text-sm font-medium text-ink"
          aria-label="Elapsed time"
        >
          {formatClock(elapsed)}
        </span>

        {/* Pause / Resume */}
        <button
          onClick={paused ? onResume : onPause}
          aria-label={paused ? "Resume recording" : "Pause recording"}
          title={paused ? "Resume" : "Pause"}
          className="rounded-full p-2 text-ink-dim transition-all hover:bg-panel-2 hover:text-ink active:scale-95"
        >
          {paused ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M5 3.5v9l7.5-4.5L5 3.5z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="4" y="3" width="3" height="10" rx="1" />
              <rect x="9" y="3" width="3" height="10" rx="1" />
            </svg>
          )}
        </button>

        {/* Discard */}
        <button
          onClick={onDiscard}
          aria-label="Discard recording"
          title="Discard"
          className="rounded-full p-2 text-ink-dim transition-all hover:bg-panel-2 hover:text-ink active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 4.5h10M6.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.5 8a1 1 0 001 .95h3a1 1 0 001-.95l.5-8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Stop — big, prominent, with inner square icon */}
        <button
          onClick={onStop}
          aria-label="Stop and finish recording"
          title="Stop recording"
          className="group relative ml-1 flex items-center gap-2 overflow-hidden rounded-full bg-rec px-4 py-2 text-sm font-medium text-white shadow-md shadow-rec/30 transition-all hover:brightness-110 hover:shadow-lg hover:shadow-rec/40 active:scale-95"
        >
          <span className="h-2.5 w-2.5 rounded-[3px] bg-white transition-transform group-hover:scale-90" aria-hidden />
          Stop
        </button>
      </div>

      {paused && (
        <p className="ml-1 rounded-lg bg-panel/90 px-3 py-1.5 text-[12px] font-medium text-warn shadow-md shadow-black/30 backdrop-blur-sm">
          Paused — nothing is being captured.
        </p>
      )}
    </div>
  );
}
