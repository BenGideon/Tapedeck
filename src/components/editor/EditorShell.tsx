"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/AppNav";
import { Button } from "@/components/ui/Button";
import { PlaybackController } from "@/lib/editor/controller";
import { getMedia, getProject, renameProject, saveEdit, updateDuration } from "@/lib/store/projects";
import type { EditDoc, ProjectMeta } from "@/lib/store/types";
import { PreviewStage } from "./PreviewStage";
import { Timeline } from "./Timeline";
import { SidePanel } from "./SidePanel";
import { ExportDialog } from "./ExportDialog";

interface EditorShellProps {
  projectId: string;
}

interface LoadedMedia {
  meta: ProjectMeta;
  mainUrl: string;
  bubbleUrl: string | null;
  mainBlob: Blob;
  bubbleBlob: Blob | null;
}

export function EditorShell({ projectId }: EditorShellProps) {
  const [loaded, setLoaded] = useState<LoadedMedia | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditDoc | null>(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [playing, setPlaying] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  /** Mobile: controls whether the bottom-sheet SidePanel is open */
  const [sheetOpen, setSheetOpen] = useState(false);

  const controllerRef = useRef<PlaybackController | null>(null);
  if (!controllerRef.current) controllerRef.current = new PlaybackController();
  const controller = controllerRef.current;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project + media, create object URLs (revoked on unmount).
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    (async () => {
      const meta = await getProject(projectId);
      if (!meta) {
        if (!cancelled) setLoadError("This project could not be found. It may have been deleted or stored in a different browser.");
        return;
      }
      const mainBlob = await getMedia(projectId, "main");
      if (!mainBlob) {
        if (!cancelled) setLoadError("The recording media is missing from local storage.");
        return;
      }
      const bubbleBlob = meta.hasBubble ? ((await getMedia(projectId, "bubble")) ?? null) : null;
      const mainUrl = URL.createObjectURL(mainBlob);
      const bubbleUrl = bubbleBlob ? URL.createObjectURL(bubbleBlob) : null;
      urls = [mainUrl, ...(bubbleUrl ? [bubbleUrl] : [])];
      if (cancelled) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setLoaded({ meta, mainUrl, bubbleUrl, mainBlob, bubbleBlob });
      setEdit(meta.edit);
      setDuration(meta.duration);
      setTitle(meta.title);
    })().catch(() => {
      if (!cancelled) setLoadError("Local storage could not be read in this browser.");
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      controller.detach();
    };
  }, [projectId, controller]);

  // Track play state.
  useEffect(() => {
    const unsubscribe = controller.subscribe((_, isPlaying) => {
      setPlaying((prev) => (prev === isPlaying ? prev : isPlaying));
    });
    return unsubscribe;
  }, [controller]);

  useEffect(() => {
    if (edit) controller.setEdit(edit);
  }, [edit, controller]);

  const updateEdit = useCallback(
    (updater: (current: EditDoc) => EditDoc) => {
      setEdit((current) => {
        if (!current) return current;
        const next = updater(current);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          void saveEdit(projectId, next);
        }, 400);
        return next;
      });
    },
    [projectId],
  );

  const handleDurationKnown = useCallback(
    (realDuration: number) => {
      setDuration((current) => {
        if (Math.abs(current - realDuration) < 0.3 || realDuration <= 0) return current;
        void updateDuration(projectId, realDuration).then((meta) => {
          if (meta) setEdit(meta.edit);
        });
        return realDuration;
      });
    },
    [projectId],
  );

  const commitTitle = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && loaded && trimmed !== loaded.meta.title) {
      void renameProject(projectId, trimmed);
    }
  }, [title, loaded, projectId]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (event.code === "Space") {
        event.preventDefault();
        void controller.togglePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);

  const editedSeconds = useMemo(
    () => (edit ? edit.segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0) : 0),
    [edit],
  );

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo />
        <p className="max-w-sm text-sm leading-relaxed text-ink-dim">{loadError}</p>
        <div className="flex gap-2">
          <Link href="/projects" className="text-sm text-accent underline underline-offset-4 hover:text-ink">
            Open projects
          </Link>
          <Link href="/?record=1" className="text-sm text-accent underline underline-offset-4 hover:text-ink">
            New recording
          </Link>
        </div>
      </div>
    );
  }

  if (!loaded || !edit) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-ink-dim">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
          Opening project…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-edge-soft bg-panel/80 px-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="shrink-0 hover:opacity-80 transition-opacity" aria-label="Home">
            <Logo />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label="Project title"
            className="w-full max-w-[200px] truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-edge focus:border-edge focus:bg-panel sm:max-w-[320px]"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/projects"
            className="hidden rounded-md px-3 py-1.5 text-sm text-ink-dim hover:bg-panel-2 hover:text-ink sm:block"
          >
            Projects
          </Link>
          {/* Mobile: Settings button */}
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Open settings"
            className="flex items-center gap-1.5 rounded-md border border-edge-soft px-2.5 py-1.5 text-sm text-ink-dim hover:bg-panel-2 hover:text-ink md:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Settings
          </button>
          <Button variant="primary" size="sm" onClick={() => setExportOpen(true)}>
            Export
          </Button>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <PreviewStage
            controller={controller}
            meta={loaded.meta}
            mainUrl={loaded.mainUrl}
            bubbleUrl={loaded.bubbleUrl}
            edit={edit}
            playing={playing}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
            onUpdateEdit={updateEdit}
            onDurationKnown={handleDurationKnown}
          />
          <Timeline
            controller={controller}
            duration={duration}
            edit={edit}
            mainBlob={loaded.mainBlob}
            playing={playing}
            selectedSegment={selectedSegment}
            onSelectSegment={setSelectedSegment}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
            onUpdateEdit={updateEdit}
          />
        </main>

        {/* Desktop SidePanel */}
        <div className="hidden md:block">
          <SidePanel
            meta={loaded.meta}
            mainBlob={loaded.mainBlob}
            edit={edit}
            duration={duration}
            editedSeconds={editedSeconds}
            controller={controller}
            selectedSegment={selectedSegment}
            onSelectSegment={setSelectedSegment}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
            onUpdateEdit={updateEdit}
          />
        </div>
      </div>

      {/* ── Mobile Bottom-Sheet SidePanel ── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Settings">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm fade-in"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet */}
          <div className="slide-up absolute bottom-0 left-0 right-0 max-h-[80dvh] overflow-hidden rounded-t-2xl border-t border-edge-soft bg-panel shadow-2xl shadow-black/50">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-edge" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-edge-soft px-4 py-2.5">
              <span className="text-sm font-medium text-ink">Settings</span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close settings"
                className="rounded-md p-1 text-ink-faint hover:bg-panel-2 hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* Scrollable content */}
            <div className="thin-scroll overflow-y-auto" style={{ maxHeight: "calc(80dvh - 80px)" }}>
              <SidePanel
                meta={loaded.meta}
                mainBlob={loaded.mainBlob}
                edit={edit}
                duration={duration}
                editedSeconds={editedSeconds}
                controller={controller}
                selectedSegment={selectedSegment}
                onSelectSegment={setSelectedSegment}
                selectedOverlayId={selectedOverlayId}
                onSelectOverlay={setSelectedOverlayId}
                onUpdateEdit={updateEdit}
              />
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <ExportDialog
          meta={loaded.meta}
          mainBlob={loaded.mainBlob}
          bubbleBlob={loaded.bubbleBlob}
          edit={edit}
          title={title}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
