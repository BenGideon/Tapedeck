"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { deleteProject, duplicateProject, getMedia, listProjects } from "@/lib/store/projects";
import { formatBytes, formatClock, formatDate } from "@/lib/media/format";
import type { ProjectMeta } from "@/lib/store/types";

interface CardMedia {
  gifUrl?: string;
  posterUrl?: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [cardMedia, setCardMedia] = useState<Record<string, CardMedia>>({});
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);

      const media: Record<string, CardMedia> = {};
      for (const project of list) {
        const gif = await getMedia(project.id, "gif");
        const thumb = gif ?? (await getMedia(project.id, "thumb"));
        if (thumb) {
          media[project.id] = {
            [gif ? "gifUrl" : "posterUrl"]: URL.createObjectURL(thumb),
          };
        }
      }
      setCardMedia((previous) => {
        Object.values(previous).forEach((m) => {
          if (m.gifUrl) URL.revokeObjectURL(m.gifUrl);
          if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
        });
        return media;
      });
    } catch {
      setStorageError("Local project storage is not available in this browser.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      setCardMedia((previous) => {
        Object.values(previous).forEach((m) => {
          if (m.gifUrl) URL.revokeObjectURL(m.gifUrl);
          if (m.posterUrl) URL.revokeObjectURL(m.posterUrl);
        });
        return {};
      });
    };
  }, [refresh]);

  const handleDelete = async (project: ProjectMeta) => {
    if (!window.confirm(`Delete “${project.title}”? This removes the recording from this browser permanently.`)) return;
    await deleteProject(project.id);
    void refresh();
  };

  const handleDuplicate = async (project: ProjectMeta) => {
    await duplicateProject(project.id);
    void refresh();
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-[13px] text-ink-faint">
              Stored locally in this browser — clearing site data removes them. Export anything you
              want to keep.
            </p>
          </div>
        </div>

        {storageError && <p className="rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">{storageError}</p>}

        {projects && projects.length === 0 && !storageError && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-edge py-20 text-center">
            <p className="text-sm text-ink-dim">No recordings yet.</p>
            <Link
              href="/?record=1"
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rec" aria-hidden />
              Start your first recording
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => {
            const media = cardMedia[project.id];
            return (
              <article
                key={project.id}
                className="group overflow-hidden rounded-xl border border-edge-soft bg-panel transition-colors hover:border-edge"
              >
                <button
                  onClick={() => router.push(`/editor?p=${project.id}`)}
                  className="block w-full"
                  aria-label={`Open ${project.title}`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-bg">
                    {media?.gifUrl || media?.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={media.gifUrl ?? media.posterUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-faint">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <rect x="2.5" y="5.5" width="19" height="13" rx="2" stroke="currentColor" />
                          <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" />
                        </svg>
                      </div>
                    )}
                    <span className="tnum absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      {formatClock(project.duration)}
                    </span>
                  </div>
                </button>
                <div className="p-3">
                  <h2 className="truncate text-sm font-medium text-ink">{project.title}</h2>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {formatDate(project.updatedAt)} · {formatBytes(project.sizeBytes)}
                  </p>
                  <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      href={`/editor?p=${project.id}`}
                      className="rounded px-2 py-1 text-[12px] text-ink-dim hover:bg-panel-2 hover:text-ink"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => void handleDuplicate(project)}
                      className="rounded px-2 py-1 text-[12px] text-ink-dim hover:bg-panel-2 hover:text-ink"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => void handleDelete(project)}
                      className="ml-auto rounded px-2 py-1 text-[12px] text-rec hover:bg-rec-soft"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
