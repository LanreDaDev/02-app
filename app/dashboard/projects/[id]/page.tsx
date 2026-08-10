import { redirect } from "next/navigation";

/**
 * The editor moved to /editor/[id].
 *
 * It needs the whole viewport, and under /dashboard it inherited a layout that
 * centres its children in a 1200px <main> beneath a nav — which boxed the rail,
 * stage and timeline into a column that could not reach full height.
 *
 * Kept as a redirect rather than deleted: this path is in browser histories and
 * in any link an agent has already saved.
 */
export default async function ProjectEditorRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/editor/${id}`);
}
