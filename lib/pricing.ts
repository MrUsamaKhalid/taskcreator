import type { ModelId } from "@/lib/config";

/**
 * Cost accounting.
 *
 * Every Claude response reports exact token counts, so spend here is measured
 * rather than estimated. Note what this file deliberately does *not* try to do:
 * report remaining account balance. A standard API key has no balance endpoint —
 * Anthropic's Admin API reports cost incurred, not credit left, and needs a
 * separate admin key. Showing an invented or stale balance would be worse than
 * showing none, so the UI links out to the console for that instead.
 */

/** USD per million tokens. */
const RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  // Sonnet 5 has introductory pricing of $2/$10 per MTok through 2026-08-31.
  // Standard rates are used here on purpose: a cost display should err high, so
  // the number you see is never a pleasant surprise in the wrong direction. It
  // also avoids a date-conditional price that silently rots once the intro ends.
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Cache multipliers, relative to the model's base input rate.
 *
 * A write costs more than a plain input token; a read costs a tenth. That ratio
 * is why the break-even on a 5-minute cache is two requests: 1.25 + 0.1 = 1.35
 * against 2.0 uncached.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** The subset of Anthropic's `usage` object that carries cost. */
export type TokenUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type CostBreakdown = {
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** Total prompt size, which is NOT `input_tokens` alone — see note below. */
  totalPromptTokens: number;
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  totalCost: number;
  /** What the cache reads saved against paying full input price for them. */
  cacheSavings: number;
};

function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Itemise one call's cost.
 *
 * Watch `input_tokens`: it is the *uncached remainder*, not the whole prompt.
 * Total prompt size is input + cache_creation + cache_read. Reading
 * `input_tokens` as "the prompt" is the classic way to conclude a long agentic
 * run was mysteriously cheap.
 */
export function costBreakdown(
  model: ModelId,
  usage: TokenUsage | null | undefined,
): CostBreakdown {
  const rate = RATES[model];
  const inputTokens = num(usage?.input_tokens);
  const outputTokens = num(usage?.output_tokens);
  const cacheWriteTokens = num(usage?.cache_creation_input_tokens);
  const cacheReadTokens = num(usage?.cache_read_input_tokens);

  const perToken = rate.input / 1_000_000;
  const inputCost = inputTokens * perToken;
  const cacheWriteCost = cacheWriteTokens * perToken * CACHE_WRITE_MULTIPLIER;
  const cacheReadCost = cacheReadTokens * perToken * CACHE_READ_MULTIPLIER;
  const outputCost = (outputTokens * rate.output) / 1_000_000;

  return {
    model,
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    totalPromptTokens: inputTokens + cacheWriteTokens + cacheReadTokens,
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
    cacheSavings: cacheReadTokens * perToken * (1 - CACHE_READ_MULTIPLIER),
  };
}

/** Just the number, for summing. */
export function costOf(
  model: ModelId,
  usage: TokenUsage | null | undefined,
): number {
  return costBreakdown(model, usage).totalCost;
}

/**
 * Estimate a call's cost before making it, from a token count.
 *
 * Used to price the button before you press it. Output size is a guess by
 * definition, so callers pass what they expect and the UI labels the result as an
 * estimate.
 *
 * Takes a model rather than an endpoint on purpose: it keeps this module free of
 * any runtime dependency on config, so it stays pure arithmetic that can be
 * exercised in isolation. Callers pass `ENDPOINT_MODEL[endpoint]`.
 */
export function estimateCost(
  model: ModelId,
  promptTokens: number,
  expectedOutputTokens: number,
): number {
  const rate = RATES[model];
  return (
    (promptTokens * rate.input) / 1_000_000 +
    (expectedOutputTokens * rate.output) / 1_000_000
  );
}

/**
 * Money, at a precision that matches the amount.
 *
 * Sub-cent calls are the common case here, and rounding those to $0.00 makes the
 * meter look broken. Four decimals below a cent, two above.
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

/** Compact token count for dense UI: 1234 -> "1.2k". */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** Sum many calls, e.g. every call against one prompt or one month. */
export function totalCost(
  calls: Array<{ model: ModelId; usage: TokenUsage | null | undefined }>,
): number {
  return calls.reduce((sum, call) => sum + costOf(call.model, call.usage), 0);
}
