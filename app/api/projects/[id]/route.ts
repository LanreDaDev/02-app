import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Every child table is ON DELETE CASCADE from projects, so one delete is
    // enough — image_jobs, clip_jobs, reframes, photos, videos and notifications
    // all go with it.
    await supabase.from("projects").delete().eq("id", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
