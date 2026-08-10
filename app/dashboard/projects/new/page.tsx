"use client";

import { useCallback, useId, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import { useNewProjectStore } from "@/lib/stores/useNewProjectStore";
import {
  Upload,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ImageIcon,
  X,
} from "lucide-react";
import { SortablePhotoGrid } from "@/components/projects/SortablePhotoGrid";

const TOKENS_PER_CLIP = 400;

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputId = useId();

  const {
    step,
    title,
    aspectRatio,
    projectId,
    photos,
    selectionOrder,
    error,
    creating,
    confirming,
    setStep,
    setTitle,
    setAspectRatio,
    setProjectId,
    addPhoto,
    setPhotos,
    removePhoto,
    setError,
    setCreating,
    setConfirming,
    reorderSelection,
    reset,
  } = useNewProjectStore();

  useEffect(() => {
    const resumeId = searchParams.get("resume");

    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;

      // Load default aspect ratio preference
      const { data: prefData } = await client
        .from("user_preferences")
        .select("default_aspect_ratio")
        .eq("user_id", user.id)
        .single();
      if (prefData?.default_aspect_ratio) {
        setAspectRatio(prefData.default_aspect_ratio);
      }

      // Resume an existing draft project
      if (resumeId) {
        const { data: project } = await client
          .from("projects")
          .select("id, title, aspect_ratio")
          .eq("id", resumeId)
          .eq("user_id", user.id)
          .single();

        if (project) {
          setProjectId(project.id);
          setTitle(project.title);
          setAspectRatio(project.aspect_ratio || "9:16");

          const { data: photoData } = await client
            .from("photos")
            .select("*")
            .eq("project_id", project.id)
            .order("created_at", { ascending: true });

          if (photoData) setPhotos(photoData);
          setStep("upload");
        }
      }
    })();

    return () => { reset(); };
  }, [searchParams, reset, setAspectRatio, setProjectId, setTitle, setPhotos, setStep]);

  const { uploads, isUploading, addFiles, dismissUpload, dismissActive } = useFileUpload({
    projectId: projectId || "",
    onSuccess: (file) => {
      if (file.photoId && file.url && file.key) {
        addPhoto({
          id: file.photoId,
          project_id: projectId!,
          // Everything uploaded here is an upload. Extracted last-frames are
          // created by the worker and never pass through this path.
          source: "upload",
          derived_from_clip_job_id: null,
          s3_key: file.key,
          s3_url: file.url,
          file_name: file.fileName,
          file_size: null,
          width: null,
          height: null,
          selected: false,
          order_index: null,
          created_at: new Date().toISOString(),
        });
      }
    },
  });

  const handleCreateProject = async () => {
    if (!title.trim()) {
      setError("Project name is required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), aspectRatio }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      const project = await res.json();
      setProjectId(project.id);
      setStep("upload");
    } catch {
      setError("Failed to create project. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) addFiles(files);
    },
    [addFiles]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  // Combines the old "confirm" + "generate" clicks into one action: confirm the
  // sequence, then kick off generation immediately so Timeline opens already in
  // progress. Timeline still has its own "Generate Clips" button as a fallback
  // if the generate call below fails for any reason.
  const handleCreateVideo = async () => {
    if (selectionOrder.length < 2) {
      setError("Add at least 2 photos to continue.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const confirmRes = await fetch(`/api/projects/${projectId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedPhotoIds: selectionOrder }),
      });
      if (!confirmRes.ok) throw new Error("Failed to confirm");

      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }).catch(() => {});

      router.push(`/dashboard/projects/${projectId}`);
    } catch {
      setError("Failed to start your video. Please try again.");
      setConfirming(false);
    }
  };

  const allUploads = Object.values(uploads);
  const activeFiles = allUploads.filter(
    (u) => u.status === "queued" || u.status === "uploading"
  );
  const failedFiles = allUploads.filter((u) => u.status === "error");
  const doneCount = allUploads.filter((u) => u.status === "success").length;
  const clipCount = Math.max(selectionOrder.length - 1, 0);
  const tokenCost = clipCount * TOKENS_PER_CLIP;

  // ─── STEP 1: Create ───────────────────────────────────────────────────────────
  if (step === "create") {
    return (
      <div style={{ maxWidth: "480px", margin: "60px auto", padding: "0 20px" }}>
        <div style={{ marginBottom: "32px" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "28px",
              fontWeight: 400,
              color: "#141414",
              marginBottom: "8px",
            }}
          >
            New Project
          </h1>
          <p style={{ color: "#5A5248", fontSize: "14px", lineHeight: "1.5" }}>
            Name your project, then upload listing photos to generate video clips.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <AlertCircle size={16} style={{ color: "#DC2626", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", color: "#991B1B" }}>{error}</span>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#141414",
              display: "block",
              marginBottom: "8px",
            }}
          >
            Project name
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 123 Main St Listing"
            onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            style={{
              width: "100%",
              padding: "14px 16px",
              border: "1px solid #E8E0D4",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s",
              background: "#FAFAFA",
            }}
          />
        </div>

        {/* Aspect ratio selector */}
        <div style={{ marginBottom: "28px" }}>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#141414",
              display: "block",
              marginBottom: "10px",
            }}
          >
            Video format
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* 9:16 option */}
            <button
              type="button"
              onClick={() => setAspectRatio("9:16")}
              style={{
                padding: "14px 16px",
                background: aspectRatio === "9:16" ? "#F0EEFF" : "#FAFAFA",
                border: aspectRatio === "9:16" ? "2px solid #4F46E5" : "1px solid #E8E0D4",
                borderRadius: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "50px",
                  borderRadius: "4px",
                  background: aspectRatio === "9:16" ? "#4F46E5" : "#D4C5A9",
                  flexShrink: 0,
                  transition: "background 0.15s",
                }}
              />
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#141414", marginBottom: "2px" }}>
                  9:16 Vertical
                </p>
                <p style={{ fontSize: "12px", color: "#5A5248", lineHeight: "1.4" }}>
                  Instagram Reels, TikTok, YouTube Shorts — built to stop the scroll
                </p>
              </div>
            </button>

            {/* 16:9 option */}
            <button
              type="button"
              onClick={() => setAspectRatio("16:9")}
              style={{
                padding: "14px 16px",
                background: aspectRatio === "16:9" ? "#F0EEFF" : "#FAFAFA",
                border: aspectRatio === "16:9" ? "2px solid #4F46E5" : "1px solid #E8E0D4",
                borderRadius: "10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                transition: "all 0.15s",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "28px",
                  borderRadius: "4px",
                  background: aspectRatio === "16:9" ? "#4F46E5" : "#D4C5A9",
                  flexShrink: 0,
                  transition: "background 0.15s",
                }}
              />
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#141414", marginBottom: "2px" }}>
                  16:9 Landscape
                </p>
                <p style={{ fontSize: "12px", color: "#5A5248", lineHeight: "1.4" }}>
                  MLS listings, YouTube tours, website embeds, email campaigns
                </p>
              </div>
            </button>
          </div>
        </div>

        <button
          onClick={handleCreateProject}
          disabled={creating}
          style={{
            width: "100%",
            padding: "14px",
            background: creating ? "#D4C5A9" : "#141414",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: creating ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          {creating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowRight size={16} />
          )}
          {creating ? "Creating..." : "Continue"}
        </button>

        <style>{`
          .animate-spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // ─── STEP 2: Upload + arrange + create (combined) ────────────────────────────
  return (
    <div style={{ maxWidth: "820px", margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "24px",
            fontWeight: 400,
            color: "#141414",
            marginBottom: "6px",
          }}
        >
          Add Your Photos
        </h1>
        <p style={{ color: "#5A5248", fontSize: "14px" }}>
          Upload listing images, then drag to set the order your video will play in.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <AlertCircle size={16} style={{ color: "#DC2626", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", color: "#991B1B" }}>{error}</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        style={{
          border: "2px dashed #D4C5A9",
          borderRadius: "12px",
          padding: "32px 24px",
          textAlign: "center",
          background: "#FAFAF8",
          marginBottom: "20px",
          transition: "all 0.15s",
          cursor: "pointer",
        }}
        onDrop={handleDrop}
        onDragOver={handleDrag}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onClick={() => document.getElementById(fileInputId)?.click()}
      >
        <Upload size={24} style={{ color: "#8B7E6A", marginBottom: "10px" }} />
        <p style={{ fontSize: "14px", color: "#141414", fontWeight: 500, marginBottom: "4px" }}>
          Drag & drop photos here, or click to choose files
        </p>
        <p style={{ fontSize: "12px", color: "#5A5248" }}>
          JPG, PNG, or WebP — up to 30 images
        </p>
        <label htmlFor={fileInputId}>
          <input
            id={fileInputId}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Upload progress */}
      {activeFiles.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <p style={{ fontSize: "12px", color: "#5A5248", fontWeight: 500 }}>
              Uploading... {doneCount}/{allUploads.length - failedFiles.length} complete
            </p>
            <button
              onClick={() => dismissActive()}
              style={{
                fontSize: "11px",
                color: "#DC2626",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Skip remaining
            </button>
          </div>
          {activeFiles.map((u) => (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                background: "#FFF",
                border: "1px solid #E8E0D4",
                borderRadius: "6px",
                marginBottom: "4px",
              }}
            >
              <ImageIcon size={14} style={{ color: "#5A5248" }} />
              <span style={{ fontSize: "13px", flex: 1, color: "#141414" }}>{u.fileName}</span>
              {u.status === "queued" ? (
                <span style={{ fontSize: "11px", color: "#9C9088" }}>Queued</span>
              ) : (
                <div
                  style={{
                    width: "80px",
                    height: "4px",
                    background: "#E8E0D4",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${u.progress}%`,
                      height: "100%",
                      background: "#4F46E5",
                      transition: "width 0.2s",
                    }}
                  />
                </div>
              )}
              <button
                onClick={() => dismissUpload(u.id)}
                title="Dismiss"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  color: "#9C9088",
                  lineHeight: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {failedFiles.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          {failedFiles.map((u, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "6px",
                marginBottom: "4px",
              }}
            >
              <X size={14} style={{ color: "#DC2626" }} />
              <span style={{ fontSize: "12px", color: "#991B1B" }}>
                {u.fileName}: {u.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sortable grid — set order + remove, right where the photos land */}
      {photos.length > 0 ? (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "10px" }}>
            <strong>{selectionOrder.length}</strong> photo{selectionOrder.length !== 1 ? "s" : ""} &middot; drag to reorder, &times; to remove
          </p>
          <SortablePhotoGrid
            photos={photos}
            selectedIds={selectionOrder}
            onReorder={reorderSelection}
            onDeselect={removePhoto}
          />
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "#9C9088", textAlign: "center", padding: "24px 0" }}>
          Uploaded photos will appear here for you to arrange.
        </p>
      )}

      {photos.length > 0 && (
        <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "20px" }}>
          <strong>{selectionOrder.length}</strong> photos &rarr; <strong>{clipCount}</strong> clip{clipCount !== 1 ? "s" : ""}
          {" "}({tokenCost.toLocaleString()} tokens)
        </p>
      )}

      {/* Bottom actions */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          onClick={() => setStep("create")}
          style={{
            padding: "12px 20px",
            background: "#FFF",
            color: "#141414",
            border: "1px solid #E8E0D4",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          onClick={handleCreateVideo}
          disabled={confirming || isUploading || selectionOrder.length < 2}
          style={{
            flex: 1,
            padding: "14px 20px",
            background: confirming || isUploading || selectionOrder.length < 2 ? "#D4C5A9" : "#141414",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: confirming || isUploading || selectionOrder.length < 2 ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          {confirming ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowRight size={16} />
          )}
          {confirming ? "Starting your video..." : "Create My Video"}
        </button>
      </div>
      {photos.length > 0 && (
        <p style={{ fontSize: "11px", color: "#9C9088", marginTop: "10px", textAlign: "center" }}>
          We'll generate {clipCount} clip{clipCount !== 1 ? "s" : ""} for {tokenCost.toLocaleString()} tokens and start building your video right away.
        </p>
      )}

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
