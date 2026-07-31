"use client";

import type { CallCost } from "@/lib/model-call";
import { costBreakdown, formatTokens, formatUsd } from "@/lib/pricing";

/**
 * What this prompt has cost.
 *
 * Two numbers rather than one, because they answer different questions. The
 * persisted figure is what the reviews and test runs stored against this prompt
 * have cost across every session — it survives a refresh. The session figure
 * includes compile and checklist calls too, which have nowhere to be stored, so
 * it is the complete picture right up until you reload the page.
 *
 * Note what is deliberately absent: any claim about account balance. A standard
 * API key has no balance endpoint, so anything shown there would be invented.
 */
export function SpendMeter({
  persistedUsd,
  calls,
  uncountedCalls = 0,
}: {
  persistedUsd: number;
  calls: CallCost[];
  /** Steps that were cut off before reporting usage. Billed, but unmeasurable. */
  uncountedCalls?: number;
}) {
  const sessionUsd = calls.reduce((sum, call) => sum + call.costUsd, 0);

  const cacheSavings = calls.reduce(
    (sum, call) => sum + costBreakdown(call.model, call.usage).cacheSavings,
    0,
  );

  const cacheReads = calls.reduce(
    (sum, call) => sum + (call.usage.cache_read_input_tokens ?? 0),
    0,
  );

  return (
    <div className="mt-4 rounded-lg border border-line">
      <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
        <span className="text-sm font-semibold text-navy">Spend</span>
        <span className="text-sm font-medium text-ink">
          {uncountedCalls > 0 ? "at least " : ""}
          {formatUsd(persistedUsd + sessionUsd)}
        </span>
      </div>

      {uncountedCalls > 0 && (
        <p className="border-b border-line-soft bg-warn-bg px-4 py-2 text-xs text-muted">
          {uncountedCalls === 1 ? "One step was" : `${uncountedCalls} steps were`} cut
          off before reporting usage. That work still ran and was still charged, so the
          real figure is higher than this. Anthropic&rsquo;s console has the exact
          number.
        </p>
      )}

      <dl className="divide-y divide-line-soft text-xs">
        <Row
          label="This session"
          value={calls.length > 0 ? formatUsd(sessionUsd) : "—"}
          note={
            calls.length > 0
              ? `${calls.length} call${calls.length === 1 ? "" : "s"}`
              : "No calls yet"
          }
        />
        <Row
          label="Saved by caching"
          value={cacheSavings > 0 ? formatUsd(cacheSavings) : "—"}
          note={
            cacheReads > 0
              ? `${formatTokens(cacheReads)} tokens read from cache`
              : "Nothing cached yet this session"
          }
        />
        <Row
          label="Stored against this prompt"
          value={persistedUsd > 0 ? formatUsd(persistedUsd) : "—"}
          note="Reviews and test runs, all sessions"
        />
      </dl>

      <p className="border-t border-line-soft px-4 py-2.5 text-xs text-faint">
        Measured from the token counts Claude reports, not estimated. For your
        account balance, see the{" "}
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2"
        >
          Anthropic console
        </a>
        .
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <dt className="text-ink">{label}</dt>
        <p className="text-faint">{note}</p>
      </div>
      <dd className="shrink-0 tabular-nums text-ink">{value}</dd>
    </div>
  );
}
