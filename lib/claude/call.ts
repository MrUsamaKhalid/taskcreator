import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { anthropic } from "@/lib/anthropic";
import type { Endpoint, ModelId } from "@/lib/config";
import { costOf, type TokenUsage } from "@/lib/pricing";

import type { ContentBlock } from "./context";
import { shapeRequest, shapeTestRun, type OutputFormat, type ShapedRequest } from "./request";

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

/** The shape of a completed message, narrowed from the SDK's beta union. */
type FinishedMessage = {
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  content?: unknown;
  usage?: TokenUsage | null;
  model?: string;
};

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
 * Send one shaped request and stream it to completion.
 *
 * Every call streams, including the ones whose output the browser never sees
 * incrementally. That is a timeout decision rather than a UX one: max_tokens
 * bounds thinking and answer together, and on Opus 5 thinking is on by default,
 * so the budgets in ENDPOINT_MAX_TOKENS are large enough that a non-streaming
 * request would risk the SDK's HTTP timeout. `onText` is the only difference
 * between the two call styles below.
 */
async function send(
  request: ShapedRequest,
  onText?: (delta: string) => void,
): Promise<{ message: FinishedMessage; text: string }> {
  // Cast at the boundary: `request` is shaped by this app's own rules (which the
  // unit tests assert) and is structurally the SDK's parameter object.
  const stream = anthropic().beta.messages.stream(
    request as unknown as Parameters<
      ReturnType<typeof anthropic>["beta"]["messages"]["stream"]
    >[0],
  );

  let text = "";

  for await (const event of stream) {
    // Only text_delta. Adaptive thinking also emits thinking_delta on this
    // stream, and folding that into the answer would corrupt every JSON parse
    // and leak reasoning into the compiled prompt.
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
      onText?.(event.delta.text);
    }
  }

  const message = (await stream.finalMessage()) as unknown as FinishedMessage;

  // Prefer the assembled message over the accumulated deltas: on a mid-stream
  // refusal fallback the final message is the authoritative content.
  return { message, text: textOf(message.content) || text };
}

/** Throw the right error for a stop_reason that is not a clean finish. */
function assertFinished(message: FinishedMessage, raw: string): void {
  // A refusal arrives as HTTP 200 with empty or partial content. Reading
  // content[0] first would throw on an object that otherwise looks fine.
  if (message.stop_reason === "refusal") {
    throw new RefusalError(
      message.stop_details?.explanation ??
        "Claude declined this request. Rewording the brief usually clears it.",
      message.stop_details?.category ?? null,
    );
  }

  // Truncation yields valid-looking but incomplete output, which otherwise
  // surfaces as a confusing parse error rather than the real cause.
  if (message.stop_reason === "max_tokens") {
    throw new MalformedOutputError(
      "The response hit the output limit before finishing, so the result is incomplete. Try a shorter brief or fewer checklist items.",
      raw,
    );
  }
}

function accountFor(message: FinishedMessage, requested: ModelId) {
  const usage = message.usage ?? {};
  // Price against the model that actually served it, not the one requested — a
  // refusal fallback changes it mid-call, and that model bills at its own rates.
  const model = message.model ?? requested;
  return { usage, model, costUsd: costOf(model, usage) };
}

/**
 * One structured call, validated against a Zod schema.
 *
 * The model can return text that parses as JSON but does not match the schema,
 * so the Zod result is checked rather than cast.
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

  const { message, text } = await send(request);
  assertFinished(message, text);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new MalformedOutputError(
      "Claude returned something that was not valid JSON.",
      text,
    );
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new MalformedOutputError(
      `The response did not match the expected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
      text,
    );
  }

  return {
    data: parsed.data as z.infer<S>,
    ...accountFor(message, request.model),
  };
}

/**
 * One prose call, streamed.
 *
 * Used by compile and the test run — the two endpoints whose output is text a
 * person reads rather than JSON a route parses. `onText` fires per delta so the
 * route can forward it to the browser as it arrives.
 */
export async function callText({
  endpoint,
  blocks,
  instruction,
  onText,
}: {
  endpoint: Endpoint;
  blocks: ContentBlock[];
  instruction: string;
  onText?: (delta: string) => void;
}): Promise<CallResult<string>> {
  const request = shapeRequest({ endpoint, blocks, instruction });
  const { message, text } = await send(request, onText);
  assertFinished(message, text);

  return { data: text, ...accountFor(message, request.model) };
}

/**
 * Run the compiled prompt for real.
 *
 * Deliberately takes the whole blocks array rather than a brief: the test run
 * sends the compiled prompt and the files, and nothing else. See `shapeTestRun`.
 */
export async function callTestRun({
  blocks,
  onText,
}: {
  blocks: ContentBlock[];
  onText?: (delta: string) => void;
}): Promise<CallResult<string>> {
  const request = shapeTestRun(blocks);
  const { message, text } = await send(request, onText);
  assertFinished(message, text);

  return { data: text, ...accountFor(message, request.model) };
}
