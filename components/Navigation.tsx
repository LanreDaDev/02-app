"use client";

import Link from "next/link";

export default function Navigation() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(248,246,242,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #E5E0D8",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 32px",
          height: "72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "1px", textDecoration: "none" }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 600, color: "#141414", letterSpacing: "-0.5px" }}>ol</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 600, color: "#9C8E82", letterSpacing: "-0.5px" }}>a</span>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "22px", fontWeight: 600, color: "#141414", letterSpacing: "-0.5px" }}>de</span>
        </Link>
      </div>
    </nav>
  );
}
