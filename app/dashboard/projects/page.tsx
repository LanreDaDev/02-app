"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types/database";
import { Film, FolderPlus, Loader2, Trash2, AlertTriangle } from "lucide-react";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setProjects(data);
      setLoading(false);
    }
    load();
  }, []);

  function promptDelete(e: React.MouseEvent, project: Project) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTarget(project);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px" }}>
        <Loader2 size={28} style={{ color: "#5A5248", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "28px", fontWeight: 400, color: "#141414" }}>
          Projects
        </h1>
        <Link
          href="/dashboard/projects/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            background: "#141414",
            color: "#FFFFFF",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <FolderPlus size={14} />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div style={{ background: "white", border: "1px solid #E8E0D4", borderRadius: "12px", padding: "48px", textAlign: "center" }}>
          <Film size={32} style={{ color: "#D4C5A9", marginBottom: "12px" }} />
          <p style={{ color: "#5A5248", fontSize: "14px" }}>
            No projects yet. Create your first listing video.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "white",
                border: "1px solid #E8E0D4",
                borderRadius: "8px",
                padding: "16px 20px",
                textDecoration: "none",
                color: "#141414",
                transition: "border-color 0.2s",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "2px" }}>
                  {project.title}
                </div>
                <div style={{ fontSize: "12px", color: "#5A5248" }}>
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "12px",
                    background: project.status === "confirmed" ? "#ECFDF5" : "#F8F6F2",
                    color: project.status === "confirmed" ? "#059669" : "#5A5248",
                    textTransform: "capitalize",
                  }}
                >
                  {project.status}
                </span>
                <button
                  onClick={(e) => promptDelete(e, project)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "#9C9088",
                    borderRadius: "4px",
                    transition: "color 0.15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = "#DC2626")}
                  onMouseOut={(e) => (e.currentTarget.style.color = "#9C9088")}
                  title="Delete project"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: "12px",
              padding: "28px",
              maxWidth: "380px",
              width: "90%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle size={28} style={{ color: "#DC2626", marginBottom: "12px" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#141414", marginBottom: "8px" }}>
              Delete project?
            </h3>
            <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "24px", lineHeight: "1.5" }}>
              <strong>{deleteTarget.title}</strong> and all its photos, clips, and generated videos will be permanently deleted.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  background: "#FFF",
                  border: "1px solid #E8E0D4",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  background: "#DC2626",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {deleting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
