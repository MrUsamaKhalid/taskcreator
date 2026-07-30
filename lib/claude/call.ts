import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { anthropic } from "@/lib/anthropic";
import type { Endpoint } from "@/lib/config";
import { costOf, type TokenUsage } from "@/lib/pricing";

import type { ContentBlock } from "./context";
import { shapeRequest, type OutputFormat } from "./request";

export type CallResult<T> = {
  data: T;
  usage: TokenUsage;
  costUsd: number;
  model: string;
};

/** A refusal is a successful HTTP response, so it needs its own error type. */
export class RefusalError extends Error {
  constructor(
    message: string,
    readonly category?: string | null,
  ) {
    super(message);
    this.name = "RefusalError";
  }
}

export class MalformedOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "MalformedOutputError";
  }
}

/** Narrow the SDK's content-block union to the text blocks. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("");
}

/**
 * One structured, non-streaming call.
 *
 * Three failure modes are handled explicitly because each is easy to mistake for
 * success:
 *
 * 1. `stop_reason: "refusal"` arrives as HTTP 200 with empty or partial content.
 *    Reading `content[0]` first would throw on an object that looks fine.
 * 2. `stop_reason: "max_tokens"` yields valid-looking but truncated JSON, which
 *    then fails schema validation with a confusing parse error rather than the
 *    real cause.
 * 3. The model can return text that parses as JSON but does not match the schema,
 *    so the Zod result is checked rather than cast.
 */
export async function callStructured<S extends z.ZodType>({
  endpoint,
  blocks,
  instruction,
  schema,
}: {
  endpoint: Endpoint;
  blocks: ContentBlock[];
  instruction: string;
  schema: S;
}): Promise<CallResult<z.infer<S>>> {
  const format = zodOutputFormat(schema) as unknown as OutputFormat;
  const request = shapeRequest({ endpoint, blocks, instruction, format });

  // Cast at the boundary: `request` is shaped by this app's own rules (which the
  // unit tests assert) and is structurally the SDK's parameter object.
  const response = await anthropic().beta.messages.create(
    request as unknown as Parameters<
      ReturnType<typeof anthropic>["beta"]["messages"]["create"]
    >[0],
  );

  const message = response as unknown as {
    stop_reason?: string | null;
    stop_details?: { category?: string | null; explanation?: string | null } | null;
    content?: unknown;
    usage?: TokenUsage | null;
    model?: string;
  };

  if (message.stop_reason === "refusal") {
    throw new RefusalError(
      message.stop_details?.explanation ??
        "Claude declined this request. Rewording the brief usually clears it.",
      message.stop_details?.category ?? null,
    );
  }

  const raw = textOf(message.content);

  if (message.stop_reason === "max_tokens") {
    throw new MalformedOutputError(
      "The response hit the output limit before finishing, so the result is incomplete. Try a shorter brief or fewer checklist items.",
      raw,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new MalformedOutputError(
      "Claude returned something that was not valid JSON.",
      raw,
    );
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new MalformedOutputError(
      `The response did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
      raw,
    );
  }

  const usage = message.usage ?? {};
  const model = message.model ?? request.model;

  return {
    data: parsed.data as z.infer<S>,
    usage,
    // Price against the model that actually served it, not the one requested — a
    // refusal fallback can change it mid-call.
    costUsd: costOf(
      (model as Parameters<typeof costOf>[0]) ?? request.model,
      usage,
    ),
    model,
  };
}
