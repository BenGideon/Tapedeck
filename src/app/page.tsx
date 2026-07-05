"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RecorderFlow } from "@/components/recorder/RecorderFlow";
import { Button } from "@/components/ui/Button";

// ── Feature icons ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    title: "Record anything",
    body: "Capture your screen, camera, microphone, and supported system audio.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="5" width="15" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M17 9.5l5-2.5v10l-5-2.5V9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Edit instantly",
    body: "The editor opens the moment you stop — trim clips and add text, links, and callouts.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Keep the quality",
    body: "Native resolution capture, and exports that avoid unnecessary re-encoding.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Clean up audio",
    body: "Reduce distracting background noise directly in the browser.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    title: "Animated thumbnails",
    body: "Generate lightweight GIF previews of any recording automatically.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 9h18M9 9v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13 14h3v3h-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Download everything",
    body: "Export the finished video without waiting for a mandatory cloud upload.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ── Stagger-in on scroll ─────────────────────────────────────────────────────

function useStaggerObserver() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = children.indexOf(entry.target as HTMLElement);
            (entry.target as HTMLElement).style.animationDelay = `${idx * 60}ms`;
            (entry.target as HTMLElement).classList.add("stagger-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    children.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ── Landing ──────────────────────────────────────────────────────────────────

function Landing() {
  const searchParams = useSearchParams();
  const [recording, setRecording] = useState(false);
  const featureRef = useStaggerObserver();

  useEffect(() => {
    if (searchParams.get("record") === "1") setRecording(true);
  }, [searchParams]);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <AppNav onNewRecording={() => setRecording(true)} />

      <main>
        {/* ── Hero ── */}
        <section className="relative mx-auto max-w-3xl overflow-hidden px-6 pb-24 pt-24 text-center">
          {/* Animated gradient blobs */}
          <div
            aria-hidden
            className="blob-drift pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(56% 0.14 182 / 14%) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            aria-hidden
            className="blob-drift-2 pointer-events-none absolute right-0 top-20 -z-10 h-[280px] w-[280px] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(56% 0.22 25 / 8%) 0%, transparent 70%)",
              filter: "blur(48px)",
            }}
          />

          <h1
            className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
            style={{ animation: "stagger-in 600ms cubic-bezier(0.16,1,0.3,1) both" }}
          >
            Record. Edit.
            <br />
            <span className="text-accent">Download.</span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-dim"
            style={{ animation: "stagger-in 600ms 120ms cubic-bezier(0.16,1,0.3,1) both" }}
          >
            Capture your screen and camera, clean up the audio, add overlays, and
            download the finished video. No mandatory cloud upload.
          </p>
          <div
            className="mt-10 flex flex-col items-center gap-4"
            style={{ animation: "stagger-in 600ms 200ms cubic-bezier(0.16,1,0.3,1) both" }}
          >
            <Button
              variant="rec"
              size="lg"
              onClick={() => setRecording(true)}
              className="group relative overflow-hidden px-10 shadow-lg shadow-rec/20 transition-shadow hover:shadow-xl hover:shadow-rec/30"
            >
              {/* Ripple shimmer on hover */}
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-500 group-hover:translate-x-full"
              />
              <span className="rec-ring-pulse relative h-2.5 w-2.5 rounded-full bg-white" aria-hidden />
              Start recording
            </Button>
            <p className="text-[13px] text-ink-faint">
              Your recordings stay on your device unless you choose otherwise.
            </p>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="border-y border-edge-soft bg-panel-2/60">
          <div
            ref={featureRef}
            className="mx-auto grid max-w-5xl px-6 py-16 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="card-lift glow-ring group cursor-default rounded-xl p-6 transition-colors hover:bg-panel"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-110">
                  {feature.icon}
                </span>
                <h2 className="font-display text-[15px] font-semibold text-ink">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-edge-soft px-6 py-8 text-center text-[12px] text-ink-faint">
          Everything runs in your browser. Projects are stored locally — clearing site data removes
          them.
        </footer>
      </main>

      {recording && <RecorderFlow onClose={() => setRecording(false)} />}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}
