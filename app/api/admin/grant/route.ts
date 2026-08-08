import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { grantTokens } from "@/lib/tokens";

export async function POST(request: Request) {
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

  const body = await request.json();
  const { user_id, amount, reason } = body;

  if (!user_id || !amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "user_id and a positive amount are required" },
      { status: 400 }
    );
  }

  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", user_id)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  await grantTokens(user_id, amount, user.id);

  return NextResponse.json({
    granted: amount,
    to: user_id,
    by: user.id,
    note: reason || null,
  });
}
