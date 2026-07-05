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

  // Track play state (state changes only on transitions, not per frame).
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

  /** The browser's parsed duration is authoritative over the recorder's
   * estimate — reconcile once when media metadata arrives. */
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

  // Keyboard shortcuts: space = play/pause, s = split, delete = remove selection.
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
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-edge-soft px-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0 hover:opacity-80" aria-label="Home">
            <Logo />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label="Project title"
            className="w-full max-w-[320px] truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-edge focus:border-edge focus:bg-panel"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/projects" className="rounded-md px-3 py-1.5 text-sm text-ink-dim hover:bg-panel-2 hover:text-ink">
            Projects
          </Link>
          <Button variant="primary" size="sm" onClick={() => setExportOpen(true)}>
            Export
          </Button>
        </div>
      </header>

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
