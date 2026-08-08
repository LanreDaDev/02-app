"use client";

import { useEffect, useState } from "react";
import type { TokenTransaction } from "@/lib/types/database";
import { Coins, Plus, Loader2 } from "lucide-react";

// All prices are USD.
const PACKS = [
  {
    tokens: 800,
    price: "$10",
    description: "Two clips — enough to see it work",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || "price_starter",
  },
  {
    tokens: 8000,
    price: "$80",
    description: "~1 typical video",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STANDARD || "price_standard",
  },
];

export default function TokensPage() {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/tokens/balance");
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setTransactions(data.transactions);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handlePurchase(priceId: string) {
    setPurchasing(priceId);
    try {
      const res = await fetch("/api/tokens/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      }
    } catch {
      // Stripe redirect failed
    } finally {
      setPurchasing(null);
    }
  }

  const reasonLabel = (reason: string) => {
    switch (reason) {
      case "signup_grant": return "Signup Grant";
      case "generation": return "Clip Generation";
      case "regeneration": return "Regeneration";
      case "purchase": return "Purchase";
      case "admin_grant": return "Admin Grant";
      default: return reason;
    }
  };

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
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "28px", fontWeight: 400, color: "#141414", marginBottom: "28px" }}>
        Tokens
      </h1>

      {/* Balance card */}
      <div style={{ background: "#141414", color: "#FFFFFF", borderRadius: "12px", padding: "28px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
        <Coins size={28} style={{ color: "#B8985D" }} />
        <div>
          <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.6, marginBottom: "4px" }}>
            Current Balance
          </div>
          <div style={{ fontSize: "32px", fontWeight: 600, fontFamily: "'Playfair Display', serif" }}>
            {balance.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Purchase packs */}
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#141414", marginBottom: "12px" }}>
        Buy Tokens
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "36px" }}>
        {PACKS.map((pack) => (
          <button
            key={pack.priceId}
            onClick={() => handlePurchase(pack.priceId)}
            disabled={purchasing !== null}
            style={{
              background: "white",
              border: "1px solid #E8E0D4",
              borderRadius: "10px",
              padding: "20px",
              textAlign: "center",
              cursor: purchasing ? "not-allowed" : "pointer",
              transition: "border-color 0.2s",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: 600, color: "#141414", marginBottom: "4px" }}>
              {pack.tokens.toLocaleString()}
            </div>
            <div style={{ fontSize: "12px", color: "#5A5248", marginBottom: "12px" }}>tokens</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#4F46E5" }}>{pack.price}</div>
            <div style={{ fontSize: "11px", color: "#5A5248", marginTop: "6px" }}>{pack.description}</div>
            {purchasing === pack.priceId && (
              <Loader2 size={14} style={{ color: "#4F46E5", animation: "spin 1s linear infinite", marginTop: "8px" }} />
            )}
          </button>
        ))}
      </div>

      {/* Transaction history */}
      <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#141414", marginBottom: "12px" }}>
        Recent Activity
      </h2>
      {transactions.length === 0 ? (
        <p style={{ color: "#5A5248", fontSize: "14px" }}>No transactions yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {transactions.map((tx) => (
            <div
              key={tx.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                background: "white",
                border: "1px solid #E8E0D4",
                borderRadius: "6px",
              }}
            >
              <div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#141414" }}>
                  {reasonLabel(tx.reason)}
                </div>
                <div style={{ fontSize: "11px", color: "#5A5248" }}>
                  {new Date(tx.created_at).toLocaleDateString()}
                </div>
              </div>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: tx.delta_tokens > 0 ? "#059669" : "#DC2626",
                }}
              >
                {tx.delta_tokens > 0 ? "+" : ""}
                {tx.delta_tokens.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
