import { NextResponse, type NextRequest } from "next/server";

import { callStructured } from "@/lib/claude/call";
import {
  contextFor,
  errorResponse,
  isResponse,
  loadVersion,
  missingKeyResponse,
} from "@/lib/claude/load";
import {
  REVIEW_SECTIONS,
  REVIEW_SECTION_INSTRUCTION,
  type ReviewSection,
} from "@/lib/claude/prompts";
import { SectionSchema, type Review } from "@/lib/claude/schemas";
import type { Json } from "@/lib/database.types";

/**
 * One section per request.
 *
 * The whole review is about 4,000 output tokens, and generation alone runs at
 * roughly 50-80 tokens a second, so a single call spent the entire 60s budget
 * writing and was cut off before it finished — on every real brief, whichever
 * model served it. A third of the output comfortably fits.
 *
 * 60 is the platform ceiling on this plan rather than a number chosen here.
 */
export const maxDuration = 60;

function isSection(value: unknown): value is ReviewSection {
  return REVIEW_SECTIONS.includes(value as ReviewSection);
}

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown;
    section?: unknown;
    completed?: unknown;
  } | null;

  const versionId = body?.versionId;
  if (typeof versionId !== "string") {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }
  if (!isSection(body?.section)) {
    return NextResponse.json(
      { error: `section must be one of ${REVIEW_SECTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  const section = body.section;

  const loaded = await loadVersion(versionId);
  if (isResponse(loaded)) return loaded;

  try {
    const result = await callStructured({
      endpoint: "review",
      blocks: contextFor(loaded),
      instruction: REVIEW_SECTION_INSTRUCTION[section],
      schema: SectionSchema,
    });

    // Sections already returned this run, threaded back by the client so the
    // finished review can be written in one row rather than three partial ones.
    const completed = (body.completed ?? {}) as Partial<Review>;
    const merged = { ...completed, [section]: result.data } as Partial<Review>;
    const finished = REVIEW_SECTIONS.every((key) => merged[key]);

    if (!finished) {
      return NextResponse.json({
        section,
        data: result.data,
        review: merged,
        usage: result.usage,
        costUsd: result.costUsd,
        model: result.model,
      });
    }

    const review = merged as Review;

    // The three section ratings are denormalised onto their own columns so the
    // prompt list can show them without parsing the payload on every row.
    const { data: saved, error } = await loaded.supabase
      .from("reviews")
      .insert({
        prompt_version_id: loaded.versionId,
        user_id: loaded.userId,
        model: result.model,
        payload: review as unknown as Json,
        usage: result.usage as unknown as Json,
        brief_rating: review.brief.rating,
        prompt_rating: review.prompt.rating,
        files_rating: review.attachments.rating,
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
      section,
      data: result.data,
      review,
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
