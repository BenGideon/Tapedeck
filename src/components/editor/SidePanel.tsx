"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackController } from "@/lib/editor/controller";
import { OVERLAY_PRESETS } from "@/lib/editor/overlayStyle";
import { extractSnippet, playSnippet, stopSnippet } from "@/lib/audio/preview";
import { defaultGifStart, generateGif, GIF_DEFAULT_DURATION } from "@/lib/export/gif";
import { putMedia } from "@/lib/store/projects";
import { downloadBlob, safeFilename } from "@/lib/download";
import { formatClock } from "@/lib/media/format";
import type { EditDoc, Overlay, OverlayPreset, ProjectMeta } from "@/lib/store/types";

interface SidePanelProps {
  meta: ProjectMeta;
  mainBlob: Blob;
  edit: EditDoc;
  duration: number;
  editedSeconds: number;
  controller: PlaybackController;
  selectedSegment: number | null;
  onSelectSegment: (index: number | null) => void;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateEdit: (updater: (current: EditDoc) => EditDoc) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-edge-soft px-4 py-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{title}</h3>
      {children}
    </section>
  );
}

const CORNERS: { id: string; x: number; y: number; label: string }[] = [
  { id: "tl", x: 0.11, y: 0.15, label: "Top left" },
  { id: "tr", x: 0.89, y: 0.15, label: "Top right" },
  { id: "bl", x: 0.11, y: 0.85, label: "Bottom left" },
  { id: "br", x: 0.89, y: 0.85, label: "Bottom right" },
];

