/**
 * Product-wide constants.
 *
 * APP_NAME is referenced everywhere the product names itself, so renaming the
 * product is a one-line change here.
 */
export const APP_NAME = "TaskCreator";
export const APP_TAGLINE =
  "Turn a structured brief into a production-grade prompt";

/**
 * Claude model + effort defaults.
 *
 * claude-opus-5 runs adaptive thinking by default — do not pass `budget_tokens`
 * (rejected with a 400) and do not pass temperature/top_p/top_k (also 400).
 * Depth is controlled entirely by `output_config.effort`.
 */
export const MODEL = "claude-opus-5";

/** Effort per endpoint. Review and compile carry the most judgement, so they sit
 *  highest; grading a finished output against explicit yes/no criteria is a
 *  cheaper, more mechanical job. */
export const EFFORT = {
  review: "high",
  checklist: "medium",
  compile: "high",
  testRun: "high",
  grade: "medium",
} as const;

/** Anthropic beta flags. `fallbacks` and the Files API both require opt-in. */
export const BETAS = {
  /** Server-side refusal fallback, `fallbacks: "default"` scalar form. */
  fallback: "server-side-fallback-2026-07-01",
  /** Required on upload AND on any request that cites a file_id. */
  files: "files-api-2025-04-14",
} as const;

/** Upload limits. The bucket enforces the byte cap server-side too. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 25;
export const STORAGE_BUCKET = "attachments";

/** Checklist size targets offered in the UI. */
export const CHECKLIST_TARGETS = [10, 20, 40] as const;
export const DEFAULT_CHECKLIST_TARGET = 20;
