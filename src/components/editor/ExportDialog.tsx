"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { exportProject, type ExportHandle, type ExportMode } from "@/lib/export/exporter";
import { downloadBlob, safeFilename } from "@/lib/download";
import { formatBytes } from "@/lib/media/format";
import type { EditDoc, ProjectMeta } from "@/lib/store/types";

interface ExportDialogProps {
  meta: ProjectMeta;
  mainBlob: Blob;
  bubbleBlob: Blob | null;
  edit: EditDoc;
  title: string;
  onClose: () => void;
}

const MODES: { id: ExportMode; label: string; hint: string }[] = [
  { id: "fast", label: "Fast", hint: "Fastest export. Copies the original media when no edits are needed." },
  { id: "balanced", label: "Balanced", hint: "Strong quality with a reasonable file size. Recommended." },
  { id: "high", label: "High quality", hint: "Source resolution and a higher bitrate. Larger files, slower export." },
];

type Phase =
  | { step: "pick" }
  | { step: "working"; progress: number }
  | { step: "done"; blob: Blob; extension: string }
  | { step: "failed"; message: string };

export function ExportDialog({ meta, mainBlob, bubbleBlob, edit, title, onClose }: ExportDialogProps) {
  const [mode, setMode] = useState<ExportMode>("balanced");
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const handleRef = useRef<ExportHandle | null>(null);

  useEffect(() => {
    return () => handleRef.current?.cancel();
  }, []);

  const start = () => {
    setPhase({ step: "working", progress: 0 });
    const handle = exportProject({
      mainBlob,
      bubbleBlob: bubbleBlob ?? undefined,
      bubbleOffsetSec: meta.bubbleOffsetSec,
      edit,
      width: meta.width,
      height: meta.height,
      mode,
      onProgress: (fraction) =>
        setPhase((current) =>
          current.step === "working" ? { step: "working", progress: fraction } : current,
        ),
    });
    handleRef.current = handle;
    handle.result
      .then(({ blob, fileExtension }) => setPhase({ step: "done", blob, extension: fileExtension }))
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.message.length < 200
            ? error.message
            : "The export failed. Try the Balanced mode, or download the original recording below.";
        setPhase((current) => (current.step === "working" ? { step: "failed", message } : current));
      });
  };

  const cancel = () => {
    handleRef.current?.cancel();
    setPhase({ step: "pick" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Export">
      <div className="rise-in w-[420px] rounded-xl border border-edge bg-panel shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-edge-soft px-5 py-3.5">
          <h2 className="font-display text-[15px] font-medium">Export</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-faint hover:bg-panel-2 hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {phase.step === "pick" && (
            <>
              <div className="space-y-1.5">
                {MODES.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setMode(option.id)}
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                      mode === option.id ? "border-accent/60 bg-panel-2" : "border-edge-soft hover:border-edge"
                    }`}
                  >
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="block text-[12px] leading-snug text-ink-faint">{option.hint}</span>
                  </button>
                ))}
              </div>
              <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start}>
                Export video
              </Button>
            </>
          )}

          {phase.step === "working" && (
            <div className="py-2">
              <p className="mb-3 text-sm text-ink">Exporting…</p>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(phase.progress * 100)}%` }}
                />
              </div>
              <p className="tnum mt-2 text-[12px] text-ink-faint">{Math.round(phase.progress * 100)}%</p>
              <Button variant="ghost" size="sm" className="mt-4" onClick={cancel}>
                Cancel
              </Button>
            </div>
          )}

          {phase.step === "done" && (
            <div className="py-2 text-center">
              <p className="text-sm text-ink">
                Ready — {formatBytes(phase.blob.size)} ({phase.extension.toUpperCase()})
              </p>
              <Button
                variant="rec"
                size="lg"
                className="mt-4 w-full"
                onClick={() => downloadBlob(phase.blob, safeFilename(title, phase.extension))}
              >
                Download video
              </Button>
              <button onClick={() => setPhase({ step: "pick" })} className="mt-3 text-[12px] text-ink-faint hover:text-ink">
                Export again with different settings
              </button>
            </div>
          )}

          {phase.step === "failed" && (
            <div className="py-2">
              <p className="text-sm leading-relaxed text-warn">{phase.message}</p>
              <Button variant="primary" size="sm" className="mt-4" onClick={() => setPhase({ step: "pick" })}>
                Back
              </Button>
            </div>
          )}

          <div className="mt-5 border-t border-edge-soft pt-3 text-center">
            <button
              onClick={() => downloadBlob(mainBlob, safeFilename(`${title} (original)`, meta.mainExtension))}
              className="text-[12px] text-ink-faint underline underline-offset-4 hover:text-ink"
            >
              Download original recording ({formatBytes(mainBlob.size)})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