export function SidePanel({
  meta,
  mainBlob,
  edit,
  duration,
  editedSeconds,
  controller,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateEdit,
}: SidePanelProps) {
  const selectedOverlay = edit.overlays.find((o) => o.id === selectedOverlayId) ?? null;

  const addOverlay = (kind: "text" | "link") => {
    const t = controller.currentTime;
    const overlay: Overlay = {
      id: crypto.randomUUID(),
      kind,
      text: kind === "link" ? "Visit website" : "Your text",
      url: kind === "link" ? "https://" : undefined,
      preset: kind === "link" ? "callout" : "caption",
      x: 0.5,
      y: kind === "link" ? 0.82 : 0.5,
      start: t,
      end: Math.min(duration, t + 4),
    };
    onUpdateEdit((current) => ({ ...current, overlays: [...current.overlays, overlay] }));
    onSelectOverlay(overlay.id);
  };

  const updateOverlay = (id: string, patch: Partial<Overlay>) => {
    onUpdateEdit((current) => ({
      ...current,
      overlays: current.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  };

  const removeOverlay = (id: string) => {
    onUpdateEdit((current) => ({
      ...current,
      overlays: current.overlays.filter((o) => o.id !== id),
    }));
    onSelectOverlay(null);
  };

  return (
    <aside className="thin-scroll w-[300px] shrink-0 overflow-y-auto border-l border-edge-soft bg-panel">
      <Section title="Recording">
        <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
          <dt className="text-ink-faint">Length</dt>
          <dd className="tnum text-right text-ink">{formatClock(duration)}</dd>
          <dt className="text-ink-faint">After edits</dt>
          <dd className="tnum text-right text-ink">{formatClock(editedSeconds)}</dd>
          <dt className="text-ink-faint">Source</dt>
          <dd className="text-right text-ink">
            {meta.width}×{meta.height}
          </dd>
        </dl>
      </Section>

      {meta.hasBubble && (
        <Section title="Camera bubble">
          <label className="mb-3 flex items-center justify-between text-sm text-ink">
            Show camera
            <input
              type="checkbox"
              checked={edit.camera.visible}
              onChange={(e) =>
                onUpdateEdit((current) => ({
                  ...current,
                  camera: { ...current.camera, visible: e.target.checked },
                }))
              }
            />
          </label>
          {edit.camera.visible && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {(["circle", "rounded"] as const).map((shape) => (
                  <button
                    key={shape}
                    onClick={() =>
                      onUpdateEdit((current) => ({
                        ...current,
                        camera: { ...current.camera, shape },
                      }))
                    }
                    className={`rounded-md border px-2 py-1.5 text-[12px] capitalize ${
                      edit.camera.shape === shape
                        ? "border-accent/60 bg-panel-2 text-ink"
                        : "border-edge-soft text-ink-dim hover:border-edge"
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
              <label className="mb-1 block text-[12px] text-ink-faint">Size</label>
              <input
                type="range"
                min={0.1}
                max={0.5}
                step={0.01}
                value={edit.camera.size}
                onChange={(e) =>
                  onUpdateEdit((current) => ({
                    ...current,
                    camera: { ...current.camera, size: Number(e.target.value) },
                  }))
                }
                className="w-full"
                aria-label="Camera bubble size"
              />
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {CORNERS.map((corner) => (
                  <button
                    key={corner.id}
                    title={corner.label}
                    aria-label={`Move camera to ${corner.label}`}
                    onClick={() =>
                      onUpdateEdit((current) => ({
                        ...current,
                        camera: { ...current.camera, x: corner.x, y: corner.y },
                      }))
                    }
                    className="flex h-9 items-center justify-center rounded-md border border-edge-soft hover:border-edge"
                  >
                    <span
                      className={`h-4 w-6 rounded-sm border border-ink-faint ${
                        corner.id.includes("t") ? "self-start mt-1.5" : "self-end mb-1.5"
                      }`}
                    >
                      <span
                        className={`block h-1.5 w-1.5 rounded-full bg-accent ${
                          corner.id.endsWith("l") ? "ml-0.5" : "ml-auto mr-0.5"
                        } mt-0.5`}
                      />
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-faint">
                Drag the bubble in the preview to fine-tune. Position and size apply to the export.
              </p>
            </>
          )}
        </Section>
      )}

      <Section title="Overlays">
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => addOverlay("text")}
            className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink hover:border-ink-faint"
          >
            + Text
          </button>
          <button
            onClick={() => addOverlay("link")}
            className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink hover:border-ink-faint"
          >
            + Link callout
          </button>
        </div>

        {edit.overlays.length > 0 && (
          <ul className="mb-2 space-y-1">
            {edit.overlays.map((overlay) => (
              <li key={overlay.id}>
                <button
                  onClick={() => onSelectOverlay(overlay.id === selectedOverlayId ? null : overlay.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] ${
                    overlay.id === selectedOverlayId
                      ? "bg-panel-2 text-ink"
                      : "text-ink-dim hover:bg-panel-2/60"
                  }`}
                >
                  <span className="truncate">{overlay.text || "(empty)"}</span>
                  <span className="tnum ml-2 shrink-0 text-[11px] text-ink-faint">
                    {formatClock(overlay.start)}–{formatClock(overlay.end)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedOverlay && (
          <div className="rounded-lg border border-edge-soft bg-bg/40 p-3">
            <label className="mb-1 block text-[12px] text-ink-faint">Text</label>
            <input
              value={selectedOverlay.text}
              onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
              className="mb-2 w-full rounded-md border border-edge-soft bg-panel-2 px-2 py-1.5 text-[13px] text-ink"
            />
            {selectedOverlay.kind === "link" && (
              <>
                <label className="mb-1 block text-[12px] text-ink-faint">URL (shown at export as a visual callout)</label>
                <input
                  value={selectedOverlay.url ?? ""}
                  onChange={(e) => updateOverlay(selectedOverlay.id, { url: e.target.value })}
                  placeholder="https://example.com"
                  className="mb-2 w-full rounded-md border border-edge-soft bg-panel-2 px-2 py-1.5 text-[13px] text-ink"
                />
              </>
            )}
            <label className="mb-1 block text-[12px] text-ink-faint">Style</label>
            <select
              value={selectedOverlay.preset}
              onChange={(e) => updateOverlay(selectedOverlay.id, { preset: e.target.value as OverlayPreset })}
              className="mb-2 w-full rounded-md border border-edge-soft bg-panel-2 px-2 py-1.5 text-[13px] text-ink"
            >
              {Object.entries(OVERLAY_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <button
                onClick={() => updateOverlay(selectedOverlay.id, { start: controller.currentTime })}
                className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink-dim hover:text-ink"
              >
                Start at playhead
              </button>
              <button
                onClick={() => updateOverlay(selectedOverlay.id, { end: controller.currentTime })}
                className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink-dim hover:text-ink"
              >
                End at playhead
              </button>
            </div>
            <button
              onClick={() => removeOverlay(selectedOverlay.id)}
              className="w-full rounded-md px-2 py-1.5 text-[12px] text-rec hover:bg-rec-soft"
            >
              Remove overlay
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-snug text-ink-faint">
          Overlays are rendered into the exported video. Link callouts appear as visual
          call-to-actions — video files can&apos;t contain clickable links.
        </p>
      </Section>

      {meta.hasAudio && (
        <NoiseFilterSection
          mainBlob={mainBlob}
          edit={edit}
          controller={controller}
          onUpdateEdit={onUpdateEdit}
        />
      )}

      <GifSection meta={meta} mainBlob={mainBlob} edit={edit} duration={duration} />
    </aside>
  );
}

function NoiseFilterSection({
  mainBlob,
  edit,
  controller,
  onUpdateEdit,
}: {
  mainBlob: Blob;
  edit: EditDoc;
  controller: PlaybackController;
  onUpdateEdit: (updater: (current: EditDoc) => EditDoc) => void;
}) {
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "original" | "filtered">("idle");
  const snippetRef = useRef<AudioBuffer | null>(null);
  const snippetTimeRef = useRef(-1);

  useEffect(() => stopSnippet, []);

  const preview = async (filtered: boolean) => {
    setPreviewState("loading");
    controller.pause();
    const start = Math.max(0, controller.currentTime);
    if (snippetTimeRef.current !== start || !snippetRef.current) {
      snippetRef.current = await extractSnippet(mainBlob, start);
      snippetTimeRef.current = start;
    }
    const buffer = snippetRef.current;
    if (!buffer) {
      setPreviewState("idle");
      return;
    }
    setPreviewState(filtered ? "filtered" : "original");
    playSnippet(buffer, filtered, () => setPreviewState("idle"));
  };

  return (
    <Section title="Background noise filter">
      <label className="flex items-center justify-between text-sm text-ink">
        Filter out unwanted noise
        <input
          type="checkbox"
          checked={edit.audio.noiseFilter}
          onChange={(e) =>
            onUpdateEdit((current) => ({
              ...current,
              audio: { ...current.audio, noiseFilter: e.target.checked },
            }))
          }
        />
      </label>
      <p className="mt-2 text-[11px] leading-snug text-ink-faint">
        Reduces steady background noise like fans and hum. Applied at export — the original audio
        is always preserved.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => (previewState === "original" ? (stopSnippet(), setPreviewState("idle")) : void preview(false))}
          disabled={previewState === "loading"}
          className={`rounded-md border px-2 py-1.5 text-[12px] ${
            previewState === "original" ? "border-accent/60 text-ink" : "border-edge text-ink-dim hover:text-ink"
          }`}
        >
          {previewState === "original" ? "■ Stop" : "Preview original"}
        </button>
        <button
          onClick={() => (previewState === "filtered" ? (stopSnippet(), setPreviewState("idle")) : void preview(true))}
          disabled={previewState === "loading"}
          className={`rounded-md border px-2 py-1.5 text-[12px] ${
            previewState === "filtered" ? "border-accent/60 text-ink" : "border-edge text-ink-dim hover:text-ink"
          }`}
        >
          {previewState === "filtered" ? "■ Stop" : "Preview filtered"}
        </button>
      </div>
      {previewState === "loading" && (
        <p className="mt-2 text-[11px] text-ink-faint">Preparing a 6-second sample…</p>
      )}
    </Section>
  );
}

function GifSection({
  meta,
  mainBlob,
  edit,
  duration,
}: {
  meta: ProjectMeta;
  mainBlob: Blob;
  edit: EditDoc;
  duration: number;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const gifBlobRef = useRef<Blob | null>(null);
  const [startSec, setStartSec] = useState(() => defaultGifStart(edit.segments, duration));

  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl]);

  const generate = async (fromSec: number) => {
    setBusy(true);
    setProgress(0);
    const blob = await generateGif(mainBlob, { startSec: fromSec, onProgress: setProgress });
    if (blob) {
      gifBlobRef.current = blob;
      setGifUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      void putMedia(meta.id, "gif", blob);
    }
    setBusy(false);
  };

  const regenerate = () => {
    // Move the window forward through the recording on each regenerate.
    const next = startSec + GIF_DEFAULT_DURATION * 1.5;
    const wrapped = next + GIF_DEFAULT_DURATION > duration ? 0 : next;
    setStartSec(wrapped);
    void generate(wrapped);
  };

  return (
    <Section title="Animated thumbnail">
      <p className="mb-3 text-[11px] leading-snug text-ink-faint">
        Automatically create a short GIF preview of your video.
      </p>
      {gifUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gifUrl} alt="Animated thumbnail preview" className="mb-2 w-full rounded-md border border-edge-soft" />
      )}
      {busy ? (
        <div className="mb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-faint">Generating GIF…</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => void generate(startSec)}
            className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink hover:border-ink-faint"
          >
            {gifUrl ? "Regenerate" : "Generate GIF"}
          </button>
          {gifUrl ? (
            <button
              onClick={() => gifBlobRef.current && downloadBlob(gifBlobRef.current, safeFilename(meta.title, "gif"))}
              className="rounded-md border border-edge px-2 py-1.5 text-[12px] text-ink hover:border-ink-faint"
            >
              Download GIF
            </button>
          ) : (
            <button
              onClick={regenerate}
              className="rounded-md border border-edge-soft px-2 py-1.5 text-[12px] text-ink-dim hover:text-ink"
              title="Use a different part of the recording"
            >
              Different section
            </button>
          )}
        </div>
      )}
      {gifUrl && !busy && (
        <button onClick={regenerate} className="mt-1.5 w-full rounded-md px-2 py-1 text-[12px] text-ink-faint hover:text-ink">
          Try a different section
        </button>
      )}
    </Section>
  );
}
