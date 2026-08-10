"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRenderStatus } from "@/lib/hooks/useRenderStatus";
import { useProgressiveClips } from "@/lib/hooks/useProgressiveClips";
import { useCompositionAutosave } from "@/lib/hooks/useCompositionAutosave";
import { useTimelineStore, clipFromServer } from "@/lib/stores/useTimelineStore";
import { useEditorStore } from "@/lib/stores/useEditorStore";
import { useSlots } from "@/lib/hooks/useSlots";
import { usePhotos } from "@/lib/hooks/usePhotos";
import { SequenceRail } from "@/components/editor/SequenceRail";
import { Inspector } from "@/components/editor/Inspector";
import { displayTokensFor } from "@/lib/editor/motions";
import { RemotionPlayer, type RemotionPlayerHandle } from "@/components/timeline/RemotionPlayer";
import { TimelineTrack } from "@/components/timeline/TimelineTrack";
import { TimelineControls } from "@/components/timeline/TimelineControls";
import { FPS } from "@/lib/remotion/constants";
import type { Clip } from "@/lib/types/database";
import Link from "next/link";
import {
  Film,
  Download,
  Plus,
  AlertCircle,
  CheckCircle2,
  Coins,
  X,
} from "lucide-react";

function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ProjectTimelinePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const supabase = createClient();
  const playerRef = useRef<RemotionPlayerHandle>(null);

  const setClips = useTimelineStore((s) => s.setClips);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const setAspectRatio = useTimelineStore((s) => s.setAspectRatio);
  const storeClips = useTimelineStore((s) => s.clips);

  // One selection, shared with the rail and the timeline — and the inspector
  // once it lands. It is a slot id, which is what regenerating actually needs.
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId);
  const select = useEditorStore((s) => s.select);

  const { slots, addSlot, patchSlot } = useSlots(projectId);
  const { uploads, extractedFrames } = usePhotos(projectId);
  const [addingSlot, setAddingSlot] = useState(false);

  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;

  // Select the new card straight away. A clip the agent has to go and find is
  // one more step between deciding to build something and building it.
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
  const totalFrames = useMemo(
    () => storeClips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),
    [storeClips]
  );

  const [aspectRatio, setLocalAspectRatio] = useState<string>("16:9");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [concatenating, setConcatenating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [concatJobId, setConcatJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpInfo, setTopUpInfo] = useState<{ balance: number; required: number } | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);
  const [concatElapsed, setConcatElapsed] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Progressive clip delivery: clips drop into the timeline as each becomes
  // playable, and this also carries the whole graph's status.
  const graph = useProgressiveClips(projectId, generating);

  // The finalized render — S3 download plus the Mux stream.
  const { render } = useRenderStatus(projectId, concatenating);

  // Persist trims and reordering as they happen. Paused while rendering, since
  // the composition is locked once finalize has read it.
  useCompositionAutosave(projectId, !loading && !concatenating);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!graph) return;

    if (graph.status === "complete" || graph.status === "partial") {
      setActiveJobId(null);
      setGenerating(false);
    } else if (graph.status === "failed") {
      setGenerating(false);
      setError("Clip generation failed. Contact support for assistance.");
    }

    // Some clips landed, some didn't — surface it without blocking the rest.
    if (graph.failed > 0 && graph.status !== "running") {
      setError(`${graph.failed} clip${graph.failed === 1 ? "" : "s"} failed to generate.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph?.status, graph?.failed]);

  useEffect(() => {
    if (!render) return;

    if (render.status === "ready") {
      setConcatenating(false);
      if (render.downloadUrl) setVideoUrl(render.downloadUrl);
    } else if (render.status === "failed") {
      setConcatenating(false);
      setError(render.error || "Render failed.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render?.status]);

  useEffect(() => {
    if (!generating) {
      setGenElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setGenElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [generating]);

  useEffect(() => {
    if (!concatenating) {
      setConcatElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setConcatElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [concatenating]);

  async function loadData() {
    setLoading(true);

    const { data: project } = await supabase
      .from("projects")
      .select("status, aspect_ratio")
      .eq("id", projectId)
      .single();

    if (project?.status === "draft") {
      router.replace(`/dashboard/projects/new?resume=${projectId}`);
      return;
    }

    if (project?.aspect_ratio) {
      setLocalAspectRatio(project.aspect_ratio);
      setAspectRatio(project.aspect_ratio as "16:9" | "9:16");
    }

    // Resume a generation that was running when the page was left. Nothing
    // 'waits' any more — a slot's reframes happen inside its own task.
    const { data: inFlight } = await supabase
      .from("clip_jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_current", true)
      .in("status", ["queued", "running"])
      .limit(1)
      .maybeSingle();

    if (inFlight) {
      setGenerating(true);
      setActiveJobId(projectId);
    }

    await Promise.all([loadAllClips(), loadBalance(), loadVideoUrl()]);
    setLoading(false);
  }

  async function loadVideoUrl() {
    const res = await fetch(`/api/projects/${projectId}/video`);
    if (res.ok) {
      const data = await res.json();
      // Download link is the rendered S3 file; the in-app player uses streamUrl.
      if (data.downloadUrl) setVideoUrl(data.downloadUrl);
      if (data.status === "rendering") {
        setConcatenating(true);
        setConcatJobId(data.videoId ?? projectId);
      }
    }
  }

  async function loadAllClips() {
    // Clips are Mux assets now, so the graph endpoint hands back playback URLs
    // directly — no per-clip round trip for a presigned S3 link.
    const res = await fetch(`/api/generate/${projectId}`);
    if (!res.ok) return;

    const data: {
      clips: {
        id: string;
        slotId: string;
        orderIndex: number;
        playable: boolean;
        src: string | null;
        thumbnail: string | null;
      }[];
      composition: {
        clips: { clipJobId: string; orderIndex: number; inFrame: number; outFrame: number }[];
      } | null;
    } = await res.json();

    // Restore the saved edit — order and trim points — so a reload doesn't
    // silently reset every clip to full length.
    const edit = new Map(
      (data.composition?.clips ?? []).map((c) => [c.clipJobId, c])
    );

    const restored = data.clips
      .filter((c) => c.playable && c.src)
      .map((c) => {
        const saved = edit.get(c.id);
        const base = clipFromServer({
          id: c.id,
          src: c.src as string,
          orderIndex: saved?.orderIndex ?? c.orderIndex,
          thumbnail: c.thumbnail,
        });
        return saved
          ? { ...base, inFrame: saved.inFrame, outFrame: saved.outFrame }
          : base;
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);

    setClips(restored);
  }

  async function loadBalance() {
    const res = await fetch("/api/tokens/balance");
    if (res.ok) {
      const { balance: b } = await res.json();
      setBalance(b);
    }
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === "insufficient_balance") {
        setTopUpInfo({ balance: data.balance, required: data.required });
        setShowTopUp(true);
      } else {
        setError(data.error || "Generation failed");
      }
      setGenerating(false);
      return;
    }

    if (data.jobs?.length > 0) {
      setActiveJobId(data.jobs[data.jobs.length - 1].jobId);
    }
    loadBalance();
  }

  // Regenerating targets the SLOT, not the take. A take is a result — asking for
  // another one is just generating the slot again, which is why there is no
  // separate regenerate endpoint any more.
  async function handleRegen(slotId: string) {
    setError(null);
    setGenerating(true);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.error === "insufficient_balance") {
        setTopUpInfo({ balance: data.balance, required: data.required });
        setShowTopUp(true);
      } else {
        setError(data.error || "Regeneration failed");
      }
      setGenerating(false);
      return;
    }

    setActiveJobId(projectId);
    loadBalance();
  }

  /**
   * Finalize. Saves the edit first, then renders it.
   *
   * There is no stitch step — the timeline the user built IS the composition
   * Lambda renders, so the output can't drift from what they saw.
   */
  async function handleConcat() {
    setError(null);
    setConcatenating(true);

    // Persist the composition before rendering, so Lambda renders the edit that
    // is on screen rather than whatever was last autosaved.
    const saveRes = await fetch(`/api/projects/${projectId}/composition`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clips: storeClips.map((c, i) => ({
          clipJobId: c.id,
          orderIndex: i,
          inFrame: c.inFrame,
          outFrame: c.outFrame,
        })),
      }),
    });

    if (!saveRes.ok) {
      setError("Could not save your edit. Try again.");
      setConcatenating(false);
      return;
    }

    const res = await fetch("/api/generate/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Render failed to start");
      setConcatenating(false);
      return;
    }

    setConcatJobId(data.videoId ?? projectId);
  }

  const isVertical = aspectRatio === "9:16";
  const totalDurationSec = (totalFrames / FPS).toFixed(1);

  return (
    <div className="cs-scope flex min-h-0 items-stretch">
      <CinemaStyles />

      {/* The rail is where a clip comes into existence. Everything to its right
          is the stage — for now still the old single-column timeline. */}
      <SequenceRail onAddSlot={handleAddSlot} adding={addingSlot} />

      <div className="min-w-0 flex-1">
      <div className="cs-panel" style={{ maxWidth: "1040px", margin: "0 auto", padding: "28px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px", position: "relative", zIndex: 1 }}>
          <h1 className="cs-serif" style={{ fontSize: "26px", fontWeight: 500, color: "var(--hi)", letterSpacing: "-0.2px" }}>
            Timeline
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {storeClips.length > 0 && (
              <span className="cs-mono" style={{ fontSize: "12px", color: "var(--lo)" }}>
                {storeClips.length} clip{storeClips.length !== 1 ? "s" : ""} · {totalDurationSec}s
              </span>
            )}
            <div
              className="cs-raised"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
              }}
            >
              <Coins size={13} style={{ color: "var(--p-gold)" }} />
              <span style={{ fontSize: "11px", color: "var(--lo)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                Balance
              </span>
              <span className="cs-mono" style={{ fontSize: "13px", color: "var(--hi)", fontWeight: 600 }}>
                {balance.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              background: "color-mix(in srgb, var(--bad) 10%, var(--raised))",
              border: "1px solid color-mix(in srgb, var(--bad) 35%, transparent)",
              borderRadius: "10px",
              padding: "12px 14px",
              marginBottom: "18px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              animation: "cs-rise .3s cubic-bezier(.2,0,0,1)",
            }}
          >
            <AlertCircle size={16} style={{ color: "var(--bad)", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "var(--hi)", flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} className="cs-icon-btn">
              <X size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              className="cs-shimmer-box"
              style={{
                aspectRatio: isVertical ? "9 / 16" : "16 / 9",
                maxWidth: isVertical ? "320px" : "100%",
                margin: "0 auto",
                borderRadius: "12px",
              }}
            />
          </div>
        ) : storeClips.length === 0 ? (
          <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "8px 0 4px" }}>
            <div
              className="cs-raised"
              style={{
                position: "relative",
                overflow: "hidden",
                aspectRatio: isVertical ? "9 / 16" : "16 / 9",
                maxWidth: isVertical ? "300px" : "560px",
                margin: "0 auto 24px",
                borderRadius: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                border: generating ? "1px solid color-mix(in srgb, var(--hi) 40%, transparent)" : "1px solid var(--line)",
                transition: "border-color .3s",
              }}
            >
              {generating && <div className="cs-scan" />}
              <Film size={30} style={{ color: "var(--faint)" }} />
              {generating ? (
                <>
                  <span className="cs-dot active" style={{ marginTop: "2px" }} />
                  <span className="cs-mono" style={{ fontSize: "12px", color: "var(--tx)" }}>
                    Generating · {formatClock(genElapsed)}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: "13px", color: "var(--lo)", maxWidth: "260px", lineHeight: 1.5 }}>
                  No clips yet. Generate your first clip from the confirmed photos.
                </span>
              )}
            </div>
            <button onClick={handleGenerate} disabled={generating} className="cs-btn-solid" style={{ padding: "12px 24px", borderRadius: "9px", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Plus size={14} />
              {generating ? "Generating…" : "Generate Clips"}
            </button>
          </div>
        ) : (
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Remotion Player */}
            <RemotionPlayer ref={playerRef} isVertical={isVertical} />

            {/* Generating overlay indicator */}
            {generating && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  marginBottom: "14px",
                  borderRadius: "8px",
                  background: "color-mix(in srgb, var(--hi) 6%, var(--raised))",
                  border: "1px solid var(--line)",
                }}
              >
                <span className="cs-dot active" />
                <span className="cs-mono" style={{ fontSize: "12px", color: "var(--tx)" }}>
                  Generating clips · {formatClock(genElapsed)}
                </span>
              </div>
            )}

            {/* Transport */}
            <div style={{ marginBottom: "12px" }}>
              <TimelineControls playerRef={playerRef} />
            </div>

            {/* Timeline: ruler, proportional clips, playhead, edge-drag trim */}
            <div style={{ marginBottom: "22px" }}>
              <TimelineTrack playerRef={playerRef} onRegen={handleRegen} />
            </div>

            {/* Actions. Generating lives in the inspector now — it belongs beside
                the settings it uses, and a second copy here is what let the two
                drift apart in the first place. */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "28px" }}>

              <button
                onClick={handleConcat}
                disabled={concatenating || generating}
                className="cs-btn-solid"
                style={{ padding: "10px 18px", borderRadius: "9px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                {concatenating ? <span className="cs-dot active" style={{ background: "#0b0b0e" }} /> : <Download size={14} />}
                {concatenating ? `Rendering… ${formatClock(concatElapsed)}` : "Finalize & Download"}
              </button>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="cs-btn-ghost"
                style={{ padding: "10px 18px", borderRadius: "9px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                {generating ? <span className="cs-dot active" /> : <Plus size={14} />}
                {generating ? "Generating…" : "Generate More"}
              </button>
            </div>

            {/* Finalize result */}
            {videoUrl && (
              <div
                className="cs-raised cs-reveal-el"
                style={{
                  borderRadius: "12px",
                  padding: "24px",
                  textAlign: "center",
                  borderColor: "color-mix(in srgb, var(--good) 35%, var(--line))",
                }}
              >
                <CheckCircle2 size={22} style={{ color: "var(--good)", marginBottom: "10px" }} />
                <p style={{ color: "var(--hi)", fontWeight: 600, marginBottom: "14px", fontSize: "14px" }}>Video ready</p>
                <a href={videoUrl} download className="cs-btn-solid" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "9px", fontSize: "14px", textDecoration: "none" }}>
                  <Download size={16} />
                  Download Video
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top-up modal */}
      {showTopUp && topUpInfo && (
        <div className="cs-modal-overlay" onClick={() => setShowTopUp(false)}>
          <div
            className="cs-raised cs-reveal-el"
            style={{ borderRadius: "14px", padding: "32px", maxWidth: "380px", width: "90%", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Coins size={30} style={{ color: "var(--p-gold)", marginBottom: "14px" }} />
            <h3 className="cs-serif" style={{ fontSize: "19px", fontWeight: 500, color: "var(--hi)", marginBottom: "8px" }}>
              Not enough tokens
            </h3>
            <p style={{ fontSize: "13px", color: "var(--tx)", marginBottom: "22px", lineHeight: 1.6 }}>
              This action costs{" "}
              <span className="cs-mono" style={{ color: "var(--hi)", fontWeight: 600 }}>
                {topUpInfo.required.toLocaleString()}
              </span>{" "}
              tokens. You have{" "}
              <span className="cs-mono" style={{ color: "var(--hi)", fontWeight: 600 }}>
                {topUpInfo.balance.toLocaleString()}
              </span>
              .
            </p>
            <Link
              href="/dashboard/tokens"
              className="cs-btn-solid"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "9px", fontSize: "14px", textDecoration: "none", marginBottom: "14px" }}
            >
              <Coins size={16} />
              Buy Tokens
            </Link>
            <br />
            <button
              onClick={() => setShowTopUp(false)}
              style={{ marginTop: "6px", background: "none", border: "none", fontSize: "13px", color: "var(--lo)", cursor: "pointer" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      </div>

      <Inspector
        uploads={uploads}
        extractedFrames={extractedFrames}
        onPatch={patchSlot}
        onGenerate={handleRegen}
        generating={generating}
        costTokens={displayTokensFor(selectedSlot?.duration_seconds ?? 4)}
      />
    </div>
  );
}

function CinemaStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');

      .cs-scope {
        --stage:#08080a; --base:#0e0e11; --raised:#16161a; --raised-2:#1d1d22; --overlay:#26262c;
        --line-faint:#ffffff08; --line:#ffffff14; --line-strong:#ffffff26;
        --hi:#f4f4f6; --tx:#a9a9b3; --lo:#6f6f7a; --faint:#4a4a54;
        --good:#34d399; --bad:#f4607a;
        --p-magenta:#d878f0; --p-violet:#7830d8; --p-blue:#3a7bd5; --p-cyan:#22b8c0;
        --p-green:#46c266; --p-gold:#f0c000; --p-orange:#e07a2c; --p-red:#e0405a; --p-pink:#f090a8;
        font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
      }
      .cs-serif { font-family: 'Fraunces', Georgia, serif; }
      .cs-mono { font-family: 'Geist Mono', ui-monospace, monospace; }

      .cs-panel {
        position: relative;
        background: var(--base);
        border: 1px solid var(--line);
        border-radius: 20px;
        overflow: hidden;
      }
      .cs-panel::before {
        content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .5; z-index: 0;
        background:
          radial-gradient(60% 50% at 82% 6%, #7830d815, transparent 60%),
          radial-gradient(50% 45% at 10% 96%, #3a7bd512, transparent 60%),
          radial-gradient(40% 40% at 94% 90%, #22b8c00e, transparent 60%);
      }
      .cs-panel::after {
        content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .04; z-index: 0;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52' viewBox='0 0 60 52'%3E%3Cpath d='M30 0L60 17v18L30 52 0 35V17z' fill='none' stroke='%23fff' stroke-width='.5'/%3E%3Cpath d='M30 0v52M0 17l60 18M60 17L0 35' stroke='%23fff' stroke-width='.3'/%3E%3C/svg%3E");
        background-size: 60px 52px;
      }

      .cs-raised {
        position: relative;
        background: var(--raised);
        border: 1px solid var(--line);
      }
      .cs-raised::before {
        content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: #ffffff0a; pointer-events: none;
      }

      .cs-btn-solid {
        color: #0b0b0e; border: none; font-weight: 600; cursor: pointer;
        background: linear-gradient(180deg, #fbfbfd, #dcdce2);
        box-shadow: 0 1px 0 #fff inset, 0 5px 16px #00000066;
        transition: transform .15s cubic-bezier(.2,0,0,1), box-shadow .15s;
      }
      .cs-btn-solid:hover:not(:disabled) { transform: translateY(-1px); }
      .cs-btn-solid:disabled { opacity: .5; cursor: not-allowed; }

      .cs-btn-ghost {
        background: var(--raised); color: var(--tx); border: 1px solid var(--line); cursor: pointer;
        transition: all .15s cubic-bezier(.2,0,0,1);
      }
      .cs-btn-ghost:hover:not(:disabled) { border-color: var(--line-strong); color: var(--hi); transform: translateY(-1px); }
      .cs-btn-ghost:disabled { opacity: .5; cursor: not-allowed; }

      .cs-icon-btn {
        background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px;
        color: var(--lo); display: inline-flex; align-items: center; justify-content: center;
        transition: color .15s, background .15s;
      }
      .cs-icon-btn:hover:not(:disabled) { color: var(--hi); background: var(--raised); }
      .cs-icon-btn:disabled { opacity: .3; cursor: default; }

      .cs-clip-card {
        position: relative; flex-shrink: 0; border-radius: 7px; overflow: hidden;
        border: 2px solid var(--line); background: var(--raised); cursor: pointer; padding: 0;
        display: flex; align-items: center; justify-content: center;
        transition: border-color .15s, box-shadow .15s, transform .15s;
      }
      .cs-clip-card:hover { transform: translateY(-1px); }
      .cs-clip-badge {
        position: absolute; font-size: 9px; font-weight: 600; color: var(--hi);
        background: rgba(0,0,0,.65); border-radius: 3px; padding: 1px 4px; line-height: 1.4;
      }

      .cs-dot {
        width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
        background: var(--faint);
      }
      .cs-dot.active {
        background: var(--hi);
        animation: cs-breathe 1.7s ease-in-out infinite;
      }

      .cs-shimmer-box {
        position: relative; overflow: hidden; background: var(--raised); border: 1px solid var(--line);
      }
      .cs-shimmer-box::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(100deg, transparent, #ffffff0f, transparent);
        transform: translateX(-120%);
        animation: cs-scan-sweep 1.8s ease-in-out infinite;
      }

      .cs-scan {
        position: absolute; inset: 0; overflow: hidden; pointer-events: none;
      }
      .cs-scan::after {
        content: ""; position: absolute; top: 0; bottom: 0; width: 40%;
        background: linear-gradient(100deg, transparent, #ffffff12, transparent);
        animation: cs-scan-sweep 1.8s ease-in-out infinite;
      }

      .cs-reveal-el { animation: cs-reveal .42s cubic-bezier(.2,0,0,1); }

      .cs-modal-overlay {
        position: fixed; inset: 0; background: rgba(4,4,6,.7); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center; z-index: 1000;
      }

      @keyframes cs-breathe { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
      @keyframes cs-scan-sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
      @keyframes cs-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes cs-reveal { from { opacity: 0; transform: scale(.97); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }

      @media (prefers-reduced-motion: reduce) {
        .cs-dot.active, .cs-shimmer-box::after, .cs-scan::after, .cs-reveal-el {
          animation: none !important;
        }
      }
    `}</style>
  );
}
