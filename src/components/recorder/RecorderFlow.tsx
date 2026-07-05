"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecordingError, RecordingSession, type RecordingConfig } from "@/lib/media/recorder";
import { createProjectFromRecording, putMedia } from "@/lib/store/projects";
import {
  unlockAudio,
  playCountdownBeep,
  playRecordStart,
  playRecordPause,
  playRecordResume,
  playRecordStop,
} from "@/lib/audio/chimes";
import { SetupPanel } from "./SetupPanel";
import { RecordingHud } from "./RecordingHud";
import { Button } from "@/components/ui/Button";

type FlowState =
  | { phase: "setup" }
  | { phase: "acquiring" }
  | { phase: "countdown"; count: number }
  | { phase: "recording"; paused: boolean }
  | { phase: "saving" }
  | { phase: "error"; message: string };

interface RecorderFlowProps {
  onClose: () => void;
}

const COUNTDOWN_SECONDS = 3;

export function RecorderFlow({ onClose }: RecorderFlowProps) {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>({ phase: "setup" });
  const sessionRef = useRef<RecordingSession | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const disposeSession = useCallback(() => {
    clearCountdown();
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, [clearCountdown]);

  // Release capture if the component unmounts mid-flow.
  useEffect(() => disposeSession, [disposeSession]);

  const finishRecording = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setFlow({ phase: "saving" });
    try {
      const result = await session.stop();
      sessionRef.current = null;
      const project = await createProjectFromRecording(result);
      // Poster frame for the project card — fire and forget.
      void import("@/lib/media/probe")
        .then(({ capturePoster }) => capturePoster(result.main.blob, Math.min(1, result.durationSec / 2)))
        .then((poster) => (poster ? putMedia(project.id, "thumb", poster) : undefined))
        .catch(() => undefined);
      router.push(`/editor?p=${project.id}`);
    } catch {
      disposeSession();
      setFlow({
        phase: "error",
        message:
          "The recording could not be saved. Your browser may be low on storage — free some space and try again.",
      });
    }
  }, [disposeSession, router]);

  const startRecording = useCallback(
    async (config: RecordingConfig) => {
      setFlow({ phase: "acquiring" });
      const session = new RecordingSession(config);
      sessionRef.current = session;
      session.onExternalStop = () => void finishRecording();
      try {
        await session.acquire();
      } catch (error: unknown) {
        sessionRef.current = null;
        if (error instanceof RecordingError && error.code === "screen-cancelled") {
          setFlow({ phase: "setup" });
          return;
        }
        setFlow({
          phase: "error",
          message: error instanceof RecordingError ? error.message : "Could not start recording.",
        });
        return;
      }

      // 3-second countdown; cancelling releases the captured streams.
      setFlow({ phase: "countdown", count: COUNTDOWN_SECONDS });
      playCountdownBeep(COUNTDOWN_SECONDS);
      let remaining = COUNTDOWN_SECONDS;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdown();
          try {
            session.start();
            playRecordStart();
            setFlow({ phase: "recording", paused: false });
          } catch (error: unknown) {
            disposeSession();
            setFlow({
              phase: "error",
              message:
                error instanceof RecordingError ? error.message : "Recording failed to start.",
            });
          }
        } else {
          playCountdownBeep(remaining);
          setFlow({ phase: "countdown", count: remaining });
        }
      }, 1000);
    },
    [clearCountdown, disposeSession, finishRecording],
  );

  const cancelEverything = useCallback(() => {
    disposeSession();
    onClose();
  }, [disposeSession, onClose]);

  if (flow.phase === "setup" || flow.phase === "acquiring") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="New recording">
        {flow.phase === "setup" ? (
          <SetupPanel
            onStart={(config) => {
              unlockAudio();
              void startRecording(config);
            }}
            onCancel={onClose}
          />
        ) : (
          <div className="rise-in rounded-xl border border-edge bg-panel px-8 py-6 text-center shadow-2xl">
            <p className="text-sm text-ink-dim">Waiting for you to choose what to share…</p>
          </div>
        )}
      </div>
    );
  }

  if (flow.phase === "countdown") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
        <div
          key={flow.count}
          className="countdown-pop font-display tnum text-[140px] font-semibold leading-none text-white drop-shadow-2xl"
          aria-live="assertive"
        >
          {flow.count}
        </div>
        <p className="mt-6 text-sm font-medium text-white/60">
          Switch to what you want to capture
        </p>
        <Button variant="onDark" size="sm" className="mt-6" onClick={cancelEverything}>
          Cancel
        </Button>
      </div>
    );
  }

  if (flow.phase === "recording") {
    const session = sessionRef.current;
    if (!session) return null;
    return (
      <RecordingHud
        session={session}
        paused={flow.paused}
        onPause={() => {
          session.pause();
          playRecordPause();
          setFlow({ phase: "recording", paused: true });
        }}
        onResume={() => {
          session.resume();
          playRecordResume();
          setFlow({ phase: "recording", paused: false });
        }}
        onStop={() => {
          playRecordStop();
          void finishRecording();
        }}
        onDiscard={cancelEverything}
      />
    );
  }

  if (flow.phase === "saving") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rise-in flex items-center gap-3 rounded-xl border border-edge bg-panel px-6 py-4 shadow-2xl">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ok" aria-hidden />
          <p className="text-sm text-ink">Finishing up…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="alertdialog">
      <div className="rise-in max-w-sm rounded-xl border border-edge bg-panel p-6 shadow-2xl">
        <h2 className="font-display text-[15px] font-medium">Recording didn&apos;t start</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{flow.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setFlow({ phase: "setup" })}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelEverything}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
