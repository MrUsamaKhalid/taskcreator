import { notFound } from "next/navigation";

import { EMPTY_BRIEF, type Brief } from "@/lib/brief";
import type { Review } from "@/lib/claude/schemas";
import { ReviewSchema } from "@/lib/claude/schemas";
import { totalCost, type TokenUsage } from "@/lib/pricing";
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

/**
 * Validate the stored review rather than casting it.
 *
 * The payload column is jsonb written by whatever schema was current when the
 * review ran. Casting an older shape into the pane renders `undefined.map` as a
 * blank screen; parsing it means an incompatible row simply doesn't show, and
 * re-running fixes it.
 */
function toReview(value: unknown): Review | null {
  const parsed = ReviewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Sum what the stored calls cost.
 *
 * `model` is whatever actually served the call, which a refusal fallback can
 * make something outside our rate table; pricing tolerates that by charging the
 * highest known rate rather than dropping the row.
 */
function spendOf(rows: Array<{ model: string; usage: unknown }> | null): number {
  if (!rows) return 0;
  return totalCost(
    rows.map((row) => ({ model: row.model, usage: row.usage as TokenUsage })),
  );
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
        .select("id, brief, draft_prompt, dismissed_chips, compiled_prompt, compile_mode")
        .eq("id", prompt.current_version_id)
        .maybeSingle()
    : await supabase
        .from("prompt_versions")
        .select("id, brief, draft_prompt, dismissed_chips, compiled_prompt, compile_mode")
        .eq("prompt_id", prompt.id)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!version) notFound();

  const [
    { data: attachments },
    { data: reviews },
    { data: checklist },
    { data: testRuns },
  ] = await Promise.all([
    supabase
      .from("attachments")
      .select("id, filename, mime, size_bytes, role, extraction_status")
      .eq("prompt_version_id", version.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("reviews")
      .select("payload, usage, model, created_at")
      .eq("prompt_version_id", version.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("checklist_items")
      .select("id, text, category, source, ordinal")
      .eq("prompt_version_id", version.id)
      .order("ordinal", { ascending: true }),
    supabase
      .from("test_runs")
      .select("usage, model")
      .eq("prompt_version_id", version.id),
  ]);

  const latestReview = reviews?.[0] ?? null;

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
      initialReview={latestReview ? toReview(latestReview.payload) : null}
      initialReviewedAt={latestReview?.created_at ?? null}
      initialChecklist={checklist ?? []}
      initialCompiledPrompt={version.compiled_prompt ?? ""}
      initialCompileMode={version.compile_mode ?? "structured"}
      persistedSpendUsd={spendOf(reviews) + spendOf(testRuns)}
    />
  );
}
