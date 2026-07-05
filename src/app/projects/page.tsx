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

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-edge-soft bg-panel">
      <div className="shimmer aspect-video w-full" />
      <div className="p-3 space-y-2">
        <div className="shimmer h-3.5 w-3/4 rounded-full" />
        <div className="shimmer h-3 w-1/2 rounded-full" />
      </div>
    </div>
  );
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
    if (!window.confirm(`Delete "${project.title}"? This removes the recording from this browser permanently.`)) return;
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
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-[13px] text-ink-faint">
              Stored locally in this browser — clearing site data removes them.
            </p>
          </div>
          <Link
            href="/?record=1"
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent/20 transition-all hover:brightness-110 hover:shadow-md hover:shadow-accent/25"
          >
            <span className="rec-pulse h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            New recording
          </Link>
        </div>

        {storageError && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
            {storageError}
          </p>
        )}

        {/* Skeleton loading */}
        {projects === null && !storageError && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {projects?.length === 0 && !storageError && (
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-edge py-24 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel-2 text-ink-faint">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-ink">No recordings yet</p>
              <p className="mt-1 text-[13px] text-ink-faint">Start recording your screen or camera to get started.</p>
            </div>
            <Link
              href="/?record=1"
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent/20 transition-all hover:brightness-110"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rec" aria-hidden />
              Start your first recording
            </Link>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project, i) => {
            const media = cardMedia[project.id];
            return (
              <article
                key={project.id}
                className="group overflow-hidden rounded-xl border border-edge-soft bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/25 hover:shadow-lg hover:shadow-black/8"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <button
                  onClick={() => router.push(`/editor?p=${project.id}`)}
                  className="block w-full"
                  aria-label={`Open ${project.title}`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-panel-2">
                    {media?.gifUrl || media?.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={media.gifUrl ?? media.posterUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-faint transition-transform duration-300 group-hover:scale-110">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" />
                        </svg>
                      </div>
                    )}
                    {/* Duration badge */}
                    <span className="tnum absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                      {formatClock(project.duration)}
                    </span>
                    {/* Play overlay on hover */}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 text-ink" aria-hidden>
                          <path d="M8 5.5v13l11-6.5-11-6.5z" />
                        </svg>
                      </span>
                    </span>
                  </div>
                </button>
                <div className="p-3">
                  <h2 className="truncate text-sm font-medium text-ink">{project.title}</h2>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {formatDate(project.updatedAt)} · {formatBytes(project.sizeBytes)}
                  </p>
                  <div className="mt-2.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <Link
                      href={`/editor?p=${project.id}`}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-dim hover:bg-panel-2 hover:text-ink"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => void handleDuplicate(project)}
                      className="rounded-md px-2 py-1 text-[12px] text-ink-dim hover:bg-panel-2 hover:text-ink"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => void handleDelete(project)}
                      className="ml-auto rounded-md px-2 py-1 text-[12px] text-rec hover:bg-rec-soft"
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
