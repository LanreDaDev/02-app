import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Users who generated at least 1 clip
  const { count: generatedUsers } = await supabase
    .from("token_transactions")
    .select("user_id", { count: "exact", head: true })
    .in("reason", ["generation", "regeneration"]);

  // Users who purchased tokens (non-grant spend)
  const { count: purchasedUsers } = await supabase
    .from("token_transactions")
    .select("user_id", { count: "exact", head: true })
    .eq("reason", "purchase");

  // Total users
  const { count: totalUsers } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });

  // Conversion: users who purchased AND then generated after that purchase
  const { data: convertedRows } = await supabase
    .from("token_transactions")
    .select("user_id, reason, created_at")
    .in("reason", ["purchase", "generation", "regeneration"])
    .order("created_at", { ascending: true });

  const converted = new Set<string>();
  if (convertedRows) {
    const purchaseDates: Record<string, string> = {};
    for (const tx of convertedRows) {
      if (tx.reason === "purchase") {
        purchaseDates[tx.user_id] = tx.created_at;
      } else if (purchaseDates[tx.user_id] && tx.created_at > purchaseDates[tx.user_id]) {
        converted.add(tx.user_id);
      }
    }
  }

  return NextResponse.json({
    total_users: totalUsers || 0,
    users_generated: generatedUsers || 0,
    users_purchased: purchasedUsers || 0,
    users_converted: converted.size,
    conversion_rate:
      generatedUsers && generatedUsers > 0
        ? ((converted.size) / generatedUsers * 100).toFixed(1) + "%"
        : "0%",
  });
}
