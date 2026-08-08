"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import UserMenu from "@/components/auth/UserMenu";
import type { Notification } from "@/lib/types/database";

export default function DashboardNav() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.read).length);
      }
    }
    load();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", unreadIds);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function handleBellClick() {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      markAllRead();
    }
  }

  function timeAgo(dateStr: string) {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return "just now";
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <header
      style={{
        height: "64px",
        background: "white",
        borderBottom: "1px solid #E8E0D4",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1px",
          textDecoration: "none",
        }}
      >
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "22px",
            fontWeight: 600,
            color: "#141414",
            letterSpacing: "-0.5px",
          }}
        >
          ol
        </span>
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "22px",
            fontWeight: 600,
            color: "#9C8E82",
            letterSpacing: "-0.5px",
          }}
        >
          a
        </span>
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "22px",
            fontWeight: 600,
            color: "#141414",
            letterSpacing: "-0.5px",
          }}
        >
          de
        </span>
      </Link>

      {/* Right Side */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* Notifications */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={handleBellClick}
            style={{
              position: "relative",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              color: "#5A5248",
              transition: "color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = "#141414")}
            onMouseOut={(e) => (e.currentTarget.style.color = "#5A5248")}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "4px",
                  right: "4px",
                  minWidth: "16px",
                  height: "16px",
                  background: "#DC2626",
                  borderRadius: "8px",
                  border: "2px solid white",
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div
              style={{
                position: "absolute",
                top: "44px",
                right: 0,
                width: "320px",
                background: "white",
                border: "1px solid #E8E0D4",
                borderRadius: "8px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                zIndex: 1000,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #E8E0D4",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#141414" }}>
                  Notifications
                </span>
              </div>

              <div style={{ maxHeight: "320px", overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center" }}>
                    <p style={{ fontSize: "13px", color: "#5A5248" }}>
                      No notifications yet.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #F5F1E8",
                        background: n.read ? "transparent" : "#FAFAF8",
                      }}
                    >
                      <p style={{ fontSize: "13px", color: "#141414", marginBottom: "4px" }}>
                        {n.message}
                      </p>
                      <span style={{ fontSize: "11px", color: "#9C9088" }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <UserMenu />
      </div>
    </header>
  );
}
