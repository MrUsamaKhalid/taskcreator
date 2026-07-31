"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CallError, RunButton } from "@/components/run-button";
import { type CallCost, ModelCallError, costOfResult, postJson, postStream } from "@/lib/model-call";
import { formatUsd } from "@/lib/pricing";

type GradeResult = {
  checklistItemId: string | null;
  category: string;
  itemText: string;
  passed: boolean;
  evidence: string;
};

type Grade = {
  scorePct: number;
  passed: number;
  total: number;
  ungraded: number;
  results: GradeResult[];
};

/**
 * Step 7 — run the finished prompt for real, then score the result.
 *
 * Worth knowing what this is actually measuring: the run sends the compiled
 * prompt and the files, and nothing else. The brief is deliberately withheld, so
 * a low score means the prompt failed to carry something the brief said — which
 * is the only version of this test that tells you anything.
 */
export function TestRunStep({
  versionId,
  hasCompiledPrompt,
  checklistCount,
  onSpend,
}: {
  versionId: string;
  hasCompiledPrompt: boolean;
  checklistCount: number;
  onSpend: (cost: CallCost) => void;
}) {
  const [output, setOutput] = useState("");
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setGrade(null);
    setTestRunId(null);
    setOutput("");

    let streamed = "";
    try {
      const done = await postStream("/api/test-run", { versionId }, (delta) => {
        streamed += delta;
        setOutput(streamed);
      });

      if (typeof done.output === "string") setOutput(done.output);
      setTestRunId(typeof done.testRunId === "string" ? done.testRunId : null);
      if (typeof done.saveError === "string" && done.saveError) {
        toast.error(`Ran, but not saved: ${done.saveError}`);
      }
      const spent = costOfResult(done);
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

  async function score() {
    if (!testRunId) return;
    setGrading(true);
    setError(null);
    try {
      const result = await postJson<Record<string, unknown>>("/api/grade", {
        testRunId,
      });
      setGrade(result as unknown as Grade);
      const spent = costOfResult(result);
      if (spent) onSpend(spent);
    } catch (caught) {
      setError({
        message: caught instanceof Error ? caught.message : "Something went wrong.",
        kind: caught instanceof ModelCallError ? caught.kind : undefined,
      });
    } finally {
      setGrading(false);
    }
  }

  return (
    <div>
      <RunButton
        label={output.length > 0 ? "Run it again" : "Run the prompt"}
        runningLabel="Running…"
        running={running}
        disabled={!hasCompiledPrompt}
        hint={
          !hasCompiledPrompt
            ? "Compile the prompt first."
            : cost !== null
              ? `Last run cost ${formatUsd(cost)}`
              : "Sends the prompt and your files — not the brief."
        }
        onClick={run}
      />

      <CallError error={error} />

      {output.length > 0 || running ? (
        <div className="mt-5 rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-2">
            <span className="text-sm font-semibold text-navy">What came back</span>
            {testRunId && checklistCount > 0 ? (
              <button
                type="button"
                onClick={score}
                disabled={grading}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-navy transition hover:border-navy disabled:cursor-not-allowed disabled:text-faint"
              >
                {grading ? "Scoring…" : grade ? "Score again" : "Score it"}
              </button>
            ) : null}
          </div>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-ink">
            {output}
            {running ? <span className="text-faint">▍</span> : null}
          </pre>
        </div>
      ) : null}

      {testRunId && checklistCount === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Write some acceptance criteria in step 5 and you can score this run
          against them.
        </p>
      ) : null}

      {grade ? <GradeReport grade={grade} /> : null}
    </div>
  );
}

function GradeReport({ grade }: { grade: Grade }) {
  const tone =
    grade.scorePct >= 90 ? "text-good" : grade.scorePct >= 60 ? "text-warn" : "text-bad";

  return (
    <div className="mt-5 rounded-lg border border-line">
      <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">Score</h3>
          <p className="text-xs text-faint">
            {grade.passed} of {grade.total} criteria met
            {grade.ungraded > 0
              ? ` — ${grade.ungraded} came back unjudged and count as unmet`
              : ""}
          </p>
        </div>
        <span className={`text-lg font-semibold ${tone}`}>{grade.scorePct}%</span>
      </div>

      <ul className="divide-y divide-line-soft">
        {grade.results.map((result, index) => (
          <li key={result.checklistItemId ?? index} className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 text-sm ${result.passed ? "text-good" : "text-bad"}`}
                aria-hidden
              >
                {result.passed ? "✓" : "✗"}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink">{result.itemText}</span>
            </div>
            <p className="mt-1 pl-6 text-sm text-muted">{result.evidence}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
