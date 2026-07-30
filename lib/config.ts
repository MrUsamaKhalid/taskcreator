/**
 * Product-wide constants.
 *
 * APP_NAME is referenced everywhere the product names itself, so renaming the
 * product is a one-line change here.
 */
export const APP_NAME = "TaskCreator";
export const APP_TAGLINE =
  "Turn a structured brief into a production-grade prompt";

/** Upload limits. The storage bucket enforces the byte cap server-side too. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 25;
export const STORAGE_BUCKET = "attachments";

/** Checklist size targets offered in the UI. */
export const CHECKLIST_TARGETS = [10, 20, 40] as const;
export const DEFAULT_CHECKLIST_TARGET = 20;

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

export type ModelId = "claude-opus-5" | "claude-sonnet-5" | "claude-haiku-4-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** The five model-backed steps. */
export type Endpoint = "review" | "checklist" | "compile" | "testRun" | "grade";

/** Default when something needs "the good model" without an endpoint in hand. */
export const MODEL: ModelId = "claude-opus-5";

/**
 * Model per endpoint, tiered by how much judgement the call actually needs.
 *
 * Review and compile are the product: one tells you what's weak about your
 * brief, the other *is* the deliverable. Drafting checklist items from an
 * already-complete brief is structured generation. Grading a finished output
 * against explicit yes/no criteria is close to matching.
 *
 * testRun is the odd one out — it should mirror wherever you actually intend to
 * run the finished prompt, because the point is to find out how that model
 * handles it, not how the best available model does.
 */
export const ENDPOINT_MODEL: Record<Endpoint, ModelId> = {
  review: "claude-opus-5",
  compile: "claude-opus-5",
  checklist: "claude-sonnet-5",
  testRun: "claude-opus-5",
  grade: "claude-haiku-4-5",
};

/**
 * Effort per endpoint, or null where the model doesn't accept the parameter.
 *
 * null is not "use the default" — it means the field must be omitted entirely.
 * See MODEL_CAPS.supportsEffort.
 */
export const ENDPOINT_EFFORT: Record<Endpoint, Effort | null> = {
  review: "high",
  compile: "high",
  checklist: "medium",
  testRun: "high",
  grade: null,
};

/**
 * Per-model capability flags.
 *
 * These are not stylistic preferences — sending an unsupported field is a 400,
 * not a graceful degradation:
 *
 * - `supportsEffort`: Haiku 4.5 rejects `output_config.effort` outright.
 * - `supportsAdaptiveThinking`: adaptive thinking is a 4.6+ feature. On Haiku 4.5
 *   the `thinking` parameter must be omitted (the older fixed-budget form is
 *   deprecated and not worth reaching for here).
 * - `cacheMinTokens`: the minimum cacheable prefix, and it is *not* monotonic
 *   across generations — 512 on Opus 5 but 4096 on Haiku 4.5. Below the
 *   threshold a `cache_control` breakpoint silently does nothing: no error, just
 *   `cache_creation_input_tokens: 0`.
 * - `maxOutputTokens`: Haiku 4.5 caps at 64k, the others at 128k.
 */
export const MODEL_CAPS: Record<
  ModelId,
  {
    supportsEffort: boolean;
    supportsAdaptiveThinking: boolean;
    cacheMinTokens: number;
    maxOutputTokens: number;
    contextWindow: number;
  }
> = {
  "claude-opus-5": {
    supportsEffort: true,
    supportsAdaptiveThinking: true,
    cacheMinTokens: 512,
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
  },
  "claude-sonnet-5": {
    supportsEffort: true,
    supportsAdaptiveThinking: true,
    cacheMinTokens: 1024,
    maxOutputTokens: 128_000,
    contextWindow: 1_000_000,
  },
  "claude-haiku-4-5": {
    supportsEffort: false,
    supportsAdaptiveThinking: false,
    cacheMinTokens: 4096,
    maxOutputTokens: 64_000,
    contextWindow: 200_000,
  },
};

/**
 * max_tokens per endpoint. Anything above roughly 16k must stream or the SDK
 * risks an HTTP timeout, so compile and testRun are the streaming pair.
 */
export const ENDPOINT_MAX_TOKENS: Record<Endpoint, number> = {
  review: 16_000,
  checklist: 16_000,
  compile: 8_000,
  testRun: 32_000,
  grade: 16_000,
};

export const ENDPOINT_STREAMS: Record<Endpoint, boolean> = {
  review: false,
  checklist: false,
  compile: true,
  testRun: true,
  grade: false,
};

/**
 * Anthropic beta flags.
 *
 * Note `fallback` uses the -07-01 header, which pairs with the `fallbacks:
 * "default"` scalar form. The older -06-01 header pairs with the array form, and
 * mixing a header with the wrong form is a 400.
 */
export const BETAS = {
  fallback: "server-side-fallback-2026-07-01",
  /** Required on upload AND on any request that cites a file_id. */
  files: "files-api-2025-04-14",
} as const;

/**
 * Caveat on tiering, worth knowing before chasing cache hit rates: prompt caches
 * are scoped per model. Splitting endpoints across three models means the shared
 * brief prefix is cached three times over rather than once, so review and compile
 * (both Opus 5) share an entry while checklist and grade each pay their own
 * write. The cheaper per-token rates still win comfortably, but the caching and
 * tiering optimisations do partly work against each other.
 */
