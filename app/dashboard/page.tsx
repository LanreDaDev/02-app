"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { ShoppingBag, Video, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { profile } = useAuth();

  const stats = [
    { icon: ShoppingBag, label: "Total Orders", value: "0", color: "#9C8E82" },
    { icon: Video, label: "Videos Delivered", value: "0", color: "#6B5E4E" },
    { icon: Clock, label: "Pending Orders", value: "0", color: "#B8A888" },
    { icon: TrendingUp, label: "Credits Available", value: "0", color: "#8A7E72" },
  ];

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Welcome Header */}
      <div style={{ marginBottom: "40px" }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(32px, 4vw, 48px)",
          fontWeight: 400,
          color: "#141414",
          marginBottom: "8px",
          lineHeight: 1.2
        }}>
          Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p style={{
          fontSize: "15px",
          color: "#5A5248",
          lineHeight: 1.6
        }}>
          Here&apos;s what&apos;s happening with your property videos today.
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "20px",
        marginBottom: "48px"
      }}>
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              style={{
                background: "white",
                padding: "28px",
                border: "1px solid #E8E0D4",
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = stat.color;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "#E8E0D4";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px"
              }}>
                <span style={{
                  fontSize: "12px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#7A736A"
                }}>
                  {stat.label}
                </span>
                <Icon size={20} style={{ color: stat.color, opacity: 0.6 }} />
              </div>
              <div style={{
                fontSize: "36px",
                fontWeight: 600,
                fontFamily: "'Playfair Display', serif",
                color: "#141414"
              }}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: "48px" }}>
        <h2 style={{
          fontSize: "20px",
          fontWeight: 500,
          color: "#141414",
          marginBottom: "24px",
          letterSpacing: "-0.01em"
        }}>
          Quick Actions
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px"
        }}>
          <Link
            href="/dashboard/orders/new"
            style={{
              background: "#141414",
              color: "#F8F6F2",
              padding: "32px",
              textDecoration: "none",
              transition: "all 0.2s",
              display: "block"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#2A2A2A";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#141414";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{
              fontSize: "18px",
              fontWeight: 500,
              marginBottom: "8px"
            }}>
              Order New Video
            </div>
            <div style={{
              fontSize: "13px",
              color: "#C8C0B4",
              lineHeight: 1.5
            }}>
              Create a new property video from your listing photos
            </div>
          </Link>

          <Link
            href="/dashboard/videos"
            style={{
              background: "white",
              border: "1px solid #E8E0D4",
              color: "#141414",
              padding: "32px",
              textDecoration: "none",
              transition: "all 0.2s",
              display: "block"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#9C8E82";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#E8E0D4";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{
              fontSize: "18px",
              fontWeight: 500,
              marginBottom: "8px"
            }}>
              View Videos
            </div>
            <div style={{
              fontSize: "13px",
              color: "#7A736A",
              lineHeight: 1.5
            }}>
              Access your completed videos and download files
            </div>
          </Link>

          <Link
            href="/dashboard/billing"
            style={{
              background: "white",
              border: "1px solid #E8E0D4",
              color: "#141414",
              padding: "32px",
              textDecoration: "none",
              transition: "all 0.2s",
              display: "block"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#9C8E82";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#E8E0D4";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div style={{
              fontSize: "18px",
              fontWeight: 500,
              marginBottom: "8px"
            }}>
              Buy Credits
            </div>
            <div style={{
              fontSize: "13px",
              color: "#7A736A",
              lineHeight: 1.5
            }}>
              Purchase video credits or subscribe to Producer Plan
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Orders - Empty State */}
      <div style={{ marginBottom: "48px" }}>
        <h2 style={{
          fontSize: "20px",
          fontWeight: 500,
          color: "#141414",
          marginBottom: "24px",
          letterSpacing: "-0.01em"
        }}>
          Recent Orders
        </h2>
        <div style={{
          background: "white",
          border: "1px solid #E8E0D4",
          padding: "64px 32px",
          textAlign: "center"
        }}>
          <div style={{
            fontSize: "15px",
            color: "#7A736A",
            marginBottom: "20px"
          }}>
            You haven&apos;t placed any orders yet
          </div>
          <Link
            href="/dashboard/orders/new"
            style={{
              display: "inline-block",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "#141414",
              color: "#F8F6F2",
              padding: "14px 28px",
              textDecoration: "none",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#2A2A2A"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#141414"}
          >
            Create Your First Order
          </Link>
        </div>
      </div>
    </div>
  );
}
