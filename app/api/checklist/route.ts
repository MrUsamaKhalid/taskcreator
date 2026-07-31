import { NextResponse, type NextRequest } from "next/server";

import { callStructured } from "@/lib/claude/call";
import {
  contextFor,
  errorResponse,
  isResponse,
  loadVersion,
  missingKeyResponse,
} from "@/lib/claude/load";
import { CHECKLIST_INSTRUCTION } from "@/lib/claude/prompts";
import { ChecklistSchema } from "@/lib/claude/schemas";
import { CHECKLIST_TARGETS, DEFAULT_CHECKLIST_TARGET } from "@/lib/config";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown;
    target?: unknown;
  } | null;

  if (typeof body?.versionId !== "string") {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  // Clamp to the offered sizes rather than trusting the caller: the number lands
  // in the prompt text, and an arbitrary one is a way to ask for a 5,000-item
  // checklist on someone else's key.
  const target = CHECKLIST_TARGETS.includes(
    body.target as (typeof CHECKLIST_TARGETS)[number],
  )
    ? (body.target as number)
    : DEFAULT_CHECKLIST_TARGET;

  const loaded = await loadVersion(body.versionId);
  if (isResponse(loaded)) return loaded;

  try {
    const result = await callStructured({
      endpoint: "checklist",
      blocks: contextFor(loaded),
      instruction: CHECKLIST_INSTRUCTION(target),
      schema: ChecklistSchema,
    });

    // Replace the generated items, keep the hand-written ones. Regenerating is
    // how you react to an edited brief, and losing your own additions every time
    // you did that would make the manual ones not worth writing.
    const { error: clearError } = await loaded.supabase
      .from("checklist_items")
      .delete()
      .eq("prompt_version_id", loaded.versionId)
      .eq("source", "ai");

    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }

    const { data: existing } = await loaded.supabase
      .from("checklist_items")
      .select("ordinal")
      .eq("prompt_version_id", loaded.versionId)
      .order("ordinal", { ascending: false })
      .limit(1);

    const startAt = (existing?.[0]?.ordinal ?? -1) + 1;

    const { data: items, error: insertError } = await loaded.supabase
      .from("checklist_items")
      .insert(
        result.data.items.map((item, index) => ({
          prompt_version_id: loaded.versionId,
          user_id: loaded.userId,
          category: item.category,
          text: item.text,
          source: "ai" as const,
          ordinal: startAt + index,
        })),
      )
      .select("id, category, text, source, ordinal")
      .order("ordinal", { ascending: true });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      items: items ?? [],
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
