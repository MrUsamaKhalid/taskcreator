"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CallError, RunButton } from "@/components/run-button";
import type { Database } from "@/lib/database.types";
import { type CallCost, ModelCallError, costOfResult, postStream } from "@/lib/model-call";
import { formatUsd } from "@/lib/pricing";

type CompileMode = Database["public"]["Enums"]["compile_mode"];

const MODES: Array<{ key: CompileMode; label: string; blurb: string }> = [
  {
    key: "structured",
    label: "Structured",
    blurb: "Headed sections. Easiest to scan and to check against.",
  },
  {
    key: "natural",
    label: "Natural",
    blurb: "Reads like a message you'd send. Same precision, softer register.",
  },
];

export function CompileStep({
  versionId,
  ready,
  compiledPrompt,
  compileMode,
  onCompiled,
  onSpend,
}: {
  versionId: string;
  ready: boolean;
  compiledPrompt: string;
  compileMode: CompileMode;
  onCompiled: (text: string, mode: CompileMode) => void;
  onSpend: (cost: CallCost) => void;
}) {
  const [mode, setMode] = useState<CompileMode>(compileMode);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    // Clear first: watching the new prompt replace the old one is the feedback
    // that the button worked, and appending to the previous text would produce
    // an incoherent hybrid.
    onCompiled("", mode);

    let streamed = "";
    try {
      const done = await postStream("/api/compile", { versionId, mode }, (delta) => {
        streamed += delta;
        onCompiled(streamed, mode);
      });

      if (typeof done.compiledPrompt === "string") {
        onCompiled(done.compiledPrompt, mode);
      }
      if (typeof done.saveError === "string" && done.saveError) {
        toast.error(`Compiled, but not saved: ${done.saveError}`);
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(compiledPrompt);
      toast.success("Prompt copied");
    } catch {
      toast.error("Your browser blocked the clipboard. Select the text and copy it.");
    }
  }

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            className={`rounded-lg border px-3 py-2.5 text-left transition ${
              mode === option.key
                ? "border-accent bg-accent/5"
                : "border-line hover:border-faint"
            }`}
          >
            <span
              className={`block text-sm font-medium ${mode === option.key ? "text-accent" : "text-navy"}`}
            >
              {option.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{option.blurb}</span>
          </button>
        ))}
      </div>

      <RunButton
        label={compiledPrompt.length > 0 ? "Compile again" : "Compile the prompt"}
        runningLabel="Writing…"
        running={running}
        disabled={!ready}
        hint={
          !ready
            ? "Fill every brief box first."
            : cost !== null
              ? `Last run cost ${formatUsd(cost)}`
              : "Runs on Opus 5. This one is the deliverable."
        }
        onClick={run}
      />

      <CallError error={error} />

      {compiledPrompt.length > 0 || running ? (
        <div className="mt-5 rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-2">
            <span className="text-sm font-semibold text-navy">
              Your finished prompt
            </span>
            <button
              type="button"
              onClick={copy}
              disabled={compiledPrompt.length === 0}
              className="rounded-md border border-line px-2.5 py-1 text-xs text-navy transition hover:border-navy disabled:cursor-not-allowed disabled:text-faint"
            >
              Copy
            </button>
          </div>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-ink">
            {compiledPrompt}
            {running ? <span className="text-faint">▍</span> : null}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
