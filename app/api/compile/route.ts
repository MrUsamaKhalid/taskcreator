import { NextResponse, type NextRequest } from "next/server";

import { callText } from "@/lib/claude/call";
import {
  contextFor,
  isResponse,
  loadVersion,
  missingKeyResponse,
} from "@/lib/claude/load";
import { ndjsonStream } from "@/lib/claude/ndjson";
import {
  COMPILE_NATURAL_INSTRUCTION,
  COMPILE_STRUCTURED_INSTRUCTION,
} from "@/lib/claude/prompts";
import type { Database } from "@/lib/database.types";

type CompileMode = Database["public"]["Enums"]["compile_mode"];

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const noKey = missingKeyResponse();
  if (noKey) return noKey;

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown;
    mode?: unknown;
  } | null;

  if (typeof body?.versionId !== "string") {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  const mode: CompileMode = body.mode === "natural" ? "natural" : "structured";

  const loaded = await loadVersion(body.versionId);
  if (isResponse(loaded)) return loaded;

  return ndjsonStream(async (emit) => {
    const result = await callText({
      endpoint: "compile",
      blocks: contextFor(loaded),
      instruction:
        mode === "natural"
          ? COMPILE_NATURAL_INSTRUCTION
          : COMPILE_STRUCTURED_INSTRUCTION,
      onText: (text) => emit({ type: "delta", text }),
    });

    const { error } = await loaded.supabase
      .from("prompt_versions")
      .update({ compiled_prompt: result.data, compile_mode: mode })
      .eq("id", loaded.versionId);

    // Only advance draft/reviewed — never walk "tested" backwards.
    await loaded.supabase
      .from("prompts")
      .update({ status: "ready" })
      .eq("id", loaded.promptId)
      .in("status", ["draft", "reviewed"]);

    emit({
      type: "done",
      mode,
      compiledPrompt: result.data,
      usage: result.usage,
      costUsd: result.costUsd,
      model: result.model,
      // Surfaced rather than thrown: the prompt itself is already streamed and
      // on screen, so the useful thing to say is "it didn't save", not to
      // replace it with an error.
      saveError: error?.message ?? null,
    });
  });
}
