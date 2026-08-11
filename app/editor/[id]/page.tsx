"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Coins, Download } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useRenderStatus } from "@/lib/hooks/useRenderStatus";
import { useCompositionAutosave } from "@/lib/hooks/useCompositionAutosave";
import { useSlots } from "@/lib/hooks/useSlots";
import { usePhotos } from "@/lib/hooks/usePhotos";
import { useEditorShortcuts } from "@/lib/hooks/useEditorShortcuts";
import { useTimelineStore } from "@/lib/stores/useTimelineStore";
import { useEditorStore } from "@/lib/stores/useEditorStore";
import { RemotionPlayer, type RemotionPlayerHandle } from "@/components/timeline/RemotionPlayer";
import { TimelineTrack } from "@/components/timeline/TimelineTrack";
import { TimelineControls } from "@/components/timeline/TimelineControls";
import { SequenceRail } from "@/components/editor/SequenceRail";
import { Inspector } from "@/components/editor/Inspector";
import { displayTokensFor } from "@/lib/editor/motions";
import { runtimeSeconds } from "@/lib/editor/runtime";
import { FPS } from "@/lib/remotion/constants";
import { cn } from "@/lib/utils";

/**
 * The editor shell.
 *
 * Three regions on a fixed grid — 320px rail, stage, full-width timeline — and
 * one selection shared between all of them. The rail is semantic and shows
 * generation state; the timeline is temporal and shows time. Neither does the
 * other's job, which is why both exist.
 */
