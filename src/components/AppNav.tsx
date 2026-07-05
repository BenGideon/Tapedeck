"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Logo() {
  return (
    <span className="group flex items-center gap-2">
      {/* Animated record icon */}
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink transition-transform duration-200 group-hover:scale-110">
        <span className="h-2.5 w-2.5 rounded-full bg-rec transition-transform duration-200 group-hover:scale-90" />
        {/* Orbit ring on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[-4px] rounded-full border border-rec/0 transition-all duration-300 group-hover:border-rec/25 group-hover:inset-[-6px]"
        />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight transition-opacity group-hover:opacity-80">
        Tapedeck
      </span>
    </span>
  );
}

export function AppNav({ onNewRecording }: { onNewRecording?: () => void }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-edge-soft bg-panel/80 px-5 backdrop-blur-md">
      <Link href="/" className="hover:opacity-90 transition-opacity">
        <Logo />
      </Link>
      <nav className="flex items-center gap-1" aria-label="Main navigation">
        <Link
          href="/projects"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            pathname === "/projects"
              ? "bg-panel-2 font-medium text-ink"
              : "text-ink-dim hover:bg-panel-2 hover:text-ink"
          }`}
        >
          Projects
        </Link>
        {onNewRecording ? (
          <button
            onClick={onNewRecording}
            className="group relative ml-1 flex items-center gap-2 overflow-hidden rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 hover:shadow-md hover:shadow-accent/25"
          >
            <span className="rec-pulse h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            New recording
          </button>
        ) : (
          <Link
            href="/?record=1"
            className="group relative ml-1 flex items-center gap-2 overflow-hidden rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110 hover:shadow-md hover:shadow-accent/25"
          >
            <span className="rec-pulse h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            New recording
          </Link>
        )}
      </nav>
    </header>
  );
}
