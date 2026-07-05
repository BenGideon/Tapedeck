"use client";

import Link from "next/link";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink">
        <span className="h-2 w-2 rounded-full bg-rec" />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight">Tapedeck</span>
    </span>
  );
}

export function AppNav({ onNewRecording }: { onNewRecording?: () => void }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-edge-soft px-5">
      <Link href="/" className="hover:opacity-80">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1" aria-label="Main navigation">
        <Link
          href="/projects"
          className="rounded-md px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
        >
          Projects
        </Link>
        {onNewRecording ? (
          <button
            onClick={onNewRecording}
            className="ml-1 flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rec" aria-hidden />
            New recording
          </button>
        ) : (
          <Link
            href="/?record=1"
            className="ml-1 flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-rec" aria-hidden />
            New recording
          </Link>
        )}
      </nav>
    </header>
  );
}
