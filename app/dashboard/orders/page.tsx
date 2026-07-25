"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Order, getOrderStatusLabel, formatPrice } from "@/lib/types/database";
import { Plus, Package } from "lucide-react";
import Link from "next/link";

type OrderStatus = Order['status'];

const statusStyles: Record<OrderStatus, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F6", text: "#6B7280" },
  pending: { bg: "#FEF3C7", text: "#92400E" },
  in_progress: { bg: "#E0F2FE", text: "#075985" },
  revision_requested: { bg: "#FED7AA", text: "#9A3412" },
  completed: { bg: "#D1FAE5", text: "#065F46" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
};

export default function OrdersPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = filter === "all" ? orders : orders.filter(order => order.status === filter);

  const statusCounts = {
    all: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    in_progress: orders.filter(o => o.status === "in_progress").length,
    completed: orders.filter(o => o.status === "completed").length,
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 400, color: "#141414", marginBottom: "8px", lineHeight: 1.2 }}>
            Orders
          </h1>
          <p style={{ fontSize: "15px", color: "#5A5248", lineHeight: 1.6 }}>
            Track your video orders and delivery status
          </p>
        </div>
        <Link
          href="/dashboard/orders/new"
          style={{ background: "#141414", color: "#F8F6F2", padding: "14px 28px", textDecoration: "none", fontSize: "13px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: "10px" }}
          onMouseOver={(e) => { e.currentTarget.style.background = "#2A2A2A"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseOut={(e) => { e.currentTarget.style.background = "#141414"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <Plus size={16} />
          New Order
        </Link>
      </div>

      {/* Filter Tabs */}
      <div style={{ borderBottom: "1px solid #E8E0D4", marginBottom: "32px", display: "flex", gap: "32px" }}>
        {(["all", "pending", "in_progress", "completed"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{
              background: "transparent",
              border: "none",
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: filter === status ? "#141414" : "#9C9088",
              cursor: "pointer",
              borderBottom: filter === status ? "2px solid #9C8E82" : "2px solid transparent",
              marginBottom: "-1px",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {status === "all" ? "All" : getOrderStatusLabel(status)}
            <span style={{ marginLeft: "8px", fontSize: "11px", color: filter === status ? "#9C8E82" : "#C8C0B4" }}>
              ({statusCounts[status as keyof typeof statusCounts] || 0})
            </span>
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ width: "40px", height: "40px", border: "3px solid #E8E0D4", borderTop: "3px solid #9C8E82", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088" }}>
            Loading...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredOrders.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 20px", background: "white", border: "1px dashed #E8E0D4" }}>
          <Package size={56} style={{ color: "#E8E0D4", margin: "0 auto 24px", strokeWidth: 1 }} />
          <h3 style={{ fontSize: "20px", fontWeight: 500, color: "#141414", marginBottom: "12px", letterSpacing: "-0.01em" }}>
            {filter === "all" ? "No orders yet" : `No ${filter.replace('_', ' ')} orders`}
          </h3>
          <p style={{ fontSize: "14px", color: "#7A736A", marginBottom: "28px", lineHeight: 1.6 }}>
            {filter === "all" ? "Create your first video order to get started" : `You don't have any ${filter.replace('_', ' ')} orders`}
          </p>
          {filter === "all" && (
            <Link
              href="/dashboard/orders/new"
              style={{ background: "#141414", color: "#F8F6F2", padding: "14px 28px", textDecoration: "none", fontSize: "13px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: "10px" }}
              onMouseOver={(e) => e.currentTarget.style.background = "#2A2A2A"}
              onMouseOut={(e) => e.currentTarget.style.background = "#141414"}
            >
              <Plus size={16} />
              Create Order
            </Link>
          )}
        </div>
      )}

      {/* Orders List */}
      {!loading && filteredOrders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {filteredOrders.map((order) => {
            const colors = statusStyles[order.status];
            const displayAddress = order.property_address || "From MLS Listing";

            return (
              <Link
                key={order.id}
                href={`/dashboard/orders/${order.id}`}
                style={{ display: "block", background: "white", border: "1px solid #E8E0D4", padding: "32px", textDecoration: "none", transition: "all 0.2s" }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "#9C8E82"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "#E8E0D4"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <div>
                    <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: 400, color: "#141414", marginBottom: "8px", lineHeight: 1.2 }}>
                      {displayAddress}
                    </h3>
                    <p style={{ fontSize: "12px", color: "#9C9088", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Order #{order.id.slice(0, 8)}
                    </p>
                  </div>
                  <span style={{ display: "inline-block", padding: "6px 14px", background: colors.bg, color: colors.text, fontSize: "11px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>

                {/* Details Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "24px", paddingTop: "20px", borderTop: "1px solid #E8E0D4" }}>
                  {order.mls_link && (
                    <div>
                      <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088", marginBottom: "6px" }}>
                        MLS Link
                      </p>
                      <p style={{ fontSize: "13px", color: "#5A5248", wordBreak: "break-all" }}>
                        {new URL(order.mls_link).hostname}
                      </p>
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088", marginBottom: "6px" }}>
                      Price
                    </p>
                    <p style={{ fontSize: "13px", color: "#141414", fontWeight: 500 }}>
                      {formatPrice(order.price_cents)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088", marginBottom: "6px" }}>
                      Created
                    </p>
                    <p style={{ fontSize: "13px", color: "#141414", fontWeight: 500 }}>
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {order.completed_at && (
                    <div>
                      <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088", marginBottom: "6px" }}>
                        Completed
                      </p>
                      <p style={{ fontSize: "13px", color: "#141414", fontWeight: 500 }}>
                        {new Date(order.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>

                {/* Instructions Preview */}
                {(order.video_instructions || order.special_instructions) && (
                  <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #E8E0D4" }}>
                    <p style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9C9088", marginBottom: "8px" }}>
                      Instructions
                    </p>
                    <p style={{ fontSize: "13px", color: "#5A5248", lineHeight: 1.6, fontStyle: "italic" }}>
                      "{(order.video_instructions || order.special_instructions)?.substring(0, 150)}
                      {((order.video_instructions || order.special_instructions)?.length || 0) > 150 ? "..." : ""}"
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
