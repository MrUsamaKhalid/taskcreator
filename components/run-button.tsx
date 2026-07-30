"use client";

/**
 * The primary action on every model-backed step.
 *
 * Every press of one of these spends money, so the label carries the estimated
 * or actual cost rather than hiding it behind a meter somewhere else on the
 * page — the decision to spend is made here.
 */
export function RunButton({
  label,
  running,
  runningLabel,
  disabled,
  hint,
  onClick,
}: {
  label: string;
  running: boolean;
  runningLabel?: string;
  disabled?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={running || disabled}
        className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-soft disabled:cursor-not-allowed disabled:bg-faint"
      >
        {running ? (runningLabel ?? "Working…") : label}
      </button>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}

/** Failure text for a model call, in the shape the routes actually return. */
export function CallError({
  error,
}: {
  error: { message: string; kind?: string } | null;
}) {
  if (!error) return null;

  const heading =
    error.kind === "refusal"
      ? "Claude declined this one"
      : error.kind === "malformed"
        ? "The response came back incomplete"
        : "That didn't work";

  return (
    <div className="mt-3 rounded-md border border-bad/30 bg-bad-bg px-3 py-2">
      <p className="text-sm font-medium text-bad">{heading}</p>
      <p className="mt-0.5 text-sm text-ink">{error.message}</p>
    </div>
  );
}