export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const supabase = createClient();
  const playerRef = useRef<RemotionPlayerHandle>(null);

  const setClips = useTimelineStore((s) => s.setClips);
  const setAspectRatio = useTimelineStore((s) => s.setAspectRatio);
  const storeClips = useTimelineStore((s) => s.clips);
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId);
  const select = useEditorStore((s) => s.select);

  const { slots, addSlot, patchSlot, selectTake, refresh } = useSlots(projectId);
  const { uploads, extractedFrames } = usePhotos(projectId);

  const [projectTitle, setProjectTitle] = useState("Untitled");
  const [aspectRatio, setLocalAspectRatio] = useState("16:9");
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingSlot, setAddingSlot] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { render } = useRenderStatus(projectId, exporting);
  useCompositionAutosave(projectId, !loading && !exporting);

  // Down-arrow walks the sequence. Off until the project has loaded, so a
  // keypress during load can't select a slot that is about to be replaced.
  useEditorShortcuts({
    playerRef,
    onGenerate: handleGenerate,
    enabled: !loading,
  });

  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;
  const isVertical = aspectRatio === "9:16";

  // Derived, never stored, and shared with the timeline and project panel so
  // the three cannot disagree.
  const readyCount = slots.filter((s) => s.state === "ready").length;
  const runtimeSec = runtimeSeconds(slots, storeClips);

  useEffect(() => {
    void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!render) return;
    if (render.status === "ready") {
      setExporting(false);
      if (render.downloadUrl) setVideoUrl(render.downloadUrl);
    } else if (render.status === "failed") {
      setExporting(false);
      setError(render.error || "Render failed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render?.status]);

  async function loadProject() {
    setLoading(true);

    const { data: project } = await supabase
      .from("projects")
      .select("title, status, aspect_ratio")
      .eq("id", projectId)
      .single();

    // A draft project hasn't finished its upload step yet.
    if (project?.status === "draft") {
      router.replace(`/dashboard/projects/new?resume=${projectId}`);
      return;
    }

    if (project?.title) setProjectTitle(project.title);
    if (project?.aspect_ratio) {
      setLocalAspectRatio(project.aspect_ratio);
      setAspectRatio(project.aspect_ratio as "16:9" | "9:16");
    }

    await Promise.all([loadClips(), loadBalance()]);
    setLoading(false);
  }

  async function loadBalance() {
    const res = await fetch("/api/tokens/balance");
    if (res.ok) {
      const { balance: b } = await res.json();
      setBalance(b ?? 0);
    }
  }

  async function loadClips() {
    const res = await fetch(`/api/generate/${projectId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.clips)) {
      setClips(
        data.clips.map(
          (c: {
            id: string;
            slotId?: string;
            url: string;
            durationSeconds?: number;
            orderIndex?: number;
            thumbnail?: string | null;
          }, i: number) => ({
            id: c.id,
            slotId: c.slotId,
            src: c.url,
            orderIndex: c.orderIndex ?? i,
            thumbnail: c.thumbnail ?? null,
            durationInFrames: Math.round((c.durationSeconds ?? 4) * FPS),
            inFrame: 0,
            outFrame: Math.round((c.durationSeconds ?? 4) * FPS),
          })
        )
      );
    }
  }

  async function handleAddSlot() {
    setAddingSlot(true);
    setError(null);
    try {
      const slot = await addSlot();
      select(slot.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add a clip");
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleGenerate(slotId: string) {
    setError(null);
    setGenerating(true);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(
        data.error === "insufficient_balance"
          ? `Not enough credits — this clip needs ${data.required}, you have ${data.balance}.`
          : data.error || "Generation failed"
      );
      setGenerating(false);
      return;
    }

    setGenerating(false);
    await Promise.all([refresh(), loadBalance()]);
  }

  async function handleExport() {
    setError(null);
    setExporting(true);
    const res = await fetch("/api/generate/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not start the export");
      setExporting(false);
    }
  }

  const notReady = slots.filter((s) => s.state !== "ready");

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)_auto]">
      {/* Top bar */}
      <header className="col-span-full flex items-center gap-4 border-b border-border bg-card px-4">
        <Link
          href="/dashboard/projects"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to projects"
        >
          <ChevronLeft size={15} />
        </Link>

        <span className="font-serif text-[17px] leading-none">{projectTitle}</span>

        <div className="flex-1" />

        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {slots.length} {slots.length === 1 ? "clip" : "clips"} ·{" "}
          {runtimeSec.toFixed(1)}s
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums",
            balance < 400
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border text-muted-foreground"
          )}
        >
          <Coins size={11} />
          {balance.toLocaleString()}
        </span>

        {videoUrl ? (
          <a
            href={videoUrl}
            download
            className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
          >
            <Download size={12} />
            Download
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || slots.length === 0 || notReady.length > 0}
            title={
              notReady.length > 0
                ? `Not ready: ${notReady.map((s) => s.name).join(", ")}`
                : undefined
            }
            className="rounded-md bg-warning px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        )}
      </header>

      {/* Rail */}
      <SequenceRail
        onAddSlot={handleAddSlot}
        adding={addingSlot}
        readyCount={readyCount}
        photos={uploads}
      />

      {/* Stage: player + inspector */}
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            {storeClips.length === 0 ? (
              // The void around the player is intentional; an unexplained black
              // rectangle is not. Say what to do next.
              <div className="max-w-[280px] text-center">
                <p className="text-[15px] text-foreground">Nothing to play yet</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Add a clip and generate it. It will show up here and on the
                  timeline below.
                </p>
              </div>
            ) : (
              <div className={cn("w-full", isVertical ? "max-w-[300px]" : "max-w-[760px]")}>
                <RemotionPlayer ref={playerRef} isVertical={isVertical} />
              </div>
            )}
          </div>

          {storeClips.length > 0 && (
            <div className="flex-none px-6 pb-4">
              <TimelineControls playerRef={playerRef} />
            </div>
          )}

          {error && (
            <div className="mx-6 mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </section>

        <Inspector
          uploads={uploads}
          extractedFrames={extractedFrames}
          onPatch={patchSlot}
          onGenerate={handleGenerate}
          onSelectTake={selectTake}
          generating={generating}
          costTokens={displayTokensFor(selectedSlot?.duration_seconds ?? 4)}
          project={{ title: projectTitle, aspectRatio }}
        />
      </main>

      {/* Timeline — the workbench, inverted to light inside the dark shell.
          Fixed height rather than auto: the track renders nothing until a clip
          exists, so an auto row collapsed to a sliver and then shoved the stage
          upward the moment the first take landed. */}
      <div className="light col-span-full h-[188px] border-t border-border bg-background text-foreground">
        {storeClips.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12.5px] text-muted-foreground">
              Clips appear here as they finish, in the order you arrange them.
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <TimelineTrack playerRef={playerRef} onRegen={handleGenerate} />
          </div>
        )}
      </div>
    </div>
  );
}
