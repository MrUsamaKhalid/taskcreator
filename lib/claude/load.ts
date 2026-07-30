import { NextResponse } from "next/server";

import { hasAnthropicKey } from "@/lib/anthropic";
import { EMPTY_BRIEF, type Brief } from "@/lib/brief";
import { createClient } from "@/lib/supabase/server";

import { buildContext, type ContextAttachment } from "./context";
import { MalformedOutputError, RefusalError } from "./call";

/** Narrow the jsonb brief column into the typed shape, filling any gaps. */
export function toBrief(value: unknown): Brief {
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

const ATTACHMENT_COLUMNS =
  "id, filename, mime, role, anthropic_file_id, extracted_text, extraction_status, description";

export type LoadedVersion = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  versionId: string;
  promptId: string;
  brief: Brief;
  draftPrompt: string;
  compiledPrompt: string;
  attachments: Array<ContextAttachment & { id: string }>;
  sector: string | null;
  jobTitle: string | null;
};

/**
 * Everything a model-backed route needs about one prompt version.
 *
 * Row ownership is enforced by RLS, so these reads cannot return another user's
 * data; the explicit auth check exists to turn "no rows" into a 401 the UI can
 * explain rather than a confusing 404.
 */
export async function loadVersion(
  versionId: string,
): Promise<LoadedVersion | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: version } = await supabase
    .from("prompt_versions")
    .select("id, prompt_id, brief, draft_prompt, compiled_prompt")
    .eq("id", versionId)
    .maybeSingle();

  if (!version) {
    return NextResponse.json({ error: "Unknown prompt version" }, { status: 404 });
  }

  const [{ data: prompt }, { data: attachments }] = await Promise.all([
    supabase
      .from("prompts")
      .select("sector, job_title")
      .eq("id", version.prompt_id)
      .maybeSingle(),
    supabase
      .from("attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("prompt_version_id", versionId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    supabase,
    userId: user.id,
    versionId: version.id,
    promptId: version.prompt_id,
    brief: toBrief(version.brief),
    draftPrompt: version.draft_prompt,
    compiledPrompt: version.compiled_prompt ?? "",
    attachments: attachments ?? [],
    sector: prompt?.sector ?? null,
    jobTitle: prompt?.job_title ?? null,
  };
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/** The cached prefix for a brief-reading endpoint. */
export function contextFor(loaded: LoadedVersion) {
  return buildContext({
    brief: loaded.brief,
    attachments: loaded.attachments,
    sector: loaded.sector,
    jobTitle: loaded.jobTitle,
    draftPrompt: loaded.draftPrompt,
  });
}

/** 503 with a plain explanation when the server has no key configured. */
export function missingKeyResponse(): NextResponse | null {
  if (hasAnthropicKey()) return null;
  return NextResponse.json(
    {
      error:
        "This server has no ANTHROPIC_API_KEY configured, so the model-backed steps are unavailable. Everything else still works.",
    },
    { status: 503 },
  );
}

/**
 * Map a thrown error to a status and a message worth showing.
 *
 * Refusals and truncation are user-actionable and get their own codes; anything
 * else is reported as a 500 with the message, because a silent generic failure
 * on a paid call is worse than leaking an SDK error string to the one signed-in
 * user who triggered it.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof RefusalError) {
    return NextResponse.json(
      { error: error.message, category: error.category, kind: "refusal" },
      { status: 422 },
    );
  }
  if (error instanceof MalformedOutputError) {
    return NextResponse.json(
      { error: error.message, kind: "malformed" },
      { status: 502 },
    );
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 500 });
}
