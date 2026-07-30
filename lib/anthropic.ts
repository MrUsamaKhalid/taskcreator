import Anthropic, { toFile } from "@anthropic-ai/sdk";

import { BETAS } from "@/lib/config";

/**
 * Server-side Anthropic client.
 *
 * The key is read from ANTHROPIC_API_KEY and must never be exposed to the
 * browser — every module that imports this file is server-only.
 */
let cached: Anthropic | null = null;

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-side only — never NEXT_PUBLIC_).",
    );
  }
  cached ??= new Anthropic();
  return cached;
}

/**
 * Push a file to the Anthropic Files API and return its file_id.
 *
 * Uploading once and citing the id afterwards means a PDF or screenshot is
 * transferred a single time and then reused across review, compile, and
 * test-run calls.
 *
 * Returns null when no key is configured, so uploads still land in Supabase
 * Storage and text extraction still runs — the id gets backfilled on first use.
 */
export async function uploadToAnthropic(
  filename: string,
  mime: string,
  bytes: ArrayBuffer,
): Promise<string | null> {
  if (!hasAnthropicKey()) return null;

  const file = await anthropic().beta.files.upload({
    file: await toFile(new Blob([bytes], { type: mime }), filename, { type: mime }),
    betas: [BETAS.files],
  });

  return file.id;
}
