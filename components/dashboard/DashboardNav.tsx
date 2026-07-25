"use client";

import { Bell, Search } from "lucide-react";
import UserMenu from "@/components/auth/UserMenu";

export default function DashboardNav() {
  return (
    <header
      style={{
        height: "72px",
        background: "white",
        borderBottom: "1px solid #E8E0D4",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        gap: "24px"
      }}
    >
      {/* Search */}
      <div style={{
        flex: 1,
        maxWidth: "500px",
        position: "relative"
      }}>
        <Search
          size={18}
          style={{
            position: "absolute",
            left: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9C9088"
          }}
        />
        <input
          type="text"
          placeholder="Search orders, videos..."
          style={{
            width: "100%",
            padding: "12px 16px 12px 44px",
            border: "1px solid #E8E0D4",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "'Outfit', sans-serif",
            outline: "none",
            transition: "border-color 0.2s",
            background: "#F8F6F2"
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "#9C8E82"}
          onBlur={(e) => e.currentTarget.style.borderColor = "#E8E0D4"}
        />
      </div>

      {/* Right Side */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "20px"
      }}>
        {/* Notifications */}
        <button
          style={{
            position: "relative",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "8px",
            color: "#5A5248",
            transition: "color 0.2s"
          }}
          onMouseOver={(e) => e.currentTarget.style.color = "#141414"}
          onMouseOut={(e) => e.currentTarget.style.color = "#5A5248"}
        >
          <Bell size={20} />
          {/* Notification Badge */}
          <span style={{
            position: "absolute",
            top: "6px",
            right: "6px",
            width: "8px",
            height: "8px",
            background: "#9C8E82",
            borderRadius: "50%",
            border: "2px solid white"
          }} />
        </button>

        {/* User Menu */}
        <UserMenu />
      </div>
    </header>
  );
}
