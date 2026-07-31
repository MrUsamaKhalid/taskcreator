import { NextResponse, type NextRequest } from "next/server";

import { callStructured } from "@/lib/claude/call";
import {
  contextFor,
  errorResponse,
  isResponse,
  loadVersion,
  missingKeyResponse,
} from "@/lib/claude/load";
import { GRADE_INSTRUCTION, gradePayload } from "@/lib/claude/prompts";
import { GradeSchema } from "@/lib/claude/schemas";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = (await request.json().catch(() => null)) as {
    testRunId?: unknown;
  } | null;

  if (typeof body?.testRunId !== "string") {
    return NextResponse.json({ error: "testRunId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: testRun } = await supabase
    .from("test_runs")
    .select("id, prompt_version_id, output_text")
    .eq("id", body.testRunId)
    .maybeSingle();

  if (!testRun) {
    return NextResponse.json({ error: "Unknown test run" }, { status: 404 });
  }
  if (!testRun.output_text) {
    return NextResponse.json(
      { error: "That test run produced no output to grade." },
      { status: 409 },
    );
  }

  const loaded = await loadVersion(testRun.prompt_version_id);
  if (isResponse(loaded)) return loaded;

  const { data: items } = await loaded.supabase
    .from("checklist_items")
    .select("id, text, category")
    .eq("prompt_version_id", testRun.prompt_version_id)
    .order("ordinal", { ascending: true });

  if (!items || items.length === 0) {
    return NextResponse.json(
      { error: "There is no checklist to grade against yet." },
      { status: 409 },
    );
  }

  try {
    const result = await callStructured({
      endpoint: "grade",
      blocks: contextFor(loaded),
      instruction:
        GRADE_INSTRUCTION +
        gradePayload({ items, output: testRun.output_text }),
      schema: GradeSchema,
    });

    // Keyed by position, because models echo small integers back reliably and
    // UUIDs not at all. First verdict per index wins — a duplicated index is the
    // model repeating itself, not a second opinion.
    const verdicts = new Map<number, { passed: boolean; evidence: string }>();
    for (const entry of result.data.results) {
      if (entry.index >= 0 && entry.index < items.length && !verdicts.has(entry.index)) {
        verdicts.set(entry.index, {
          passed: entry.passed,
          evidence: entry.evidence,
        });
      }
    }

    // A row per checklist item, not per verdict. An item the model skipped
    // counts as unmet: scoring only the items it chose to judge would let a
    // truncated response report a flattering percentage.
    const rows = items.map((item, index) => {
      const verdict = verdicts.get(index);
      return {
        test_run_id: testRun.id,
        user_id: loaded.userId,
        checklist_item_id: item.id,
        item_text: item.text,
        passed: verdict?.passed ?? false,
        evidence:
          verdict?.evidence ??
          "Not judged — the model returned no verdict for this item.",
      };
    });

    const passed = rows.filter((row) => row.passed).length;
    const scorePct = Math.round((passed / rows.length) * 100);

    // Replace rather than append, so re-grading the same run doesn't stack.
    await loaded.supabase
      .from("test_run_results")
      .delete()
      .eq("test_run_id", testRun.id);

    const { error: insertError } = await loaded.supabase
      .from("test_run_results")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await loaded.supabase
      .from("test_runs")
      .update({ score_pct: scorePct })
      .eq("id", testRun.id);

    await loaded.supabase
      .from("prompts")
      .update({ status: "tested" })
      .eq("id", loaded.promptId);

    return NextResponse.json({
      testRunId: testRun.id,
      scorePct,
      passed,
      total: rows.length,
      ungraded: rows.length - verdicts.size,
      results: rows.map((row, index) => ({
        checklistItemId: row.checklist_item_id,
        category: items[index].category,
        itemText: row.item_text,
        passed: row.passed,
        evidence: row.evidence,
      })),
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
