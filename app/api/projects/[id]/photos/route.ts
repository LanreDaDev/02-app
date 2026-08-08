import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDownloadPresignedUrl } from "@/lib/aws/s3";

export async function GET(
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

    const { data: photos } = await supabase
      .from("photos")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (!photos) {
      return NextResponse.json([]);
    }

    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        s3_url: await getDownloadPresignedUrl(photo.s3_key, 3600),
      }))
    );

    return NextResponse.json(photosWithUrls);
  } catch (error) {
    console.error("Photos fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load photos" },
      { status: 500 }
    );
  }
}
