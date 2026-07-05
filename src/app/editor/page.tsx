"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EditorShell } from "@/components/editor/EditorShell";
import { Logo } from "@/components/AppNav";

function EditorPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("p");

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <Logo />
        <p className="text-sm text-ink-dim">No project selected.</p>
        <Link href="/projects" className="text-sm text-accent underline underline-offset-4">
          Open projects
        </Link>
      </div>
    );
  }

  return <EditorShell projectId={projectId} />;
}

export default function Editor() {
  return (
    <Suspense>
      <EditorPage />
    </Suspense>
  );
}
