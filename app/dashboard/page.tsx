"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Film, Coins, Plus, Loader2, ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import type { Project } from "@/lib/types/database";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const [balRes, projRes, countRes] = await Promise.all([
        fetch("/api/tokens/balance"),
        supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("projects")
          .select("*", { count: "exact", head: true }),
      ]);

      if (balRes.ok) {
        const { balance: b } = await balRes.json();
        setBalance(b);
      }

      if (projRes.data) {
        setProjects(projRes.data);
      }

      setProjectCount(countRes.count ?? 0);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
        <Loader2 size={24} style={{ color: "#9C8E82", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div>
      {/* Header row: greeting + new project button */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "28px",
              fontWeight: 400,
              color: "#141414",
              marginBottom: "4px",
            }}
          >
            {profile?.name ? `${profile.name.split(" ")[0]}'s studio` : "Your studio"}
          </h1>
          <p style={{ fontSize: "14px", color: "#7A736A" }}>
            Generate listing videos from your property photos.
          </p>
        </div>

        <Link
          href="/dashboard/projects/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "#141414",
            color: "#FFF",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            textDecoration: "none",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2A2A2A")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#141414")}
        >
          <Plus size={16} />
          New Project
        </Link>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        <Link
          href="/dashboard/tokens"
          style={{
            background: "white",
            border: "1px solid #E8E0D4",
            borderRadius: "12px",
            padding: "24px",
            textDecoration: "none",
            color: "#141414",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#C8C0B4";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#E8E0D4";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Coins size={16} style={{ color: "#9C8E82" }} />
              <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#7A736A", fontWeight: 500 }}>
                Token Balance
              </span>
            </div>
            <div style={{ fontSize: "32px", fontWeight: 600, color: "#141414" }}>
              {(balance ?? 0).toLocaleString()}
            </div>
          </div>
          <ArrowRight size={18} style={{ color: "#C8C0B4" }} />
        </Link>

        <Link
          href="/dashboard/projects"
          style={{
            background: "white",
            border: "1px solid #E8E0D4",
            borderRadius: "12px",
            padding: "24px",
            textDecoration: "none",
            color: "#141414",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#C8C0B4";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#E8E0D4";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Film size={16} style={{ color: "#9C8E82" }} />
              <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#7A736A", fontWeight: 500 }}>
                Total Projects
              </span>
            </div>
            <div style={{ fontSize: "32px", fontWeight: 600, color: "#141414" }}>
              {projectCount}
            </div>
          </div>
          <ArrowRight size={18} style={{ color: "#C8C0B4" }} />
        </Link>
      </div>

      {/* Projects section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#141414" }}>
          Projects
        </h2>
        {projects.length > 0 && (
          <Link
            href="/dashboard/projects"
            style={{ fontSize: "13px", color: "#7A736A", textDecoration: "none", fontWeight: 500 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#141414")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#7A736A")}
          >
            View all
          </Link>
        )}
      </div>

      {projects.length === 0 ? (
        <div
          style={{
            background: "white",
            border: "1px dashed #D4C5A9",
            borderRadius: "12px",
            padding: "60px 32px",
            textAlign: "center",
          }}
        >
          <Film size={28} style={{ color: "#D4C5A9", marginBottom: "12px" }} />
          <p style={{ color: "#7A736A", fontSize: "14px", marginBottom: "16px" }}>
            No projects yet. Upload photos to create your first listing video.
          </p>
          <Link
            href="/dashboard/projects/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "#141414",
              color: "#FFF",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <Plus size={16} />
            Create Project
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              style={{
                background: "white",
                border: "1px solid #E8E0D4",
                borderRadius: "12px",
                padding: "20px",
                textDecoration: "none",
                color: "#141414",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#C8C0B4";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E8E0D4";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "15px", fontWeight: 500 }}>
                  {project.title}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: project.status === "confirmed" ? "#ECFDF5" : "#F8F6F2",
                    color: project.status === "confirmed" ? "#059669" : "#7A736A",
                    textTransform: "capitalize",
                  }}
                >
                  {project.status}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock size={12} style={{ color: "#9C9088" }} />
                <span style={{ fontSize: "12px", color: "#9C9088" }}>
                  {new Date(project.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {project.aspect_ratio && (
                  <span style={{ fontSize: "11px", color: "#9C9088", marginLeft: "8px", padding: "1px 6px", border: "1px solid #E8E0D4", borderRadius: "3px" }}>
                    {project.aspect_ratio}
                  </span>
                )}
              </div>
            </Link>
          ))}

          {/* New project card */}
          <Link
            href="/dashboard/projects/new"
            style={{
              background: "#FAFAF8",
              border: "1px dashed #D4C5A9",
              borderRadius: "12px",
              padding: "20px",
              textDecoration: "none",
              color: "#7A736A",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              minHeight: "100px",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#9C8E82";
              e.currentTarget.style.background = "#F5F1E8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#D4C5A9";
              e.currentTarget.style.background = "#FAFAF8";
            }}
          >
            <Plus size={20} style={{ color: "#9C8E82" }} />
            <span style={{ fontSize: "13px", fontWeight: 500 }}>New Project</span>
          </Link>
        </div>
      )}
    </div>
  );
}
