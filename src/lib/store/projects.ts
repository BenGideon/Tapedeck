import { dbDelete, dbGet, dbGetAll, dbKeys, dbPut } from "./db";
import { defaultEditDoc, type EditDoc, type ProjectMeta } from "./types";
import type { RecordingResult } from "@/lib/media/recorder";

export type MediaKind = "main" | "bubble" | "thumb" | "gif";

const mediaKey = (projectId: string, kind: MediaKind) => `${projectId}:${kind}`;

export async function createProjectFromRecording(result: RecordingResult): Promise<ProjectMeta> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    title: `Recording ${new Date(now).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}, ${new Date(now).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
    createdAt: now,
    updatedAt: now,
    duration: result.durationSec,
    width: result.width,
    height: result.height,
    mainMimeType: result.main.mimeType,
    mainExtension: result.main.fileExtension,
    hasAudio: result.hasAudio,
    hasBubble: Boolean(result.bubble),
    bubbleMimeType: result.bubble?.mimeType,
    bubbleOffsetSec: result.bubbleOffsetSec,
    sizeBytes: result.main.blob.size + (result.bubble?.blob.size ?? 0),
    edit: defaultEditDoc(result.durationSec),
  };
  await dbPut("media", result.main.blob, mediaKey(id, "main"));
  if (result.bubble) await dbPut("media", result.bubble.blob, mediaKey(id, "bubble"));
  await dbPut("projects", meta);
  return meta;
}

export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  return dbGet<ProjectMeta>("projects", id);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const projects = await dbGetAll<ProjectMeta>("projects");
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMedia(projectId: string, kind: MediaKind): Promise<Blob | undefined> {
  return dbGet<Blob>("media", mediaKey(projectId, kind));
}

export async function putMedia(projectId: string, kind: MediaKind, blob: Blob): Promise<void> {
  await dbPut("media", blob, mediaKey(projectId, kind));
}

export async function saveEdit(id: string, edit: EditDoc): Promise<ProjectMeta | undefined> {
  const meta = await getProject(id);
  if (!meta) return undefined;
  const updated: ProjectMeta = { ...meta, edit, updatedAt: Date.now() };
  await dbPut("projects", updated);
  return updated;
}

export async function renameProject(id: string, title: string): Promise<void> {
  const meta = await getProject(id);
  if (!meta) return;
  await dbPut("projects", { ...meta, title, updatedAt: Date.now() });
}

/** Update duration once probed precisely (recorder estimate can be slightly off). */
export async function updateDuration(id: string, duration: number): Promise<ProjectMeta | undefined> {
  const meta = await getProject(id);
  if (!meta) return undefined;
  const edit: EditDoc = {
    ...meta.edit,
    segments: meta.edit.segments.map((s, i, arr) =>
      i === arr.length - 1 && Math.abs(s.end - meta.duration) < 0.5 ? { ...s, end: duration } : s,
    ),
  };
  const updated: ProjectMeta = { ...meta, duration, edit, updatedAt: meta.updatedAt };
  await dbPut("projects", updated);
  return updated;
}

export async function duplicateProject(id: string): Promise<ProjectMeta | undefined> {
  const meta = await getProject(id);
  if (!meta) return undefined;
  const copyId = crypto.randomUUID();
  const copy: ProjectMeta = {
    ...meta,
    id: copyId,
    title: `${meta.title} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    edit: structuredClone(meta.edit),
  };
  for (const kind of ["main", "bubble", "thumb", "gif"] as MediaKind[]) {
    const blob = await getMedia(id, kind);
    if (blob) await putMedia(copyId, kind, blob);
  }
  await dbPut("projects", copy);
  return copy;
}

export async function deleteProject(id: string): Promise<void> {
  const keys = await dbKeys("media");
  for (const key of keys) {
    if (typeof key === "string" && key.startsWith(`${id}:`)) await dbDelete("media", key);
  }
  await dbDelete("projects", id);
}
