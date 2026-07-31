"use client";

import { useState, useTransition } from "react";

import { CallError, RunButton } from "@/components/run-button";
import { CHECKLIST_TARGETS, DEFAULT_CHECKLIST_TARGET } from "@/lib/config";
import type { Database } from "@/lib/database.types";
import { type CallCost, ModelCallError, costOfResult, postJson } from "@/lib/model-call";
import { formatUsd } from "@/lib/pricing";

import {
  addChecklistItem,
  deleteChecklistItem,
  updateChecklistItem,
} from "../actions";

type Category = Database["public"]["Enums"]["checklist_category"];

export type ChecklistRow = {
  id: string;
  text: string;
  category: Category;
  source: Database["public"]["Enums"]["item_source"];
  ordinal: number;
};

const CATEGORY_LABEL: Record<Category, string> = {
  format: "Format",
  content: "Content",
  substance: "Substance",
};

const CATEGORY_STYLE: Record<Category, string> = {
  format: "bg-panel text-muted",
  content: "bg-warn-bg text-warn",
  substance: "bg-good-bg text-good",
};

export function ChecklistStep({
  versionId,
  ready,
  items,
  onItemsChange,
  onSpend,
}: {
  versionId: string;
  ready: boolean;
  items: ChecklistRow[];
  onItemsChange: (items: ChecklistRow[]) => void;
  onSpend: (cost: CallCost) => void;
}) {
  const [target, setTarget] = useState<number>(DEFAULT_CHECKLIST_TARGET);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<Category>("content");
  const [, startTransition] = useTransition();

  const manualCount = items.filter((item) => item.source === "manual").length;

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      const result = await postJson<Record<string, unknown>>("/api/checklist", {
        versionId,
        target,
      });
      const generated = (result.items as ChecklistRow[]) ?? [];
      // The route only replaces the AI rows, so merge rather than overwrite.
      onItemsChange(
        [...items.filter((item) => item.source === "manual"), ...generated].sort(
          (a, b) => a.ordinal - b.ordinal,
        ),
      );
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

  function add() {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft("");
    startTransition(async () => {
      const row = await addChecklistItem(versionId, text, draftCategory);
      onItemsChange([...items, row as ChecklistRow]);
    });
  }

  function edit(id: string, text: string) {
    onItemsChange(
      items.map((item) => (item.id === id ? { ...item, text } : item)),
    );
  }

  function commit(id: string, text: string) {
    startTransition(async () => {
      await updateChecklistItem(id, { text });
    });
  }

  function remove(id: string) {
    onItemsChange(items.filter((item) => item.id !== id));
    startTransition(async () => {
      await deleteChecklistItem(id);
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">How many criteria?</span>
        {CHECKLIST_TARGETS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTarget(option)}
            className={`rounded-md border px-3 py-1 text-sm transition ${
              target === option
                ? "border-accent bg-accent/5 font-medium text-accent"
                : "border-line text-muted hover:border-faint"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <RunButton
        label={
          items.some((item) => item.source === "ai")
            ? "Regenerate criteria"
            : "Write the criteria"
        }
        runningLabel="Writing criteria…"
        running={running}
        disabled={!ready}
        hint={
          !ready
            ? "Fill every brief box first."
            : cost !== null
              ? `Last run cost ${formatUsd(cost)}`
              : `Runs on Sonnet 5.${manualCount > 0 ? ` Your ${manualCount} written item${manualCount === 1 ? "" : "s"} will be kept.` : ""}`
        }
        onClick={generate}
      />

      <CallError error={error} />

      {items.length > 0 ? (
        <ul className="mt-5 divide-y divide-line-soft rounded-lg border border-line">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="w-6 shrink-0 pt-1.5 text-right text-xs tabular-nums text-faint">
                {index + 1}
              </span>
              <span
                className={`mt-1 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEGORY_STYLE[item.category]}`}
              >
                {CATEGORY_LABEL[item.category]}
              </span>
              <textarea
                value={item.text}
                onChange={(event) => edit(item.id, event.target.value)}
                onBlur={(event) => commit(item.id, event.target.value)}
                rows={1}
                className="autogrow min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm leading-relaxed outline-none hover:border-line focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Delete criterion ${index + 1}`}
                className="mt-1 shrink-0 rounded px-1.5 text-sm text-faint transition hover:bg-bad-bg hover:text-bad"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <select
          value={draftCategory}
          onChange={(event) => setDraftCategory(event.target.value as Category)}
          aria-label="Category for the new criterion"
          className="rounded-md border border-line bg-panel px-2 py-2 text-sm outline-none focus:border-accent"
        >
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add your own criterion — phrase it so the answer is yes or no"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={add}
          disabled={draft.trim().length === 0}
          className="rounded-md border border-line px-3 py-2 text-sm text-navy transition hover:border-navy disabled:cursor-not-allowed disabled:text-faint"
        >
          Add
        </button>
      </div>
    </div>
  );
}
