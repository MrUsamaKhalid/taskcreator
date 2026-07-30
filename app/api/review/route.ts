import { NextResponse, type NextRequest } from "next/server";

import { callStructured } from "@/lib/claude/call";
import {
  contextFor,
  errorResponse,
  isResponse,
  loadVersion,
  missingKeyResponse,
} from "@/lib/claude/load";
import { REVIEW_INSTRUCTION } from "@/lib/claude/prompts";
import { ReviewSchema } from "@/lib/claude/schemas";
import type { Json } from "@/lib/database.types";

/**
 * Opus 5 at high effort on a brief with attachments. Well inside 60s in
 * practice, but 60 is also the Vercel Hobby ceiling — the plan, not this route,
 * is what caps it. Pro allows 300.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = await request.json().catch(() => null);
  const versionId = (body as { versionId?: unknown } | null)?.versionId;
  if (typeof versionId !== "string") {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  const loaded = await loadVersion(versionId);
  if (isResponse(loaded)) return loaded;

  try {
    const result = await callStructured({
      endpoint: "review",
      blocks: contextFor(loaded),
      instruction: REVIEW_INSTRUCTION,
      schema: ReviewSchema,
    });

    // The three section ratings are denormalised onto their own columns so the
    // prompt list can show them without parsing the payload on every row.
    const { data: saved, error } = await loaded.supabase
      .from("reviews")
      .insert({
        prompt_version_id: loaded.versionId,
        user_id: loaded.userId,
        model: result.model,
        payload: result.data as unknown as Json,
        usage: result.usage as unknown as Json,
        brief_rating: result.data.brief.rating,
        prompt_rating: result.data.prompt.rating,
        files_rating: result.data.attachments.rating,
      })
      .select("id, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A review is the first thing that moves a prompt off "draft". Left at
    // best effort: failing the whole request over a status label would throw
    // away a review that has already been paid for.
    await loaded.supabase
      .from("prompts")
      .update({ status: "reviewed" })
      .eq("id", loaded.promptId)
      .eq("status", "draft");

    return NextResponse.json({
      id: saved.id,
      createdAt: saved.created_at,
      review: result.data,
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
