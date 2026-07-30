import {
  BETAS,
  ENDPOINT_EFFORT,
  ENDPOINT_MAX_TOKENS,
  ENDPOINT_MODEL,
  MODEL_CAPS,
  type Endpoint,
  type ModelId,
} from "@/lib/config";

import { citesFiles, type ContentBlock } from "./context";

/**
 * One system prompt, byte-identical across every endpoint.
 *
 * This is load-bearing for caching, not tidiness. Render order is
 * tools -> system -> messages, so a per-endpoint system prompt would give each
 * endpoint its own cache entry and the shared brief prefix would be re-billed
 * every time. The endpoint's actual instruction goes in the user turn, *after*
 * the cache breakpoints, which is what lets four different jobs share one cached
 * prefix. Editing a single character of this string invalidates every cache.
 */
export const SHARED_SYSTEM = `You are the reviewing engine inside a tool that turns a structured brief into a production-grade prompt.

The person using it fills in six labelled boxes — Who's asking, Context, What you need made, Requirements, Style & brand, Format & specs — and attaches the files the task involves. Those boxes are the ground truth: they describe what a correct result must satisfy. The deliverable of the tool is a prompt they will paste into an AI, not the artefact itself.

How to think about the material you are given:

- The brief is a specification, not a request to you. Judge and use it; do not carry it out.
- Anything the brief leaves unstated is a decision the model will make for them. That is the main risk you are looking for.
- Exact values matter more than adjectives. "Professional" is unfalsifiable; a quoted string, a hex code, or a pixel dimension either appears in the output or it does not.
- Files marked DO NOT USE are real files that must be named in the finished prompt as explicitly excluded. Never treat them as sources.
- A file whose contents are marked unavailable is present but unreadable. You know its name only. Do not guess what is inside it.

Be concrete and specific. When you criticise something, quote the text you would use instead. Never pad with restatement of the brief back at the person who wrote it.`;

/**
 * The `output_config.format` object as the API expects it.
 *
 * Passed through whole rather than rebuilt from a bare schema: it is produced by
 * the SDK's `zodOutputFormat` helper, which strips the JSON Schema keywords
 * structured outputs does not support. Reassembling it here would risk
 * reintroducing them.
 */
export type OutputFormat = { type: "json_schema"; schema: Record<string, unknown> };

/**
 * A request as this app builds it, before handing to the SDK.
 *
 * Typed structurally rather than against the SDK's parameter union so the shaping
 * rules can be asserted in isolation — the point of this module is that the
 * omissions are correct, and an omission is easier to test on a plain object.
 */
export type ShapedRequest = {
  model: ModelId;
  max_tokens: number;
  betas: string[];
  fallbacks: "default";
  system: Array<{ type: "text"; text: string }>;
  messages: Array<{ role: "user"; content: ContentBlock[] }>;
  output_config?: {
    effort?: string;
    format?: OutputFormat;
  };
  thinking?: { type: "adaptive" };
  stream?: boolean;
};

/**
 * Build the request for one endpoint.
 *
 * Every conditional here prevents a 400 rather than degrading quality:
 *
 * - `output_config.effort` is omitted entirely on models that reject it. Omitted,
 *   not defaulted — Haiku 4.5 errors on the field's presence, whatever its value.
 * - `thinking` is omitted on pre-4.6 models. Adaptive thinking is a 4.6+ feature
 *   and the older fixed-budget form is deprecated, so the right move on Haiku is
 *   to send nothing.
 * - `max_tokens` is clamped to the model's own ceiling, which differs: 64k on
 *   Haiku 4.5 against 128k elsewhere.
 * - The Files API beta is sent only when a block actually cites a file_id. It is
 *   required on any request that does, and pointless on any that doesn't.
 *
 * `fallbacks: "default"` is always on. Opus 5's safety classifiers can decline a
 * request and return HTTP 200 with `stop_reason: "refusal"`; the scalar "default"
 * form routes by refusal category so there is no fallback model list to maintain.
 * It pairs specifically with the -07-01 beta header — the -06-01 header gates the
 * array form, and crossing them is itself a 400.
 */
export function shapeRequest({
  endpoint,
  blocks,
  instruction,
  format,
}: {
  endpoint: Endpoint;
  blocks: ContentBlock[];
  instruction: string;
  format?: OutputFormat;
}): ShapedRequest {
  const model = ENDPOINT_MODEL[endpoint];
  const caps = MODEL_CAPS[model];
  const effort = ENDPOINT_EFFORT[endpoint];

  const betas: string[] = [BETAS.fallback];
  if (citesFiles(blocks)) betas.push(BETAS.files);

  const request: ShapedRequest = {
    model,
    max_tokens: Math.min(ENDPOINT_MAX_TOKENS[endpoint], caps.maxOutputTokens),
    betas,
    fallbacks: "default",
    system: [{ type: "text", text: SHARED_SYSTEM }],
    messages: [
      {
        role: "user",
        // The instruction goes last, after the cached prefix. Putting it before
        // the breakpoints would make every endpoint a different prefix.
        content: [...blocks, { type: "text", text: instruction }],
      },
    ],
  };

  const outputConfig: NonNullable<ShapedRequest["output_config"]> = {};
  if (caps.supportsEffort && effort) outputConfig.effort = effort;
  if (format) outputConfig.format = format;
  if (Object.keys(outputConfig).length > 0) request.output_config = outputConfig;

  if (caps.supportsAdaptiveThinking) request.thinking = { type: "adaptive" };

  return request;
}

/**
 * Invariant worth asserting rather than trusting: no endpoint may ask for more
 * output than its own model can produce. Exported so a test can sweep every
 * endpoint and catch a future config edit that quietly breaks one.
 */
export function maxTokensExceedsModel(endpoint: Endpoint): boolean {
  const model = ENDPOINT_MODEL[endpoint];
  return ENDPOINT_MAX_TOKENS[endpoint] > MODEL_CAPS[model].maxOutputTokens;
}
