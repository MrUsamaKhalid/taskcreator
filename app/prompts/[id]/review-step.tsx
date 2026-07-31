"use client";

import { useState } from "react";

import { CallError, RunButton } from "@/components/run-button";
import { RatingBadge } from "@/components/rating-badge";
import {
  REVIEW_SECTIONS,
  type ReviewSection,
} from "@/lib/claude/prompts";
import type { Review } from "@/lib/claude/schemas";
import { type CallCost, ModelCallError, costOfResult, postJson } from "@/lib/model-call";
import { formatUsd } from "@/lib/pricing";

/** What the button says while each section is in flight. */
const STAGE_LABEL: Record<ReviewSection, string> = {
  brief: "Reading your brief",
  prompt: "Reading your draft prompt",
  attachments: "Checking your files",
};

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
  const [stage, setStage] = useState<ReviewSection | null>(null);

  // Three calls, one per section, run in sequence.
  //
  // Sequence rather than parallel for two reasons. A cache entry only becomes
  // readable once the response that wrote it has started coming back, so three
  // concurrent calls would each pay a full cache write of the same brief
  // instead of one write and two cheap reads. And each call is a separate
  // function invocation with its own 60s budget, so serialising costs nothing
  // in headroom.
  //
  // Partial results are kept on failure: if attachments fails, the two sections
  // already paid for stay on screen rather than being thrown away.
  async function run() {
    setRunning(true);
    setError(null);
    setStage(null);
    try {
      let completed: Partial<Review> = {};
      let spentTotal = 0;

      for (const section of REVIEW_SECTIONS) {
        setStage(section);
        const result = await postJson<Record<string, unknown>>("/api/review", {
          versionId,
          section,
          completed,
        });

        completed = result.review as Partial<Review>;
        setReview(completed as Review);

        const spent = costOfResult(result);
        if (spent) {
          spentTotal += spent.costUsd;
          setCost(spentTotal);
          onSpend(spent);
        }
        if (typeof result.createdAt === "string") setReviewedAt(result.createdAt);
      }
    } catch (caught) {
      setError({
        message: caught instanceof Error ? caught.message : "Something went wrong.",
        kind: caught instanceof ModelCallError ? caught.kind : undefined,
      });
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  return (
    <div>
      <RunButton
        label={review ? "Review again" : "Review my brief"}
        runningLabel={
          stage ? `${STAGE_LABEL[stage]} (${REVIEW_SECTIONS.indexOf(stage) + 1} of 3)…` : "Reading everything…"
        }
        running={running}
        disabled={!ready}
        hint={
          !ready
            ? "Fill every brief box first."
            : cost !== null
              ? `Last run cost ${formatUsd(cost)}`
              : "Runs on Sonnet 5. Usually a few cents."
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
