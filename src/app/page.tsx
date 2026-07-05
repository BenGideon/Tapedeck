"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RecorderFlow } from "@/components/recorder/RecorderFlow";
import { Button } from "@/components/ui/Button";

const FEATURES = [
  {
    title: "Record anything",
    body: "Capture your screen, camera, microphone, and supported system audio.",
  },
  {
    title: "Edit instantly",
    body: "The editor opens the moment you stop — trim clips and add text, links, and callouts.",
  },
  {
    title: "Keep the quality",
    body: "Native resolution capture, and exports that avoid unnecessary re-encoding.",
  },
  {
    title: "Clean up audio",
    body: "Reduce distracting background noise directly in the browser.",
  },
  {
    title: "Animated thumbnails",
    body: "Generate lightweight GIF previews of any recording automatically.",
  },
  {
    title: "Download everything",
    body: "Export the finished video without waiting for a mandatory cloud upload.",
  },
];

function Landing() {
  const searchParams = useSearchParams();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (searchParams.get("record") === "1") setRecording(true);
  }, [searchParams]);

  return (
    <div className="min-h-screen">
      <AppNav onNewRecording={() => setRecording(true)} />

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Record. Edit.
            <br />
            <span className="text-accent">Download.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-dim">
            Capture your screen and camera, clean up the audio, add overlays, and download the
            finished video. No mandatory cloud upload.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <Button variant="rec" size="lg" onClick={() => setRecording(true)} className="px-10">
              <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
              Start recording
            </Button>
            <p className="text-[13px] text-ink-faint">
              Your recordings stay on your device unless you choose otherwise.
            </p>
          </div>
        </section>

        <section className="border-y border-edge-soft bg-panel-2">
          <div className="mx-auto grid max-w-5xl gap-px overflow-hidden px-6 py-16 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="p-6">
                <h2 className="font-display text-[15px] font-medium">{feature.title}</h2>
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
