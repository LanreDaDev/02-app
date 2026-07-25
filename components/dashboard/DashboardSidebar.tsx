"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Video,
  CreditCard,
  Settings,
  BarChart3,
  MessageSquare,
  Bell,
} from "lucide-react";

export default function DashboardSidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + "/");

  const navItems = [
    { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
    { icon: ShoppingBag, label: "Orders", href: "/dashboard/orders" },
    { icon: Video, label: "Videos", href: "/dashboard/videos" },
    { icon: CreditCard, label: "Billing", href: "/dashboard/billing" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: MessageSquare, label: "Support", href: "/dashboard/support" },
    { icon: Bell, label: "Notifications", href: "/dashboard/notifications" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
  ];

  return (
    <aside
      style={{
        width: "260px",
        background: "white",
        borderRight: "1px solid #E8E0D4",
        display: "flex",
        flexDirection: "column",
        padding: "32px 0"
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1px",
          textDecoration: "none",
          padding: "0 24px",
          marginBottom: "48px"
        }}
      >
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 600,
          color: "#141414",
          letterSpacing: "-0.5px"
        }}>
          ol
        </span>
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 600,
          color: "#9C8E82",
          letterSpacing: "-0.5px"
        }}>
          a
        </span>
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "22px",
          fontWeight: 600,
          color: "#141414",
          letterSpacing: "-0.5px"
        }}>
          de
        </span>
      </Link>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 24px",
                textDecoration: "none",
                color: active ? "#141414" : "#5A5248",
                background: active ? "#F8F6F2" : "transparent",
                borderLeft: active ? "3px solid #9C8E82" : "3px solid transparent",
                transition: "all 0.2s",
                fontSize: "14px",
                fontWeight: active ? 500 : 400,
                marginBottom: "4px"
              }}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "0 24px",
        borderTop: "1px solid #E8E0D4",
        paddingTop: "24px"
      }}>
        <div style={{
          background: "#F8F6F2",
          padding: "16px",
          borderRadius: "4px"
        }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9C9088",
            marginBottom: "8px"
          }}>
            Credits
          </div>
          <div style={{
            fontSize: "28px",
            fontWeight: 600,
            color: "#141414",
            fontFamily: "'Playfair Display', serif",
            marginBottom: "4px"
          }}>
            0
          </div>
          <Link
            href="/dashboard/billing"
            style={{
              fontSize: "12px",
              color: "#9C8E82",
              textDecoration: "underline",
              cursor: "pointer"
            }}
          >
            Buy credits
          </Link>
        </div>
      </div>
    </aside>
  );
}
