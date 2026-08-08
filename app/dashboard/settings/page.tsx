"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type { UserPreferences } from "@/lib/types/database";
import { Loader2, Save, AlertCircle, Check } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const supabase = createClient();

  // Profile
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Preferences
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences>({
    id: "",
    user_id: "",
    default_aspect_ratio: "9:16",
    notify_job_completed: true,
    notify_tokens_low: true,
    notify_purchase_confirmed: true,
    created_at: "",
    updated_at: "",
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isPasswordUser = user?.app_metadata?.provider === "email";
  const selectedRatio = prefs.default_aspect_ratio;

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setPrefs(data as UserPreferences);
        setPrefsLoaded(true);
      });
  }, [user, supabase]);

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    await supabase.from("users").update({ name }).eq("id", user.id);
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) {
      const data = await res.json();
      setPasswordError(data.error || "Failed to update password.");
    } else {
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSaved(false), 2000);
    }
    setSavingPassword(false);
  }

  async function handleSavePrefs() {
    if (!user) return;
    setSavingPrefs(true);
    await supabase
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        default_aspect_ratio: prefs.default_aspect_ratio,
        notify_job_completed: prefs.notify_job_completed,
        notify_tokens_low: prefs.notify_tokens_low,
        notify_purchase_confirmed: prefs.notify_purchase_confirmed,
      }, { onConflict: "user_id" });
    setSavingPrefs(false);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/account/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setDeleteError(data.error || "Failed to delete account.");
      setDeleting(false);
    } else {
      router.push("/login");
    }
  }

  const sectionStyle = {
    borderTop: "1px solid #E8E0D4",
    paddingTop: "28px",
    marginTop: "32px",
  };

  const labelStyle = {
    fontSize: "13px" as const,
    fontWeight: 500 as const,
    color: "#141414",
    display: "block" as const,
    marginBottom: "8px",
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid #E8E0D4",
    borderRadius: "8px",
    fontSize: "14px",
    outline: "none",
    background: "#FAFAFA",
  };

  const btnPrimary = (loading: boolean) => ({
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: "8px",
    padding: "10px 20px",
    background: loading ? "#D4C5A9" : "#141414",
    color: "#FFF",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600 as const,
    cursor: loading ? ("not-allowed" as const) : ("pointer" as const),
  });

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto" }}>
      <h1
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "28px",
          fontWeight: 400,
          color: "#141414",
          marginBottom: "8px",
        }}
      >
        Settings
      </h1>
      <p style={{ color: "#5A5248", fontSize: "14px", marginBottom: "32px" }}>
        Manage your account and preferences.
      </p>

      {/* ─── PROFILE ─────────────────────────────────────────────────── */}
      <section>
        <h2 style={{ fontSize: "12px", fontWeight: 600, color: "#5A5248", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
          Profile
        </h2>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={user?.email || ""}
            disabled
            style={{ ...inputStyle, background: "#F8F6F2", color: "#5A5248" }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={handleSaveProfile} disabled={savingProfile} style={btnPrimary(savingProfile)}>
            {savingProfile ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
            Save
          </button>
          {profileSaved && (
            <span style={{ fontSize: "13px", color: "#059669", display: "flex", alignItems: "center", gap: "4px" }}>
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </section>

      {/* ─── PASSWORD ────────────────────────────────────────────────── */}
      {isPasswordUser && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "12px", fontWeight: 600, color: "#5A5248", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
            Change Password
          </h2>

          {passwordError && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={14} style={{ color: "#DC2626", flexShrink: 0 }} />
              <span style={{ fontSize: "13px", color: "#991B1B" }}>{passwordError}</span>
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={handleChangePassword} disabled={savingPassword} style={btnPrimary(savingPassword)}>
              {savingPassword ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
              Update Password
            </button>
            {passwordSaved && (
              <span style={{ fontSize: "13px", color: "#059669", display: "flex", alignItems: "center", gap: "4px" }}>
                <Check size={14} /> Updated
              </span>
            )}
          </div>
        </section>
      )}

      {/* ─── DEFAULT VIDEO FORMAT ────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "12px", fontWeight: 600, color: "#5A5248", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
          Default Video Format
        </h2>
        <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "12px" }}>
          This will be pre-selected when you create a new project.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => setPrefs((p) => ({ ...p, default_aspect_ratio: "9:16" }))}
            style={{
              padding: "14px 16px",
              background: selectedRatio === "9:16" ? "#F0EEFF" : "#FAFAFA",
              border: selectedRatio === "9:16" ? "2px solid #4F46E5" : "1px solid #E8E0D4",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              transition: "all 0.15s",
              textAlign: "left",
            }}
          >
            <div style={{ width: "28px", height: "50px", borderRadius: "4px", background: selectedRatio === "9:16" ? "#4F46E5" : "#D4C5A9", flexShrink: 0, transition: "background 0.15s" }} />
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#141414", marginBottom: "2px" }}>9:16 Vertical</p>
              <p style={{ fontSize: "12px", color: "#5A5248", lineHeight: "1.4" }}>Instagram Reels, TikTok, YouTube Shorts — built to stop the scroll</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPrefs((p) => ({ ...p, default_aspect_ratio: "16:9" }))}
            style={{
              padding: "14px 16px",
              background: selectedRatio === "16:9" ? "#F0EEFF" : "#FAFAFA",
              border: selectedRatio === "16:9" ? "2px solid #4F46E5" : "1px solid #E8E0D4",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              transition: "all 0.15s",
              textAlign: "left",
            }}
          >
            <div style={{ width: "50px", height: "28px", borderRadius: "4px", background: selectedRatio === "16:9" ? "#4F46E5" : "#D4C5A9", flexShrink: 0, transition: "background 0.15s" }} />
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#141414", marginBottom: "2px" }}>16:9 Landscape</p>
              <p style={{ fontSize: "12px", color: "#5A5248", lineHeight: "1.4" }}>MLS listings, YouTube tours, website embeds, email campaigns</p>
            </div>
          </button>
        </div>
      </section>

      {/* ─── NOTIFICATIONS ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "12px", fontWeight: 600, color: "#5A5248", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
          Notifications
        </h2>
        <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "16px" }}>
          Choose which email notifications you receive.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          <ToggleRow
            label="Job completed"
            description="When your video clip finishes generating"
            checked={prefs.notify_job_completed}
            onChange={(v) => setPrefs((p) => ({ ...p, notify_job_completed: v }))}
          />
          <ToggleRow
            label="Tokens running low"
            description="When your balance drops below 100 tokens"
            checked={prefs.notify_tokens_low}
            onChange={(v) => setPrefs((p) => ({ ...p, notify_tokens_low: v }))}
          />
          <ToggleRow
            label="Purchase confirmed"
            description="Receipt when you buy more tokens"
            checked={prefs.notify_purchase_confirmed}
            onChange={(v) => setPrefs((p) => ({ ...p, notify_purchase_confirmed: v }))}
          />
        </div>
      </section>

      {/* Save preferences (format + notifications) */}
      <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={handleSavePrefs} disabled={savingPrefs || !prefsLoaded} style={btnPrimary(savingPrefs)}>
          {savingPrefs ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
          Save Preferences
        </button>
        {prefsSaved && (
          <span style={{ fontSize: "13px", color: "#059669", display: "flex", alignItems: "center", gap: "4px" }}>
            <Check size={14} /> Saved
          </span>
        )}
      </div>

      {/* ─── DANGER ZONE ─────────────────────────────────────────────── */}
      <section style={{ ...sectionStyle, borderTopColor: "#FCA5A5" }}>
        <h2 style={{ fontSize: "12px", fontWeight: 600, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
          Danger Zone
        </h2>
        <p style={{ fontSize: "13px", color: "#5A5248", marginBottom: "16px" }}>
          Permanently delete your account and all associated data.
        </p>

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            style={{
              padding: "10px 20px",
              background: "#FFF",
              color: "#DC2626",
              border: "1px solid #FCA5A5",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>
        ) : (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FCA5A5",
              borderRadius: "10px",
              padding: "16px",
            }}
          >
            <p style={{ fontSize: "13px", color: "#991B1B", marginBottom: "12px", lineHeight: "1.5" }}>
              This will permanently delete your account, all projects, photos, videos, and remaining tokens. This action cannot be undone.
            </p>
            <p style={{ fontSize: "13px", color: "#141414", marginBottom: "8px", fontWeight: 500 }}>
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              style={{ ...inputStyle, marginBottom: "12px", background: "#FFF" }}
            />

            {deleteError && (
              <p style={{ fontSize: "12px", color: "#DC2626", marginBottom: "12px" }}>{deleteError}</p>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  background: deleting ? "#FCA5A5" : "#DC2626",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {deleting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
                {deleting ? "Deleting..." : "Delete My Account"}
              </button>
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm(""); setDeleteError(null); }}
                style={{
                  padding: "10px 20px",
                  background: "#FFF",
                  color: "#141414",
                  border: "1px solid #E8E0D4",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <div style={{ height: "60px" }} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        background: "#FAFAFA",
        borderRadius: "8px",
        border: "1px solid #E8E0D4",
      }}
    >
      <div>
        <p style={{ fontSize: "14px", color: "#141414", fontWeight: 500, marginBottom: "2px" }}>{label}</p>
        <p style={{ fontSize: "12px", color: "#5A5248" }}>{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: "40px",
          height: "22px",
          borderRadius: "11px",
          background: checked ? "#4F46E5" : "#D4C5A9",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "#FFF",
            position: "absolute",
            top: "3px",
            left: checked ? "21px" : "3px",
            transition: "left 0.2s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </button>
    </div>
  );
}
