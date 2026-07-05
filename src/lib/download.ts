/** Trigger a browser download for a blob and clean up the object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "").trim() || "recording";
  return `${base}.${extension}`;
}
