"use client";

import { useState } from "react";

import { CallError, RunButton } from "@/components/run-button";
import { RatingBadge } from "@/components/rating-badge";
import type { Review } from "@/lib/claude/schemas";
import { type CallCost, ModelCallError, costOfResult, postJson } from "@/lib/model-call";
import { formatUsd } from "@/lib/pricing";

type Section = Review["brief"];

const SECTIONS: Array<{ key: keyof Review; title: string; blurb: string }> = [
  { key: "brief", title: "Your brief", blurb: "One row per box." },
  { key: "prompt", title: "Your draft prompt", blurb: "How it would actually land." },
  { key: "attachments", title: "Your files", blurb: "Whether they match what the brief claims." },
];

export function ReviewStep({
  versionId,
  ready,
  initialReview,
  initialReviewedAt,
  onSpend,
}: {
  versionId: string;
  ready: boolean;
  initialReview: Review | null;
  initialReviewedAt: string | null;
  onSpend: (cost: CallCost) => void;
}) {
  const [review, setReview] = useState<Review | null>(initialReview);
  const [reviewedAt, setReviewedAt] = useState<string | null>(initialReviewedAt);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const result = await postJson<Record<string, unknown>>("/api/review", {
        versionId,
      });
      setReview(result.review as Review);
      setReviewedAt(typeof result.createdAt === "string" ? result.createdAt : null);
      const spent = costOfResult(result);
      if (spent) {
        setCost(spent.costUsd);
        onSpend(spent);
      }
    } catch (caught) {
      setError({
        message: caught instanceof Error ? caught.message : "Something went wrong.",
        kind: caught instanceof ModelCallError ? caught.kind : undefined,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <RunButton
        label={review ? "Review again" : "Review my brief"}
        runningLabel="Reading everything…"
        running={running}
        disabled={!ready}
        hint={
          !ready
            ? "Fill every brief box first."
            : cost !== null
              ? `Last run cost ${formatUsd(cost)}`
              : "Runs on Opus 5. Usually a few cents."
        }
        onClick={run}
      />

      <CallError error={error} />

      {review ? (
        <div className="mt-5 space-y-5">
          {reviewedAt ? (
            <p className="text-xs text-faint">
              Reviewed {new Date(reviewedAt).toLocaleString()}
            </p>
          ) : null}
          {SECTIONS.map((section) => (
            <ReviewSection
              key={section.key}
              title={section.title}
              blurb={section.blurb}
              section={review[section.key]}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewSection({
  title,
  blurb,
  section,
}: {
  title: string;
  blurb: string;
  section: Section;
}) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy">{title}</h3>
          <p className="text-xs text-faint">{blurb}</p>
        </div>
        <RatingBadge rating={section.rating} />
      </div>

      <p className="border-b border-line-soft px-4 py-3 text-sm text-muted">
        {section.summary}
      </p>

      <ul className="divide-y divide-line-soft">
        {section.criteria.map((criterion) => (
          <li key={criterion.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{criterion.label}</span>
              <RatingBadge rating={criterion.rating} />
            </div>
            <p className="mt-1 text-sm text-muted">{criterion.comment}</p>
            {criterion.suggestion.trim().length > 0 ? (
              <p className="mt-2 border-l-2 border-accent/40 bg-panel px-3 py-2 text-sm text-ink">
                {criterion.suggestion}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
