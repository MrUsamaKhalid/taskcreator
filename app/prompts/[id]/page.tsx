import { notFound } from "next/navigation";

import { EMPTY_BRIEF, type Brief } from "@/lib/brief";
import { createClient } from "@/lib/supabase/server";

import { Workspace } from "./workspace";

/** Narrow the jsonb brief column into the typed shape, filling any gaps. */
function toBrief(value: unknown): Brief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_BRIEF };
  }
  const record = value as Record<string, unknown>;
  const brief = { ...EMPTY_BRIEF };
  for (const key of Object.keys(EMPTY_BRIEF) as (keyof Brief)[]) {
    const raw = record[key];
    if (typeof raw === "string") brief[key] = raw;
  }
  return brief;
}

export default async function PromptPage({
  params,
}: {
  // params is a Promise in Next.js 16 — synchronous access was removed.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: prompt } = await supabase
    .from("prompts")
    .select("id, title, sector, job_title, status, current_version_id")
    .eq("id", id)
    .maybeSingle();

  if (!prompt) notFound();

  // Fall back to the newest version if current_version_id ever goes stale.
  const { data: version } = prompt.current_version_id
    ? await supabase
        .from("prompt_versions")
        .select("id, brief, draft_prompt, dismissed_chips")
        .eq("id", prompt.current_version_id)
        .maybeSingle()
    : await supabase
        .from("prompt_versions")
        .select("id, brief, draft_prompt, dismissed_chips")
        .eq("prompt_id", prompt.id)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!version) notFound();

  const { data: attachments } = await supabase
    .from("attachments")
    .select("id, filename, mime, size_bytes, role, extraction_status")
    .eq("prompt_version_id", version.id)
    .order("created_at", { ascending: true });

  return (
    <Workspace
      promptId={prompt.id}
      versionId={version.id}
      initialTitle={prompt.title}
      initialSector={prompt.sector ?? ""}
      initialJobTitle={prompt.job_title ?? ""}
      initialBrief={toBrief(version.brief)}
      initialDraftPrompt={version.draft_prompt}
      initialDismissedChips={version.dismissed_chips ?? []}
      initialAttachments={attachments ?? []}
    />
  );
}
