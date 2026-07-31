import { NextResponse, type NextRequest } from "next/server";

import { callTestRun } from "@/lib/claude/call";
import { buildTestRunBlocks } from "@/lib/claude/context";
import { isResponse, loadVersion, missingKeyResponse } from "@/lib/claude/load";
import { ndjsonStream } from "@/lib/claude/ndjson";
import { ENDPOINT_EFFORT } from "@/lib/config";
import type { Json } from "@/lib/database.types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown;
  } | null;

  if (typeof body?.versionId !== "string") {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  const loaded = await loadVersion(body.versionId);
  if (isResponse(loaded)) return loaded;

  if (loaded.compiledPrompt.trim().length === 0) {
    return NextResponse.json(
      { error: "Compile the prompt first — there is nothing to run yet." },
      { status: 409 },
    );
  }

  return ndjsonStream(async (emit) => {
    const result = await callTestRun({
      // Every attachment, including the excluded ones. The compiled prompt is
      // what has to say "don't use that file"; withholding it would make the
      // exclusion pass without being tested. See buildTestRunBlocks.
      blocks: buildTestRunBlocks({
        attachments: loaded.attachments,
        compiledPrompt: loaded.compiledPrompt,
      }),
      onText: (text) => emit({ type: "delta", text }),
    });

    const { data: run, error } = await loaded.supabase
      .from("test_runs")
      .insert({
        prompt_version_id: loaded.versionId,
        user_id: loaded.userId,
        model: result.model,
        effort: ENDPOINT_EFFORT.testRun,
        output_text: result.data,
        usage: result.usage as unknown as Json,
      })
      .select("id, created_at")
      .single();

    emit({
      type: "done",
      // The id is what the grade step keys off; without it the run happened but
      // cannot be scored, which the client needs to be able to say.
      testRunId: run?.id ?? null,
      createdAt: run?.created_at ?? null,
      output: result.data,
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
      saveError: error?.message ?? null,
    });
  });
}
