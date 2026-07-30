"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Step } from "@/components/step";
import {
  BRIEF_FIELDS,
  type Brief,
  type ChipAttachment,
  briefCompletion,
  briefIsComplete,
  evaluateFieldChips,
  referencedFilenames,
} from "@/lib/brief";
import type { Review } from "@/lib/claude/schemas";
import type { Database } from "@/lib/database.types";
import type { CallCost } from "@/lib/model-call";
import { SaveIndicatorText, useAutosave } from "@/lib/use-autosave";

import {
  saveBrief,
  saveDismissedChips,
  saveDraftPrompt,
  savePromptMeta,
} from "../actions";
import { Attachments, type AttachmentRow } from "./attachments";
import { AttachmentChipRow, BriefEditor } from "./brief-editor";
import { ChecklistStep, type ChecklistRow } from "./checklist-step";
import { CompileStep } from "./compile-step";
import { ReviewStep } from "./review-step";
import { SpendMeter } from "./spend-meter";
import { TestRunStep } from "./test-run-step";

type CompileMode = Database["public"]["Enums"]["compile_mode"];

const SECTOR_SUGGESTIONS = [
  "Real Estate",
  "Web Design",
  "Software Development",
  "Marketing",
  "Finance",
  "Legal",
  "Operations",
];

export type WorkspaceProps = {
  promptId: string;
  versionId: string;
  initialTitle: string;
  initialSector: string;
  initialJobTitle: string;
  initialBrief: Brief;
  initialDraftPrompt: string;
  initialDismissedChips: string[];
  initialAttachments: AttachmentRow[];
  initialReview: Review | null;
  initialReviewedAt: string | null;
  initialChecklist: ChecklistRow[];
  initialCompiledPrompt: string;
  initialCompileMode: CompileMode;
  persistedSpendUsd: number;
};

export function Workspace({
  promptId,
  versionId,
  initialTitle,
  initialSector,
  initialJobTitle,
  initialBrief,
  initialDraftPrompt,
  initialDismissedChips,
  initialAttachments,
  initialReview,
  initialReviewedAt,
  initialChecklist,
  initialCompiledPrompt,
  initialCompileMode,
  persistedSpendUsd,
}: WorkspaceProps) {
  const [title, setTitle] = useState(initialTitle);
  const [sector, setSector] = useState(initialSector);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [brief, setBrief] = useState<Brief>(initialBrief);
  const [draftPrompt, setDraftPrompt] = useState(initialDraftPrompt);
  const [dismissedChips, setDismissedChips] = useState(initialDismissedChips);
  // Attachments live here rather than inside the uploader so the coverage chips
  // react the instant a file lands — the brand-reference and files-attached
  // chips both read this list.
  const [attachments, setAttachments] = useState<AttachmentRow[]>(initialAttachments);
  const [checklist, setChecklist] = useState<ChecklistRow[]>(initialChecklist);
  const [compiledPrompt, setCompiledPrompt] = useState(initialCompiledPrompt);
  const [compileMode, setCompileMode] = useState<CompileMode>(initialCompileMode);
  // Every model call appends here. Not persisted: compile and checklist calls
  // have no row of their own to hang usage on, so this is the only place the
  // full session cost exists.
  const [calls, setCalls] = useState<CallCost[]>([]);

  const briefSave = useAutosave(brief, (value) => saveBrief(versionId, value));
  const draftSave = useAutosave(draftPrompt, (value) =>
    saveDraftPrompt(versionId, value),
  );
  useAutosave(dismissedChips, (value) => saveDismissedChips(versionId, value));
  useAutosave({ title, sector, jobTitle }, (value) =>
    savePromptMeta(promptId, {
      title: value.title,
      sector: value.sector || null,
      job_title: value.jobTitle || null,
    }),
  );

  function toggleChip(chipId: string) {
    setDismissedChips((current) =>
      current.includes(chipId)
        ? current.filter((id) => id !== chipId)
        : [...current, chipId],
    );
  }

  const saveLabel =
    SaveIndicatorText(briefSave) || SaveIndicatorText(draftSave) || "";

  const recordSpend = useCallback((cost: CallCost) => {
    setCalls((current) => [...current, cost]);
  }, []);

  // The gate on every model-backed step. Deliberately just "no box is empty" —
  // the coverage chips are advisory and never block, so making them a
  // precondition here would contradict that.
  const briefReady = briefIsComplete(brief);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-line px-5 py-3">
        <Link
          href="/prompts"
          className="shrink-0 text-sm text-muted transition hover:text-ink"
        >
          ← All prompts
        </Link>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Prompt title"
          className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-navy outline-none hover:border-line focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <span className="w-20 shrink-0 text-right text-xs text-faint">
          {saveLabel}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Centre: the task */}
        <section className="pane-scroll min-w-0 flex-1 overflow-y-auto border-r border-line">
          <h2 className="border-b border-line px-5 py-3 text-base font-semibold">
            Your task
          </h2>

          <Step
            number={1}
            title="Choose your role"
            description="The persona this prompt is written from. Saved to your profile and prefilled next time."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="sector"
                  className="block text-sm font-medium text-navy"
                >
                  Sector
                </label>
                <input
                  id="sector"
                  list="sector-options"
                  value={sector}
                  onChange={(event) => setSector(event.target.value)}
                  placeholder="Real Estate"
                  className="mt-1.5 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent"
                />
                <datalist id="sector-options">
                  {SECTOR_SUGGESTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  htmlFor="job-title"
                  className="block text-sm font-medium text-navy"
                >
                  Job title
                </label>
                <input
                  id="job-title"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Property Consultant"
                  className="mt-1.5 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          </Step>

          <Step
            number={2}
            title="Describe the task"
            description="The ground truth — what a great result has to satisfy. Not the prompt itself; you write that next."
          >
            <ul className="mb-5 space-y-1 text-sm text-muted">
              <li>
                <span className="mr-1.5 text-good">✓</span>
                <span className="font-medium text-ink">Be specific</span> about the
                deliverable and its constraints — exact copy, dimensions,
                must-haves.
              </li>
              <li>
                <span className="mr-1.5 text-good">✓</span>
                <span className="font-medium text-ink">Name your files</span> in the
                brief so the compiled prompt can reference them.
              </li>
              <li>
                <span className="mr-1.5 text-good">✓</span>
                <span className="font-medium text-ink">
                  Leave nothing to guess
                </span>{" "}
                that you actually care about — anything unstated is a decision the
                model makes for you.
              </li>
            </ul>

            <BriefEditor
              brief={brief}
              attachments={attachments}
              dismissedChips={dismissedChips}
              onChange={setBrief}
              onToggleChip={toggleChip}
            />

            <div className="mt-6 border-t border-line-soft pt-5">
              <Attachments
                promptId={promptId}
                versionId={versionId}
                attachments={attachments}
                onChange={setAttachments}
              />
              <AttachmentChipRow
                brief={brief}
                attachments={attachments}
                dismissedChips={dismissedChips}
                onToggleChip={toggleChip}
              />
            </div>
          </Step>

          <Step
            number={3}
            title="Draft your prompt"
            description="How you'd actually ask an AI to do this — first person, natural, not a checklist. This gets refined into the finished prompt."
          >
            <textarea
              className="autogrow w-full rounded-md border border-line bg-panel px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent"
              rows={10}
              value={draftPrompt}
              placeholder="Hey, I am putting together…"
              onChange={(event) => setDraftPrompt(event.target.value)}
            />
            <p className="mt-2 text-xs text-faint">
              Write it the way you actually prompt. If you&apos;re not sure, pull up
              a recent AI conversation and mirror that voice and level of detail.
            </p>
          </Step>

          <Step
            number={4}
            title="Review"
            description="Where this would go wrong, with the concrete fix quoted rather than described."
          >
            <ReviewStep
              versionId={versionId}
              ready={briefReady}
              initialReview={initialReview}
              initialReviewedAt={initialReviewedAt}
              onSpend={recordSpend}
            />
          </Step>

          <Step
            number={5}
            title="Acceptance criteria"
            description="What a correct result has to satisfy. Each one answerable yes or no by looking at the output — that's what makes scoring possible."
          >
            <ChecklistStep
              versionId={versionId}
              ready={briefReady}
              items={checklist}
              onItemsChange={setChecklist}
              onSpend={recordSpend}
            />
          </Step>

          <Step
            number={6}
            title="Compile"
            description="The deliverable — the prompt you paste into an AI."
          >
            <CompileStep
              versionId={versionId}
              ready={briefReady}
              compiledPrompt={compiledPrompt}
              compileMode={compileMode}
              onCompiled={(text, mode) => {
                setCompiledPrompt(text);
                setCompileMode(mode);
              }}
              onSpend={recordSpend}
            />
          </Step>

          <Step
            number={7}
            title="Test run"
            description="Runs the finished prompt with your files but without the brief, then scores what comes back against your criteria."
          >
            <TestRunStep
              versionId={versionId}
              hasCompiledPrompt={compiledPrompt.trim().length > 0}
              checklistCount={checklist.length}
              onSpend={recordSpend}
            />
          </Step>
        </section>

        {/* Right: coverage */}
        <aside className="pane-scroll hidden w-96 shrink-0 overflow-y-auto lg:block">
          <CoveragePane
            brief={brief}
            attachments={attachments}
            dismissedChips={dismissedChips}
            draftPrompt={draftPrompt}
            compiled={compiledPrompt.trim().length > 0}
          />
          <div className="px-5 pb-5">
            <SpendMeter persistedUsd={persistedSpendUsd} calls={calls} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CoveragePane({
  brief,
  attachments,
  dismissedChips,
  draftPrompt,
  compiled,
}: {
  brief: Brief;
  attachments: ChipAttachment[];
  dismissedChips: string[];
  draftPrompt: string;
  compiled: boolean;
}) {
  const ctx = { brief, attachments };
  const completion = briefCompletion(ctx, dismissedChips);
  const complete = briefIsComplete(brief);
  const referenced = referencedFilenames(brief);

  return (
    <div className="p-5">
      <h2 className="text-base font-semibold">Brief coverage</h2>
      <p className="mt-1 text-sm text-muted">
        Checked locally as you type. Advisory only — dismiss anything your brief
        already covers another way.
      </p>

      <div className="mt-4 rounded-lg border border-line">
        <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
          <span className="text-sm font-semibold text-navy">Overall</span>
          <span
            className={`text-sm font-medium ${
              completion === 1 ? "text-good" : completion >= 0.6 ? "text-warn" : "text-bad"
            }`}
          >
            {Math.round(completion * 100)}%
          </span>
        </div>

        <ul className="divide-y divide-line-soft">
          {BRIEF_FIELDS.map((field) => {
            const chips = evaluateFieldChips(field, ctx, dismissedChips);
            const live = chips.filter((chip) => !chip.dismissed);
            const met = live.filter((chip) => chip.covered).length;
            const filled = (brief[field.key] ?? "").trim().length > 0;
            return (
              <li
                key={field.key}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="min-w-0 text-sm text-ink">{field.label}</span>
                <span className="shrink-0 text-xs">
                  {!filled ? (
                    <span className="text-bad">empty</span>
                  ) : live.length === 0 ? (
                    <span className="text-good">written</span>
                  ) : (
                    <span className={met === live.length ? "text-good" : "text-warn"}>
                      {met}/{live.length}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 rounded-lg border border-line px-4 py-3">
        <p className="text-sm font-semibold text-navy">Files named in the brief</p>
        {referenced.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {referenced.map((name) => {
              const attached = attachments.some((a) =>
                a.filename.toLowerCase().includes(name),
              );
              return (
                <li key={name} className="flex items-center gap-2 text-xs">
                  <span className={attached ? "text-good" : "text-warn"} aria-hidden>
                    {attached ? "✓" : "✗"}
                  </span>
                  <code className="font-mono text-ink">{name}</code>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-faint">
            None yet. Naming files in the brief lets the finished prompt point at
            them explicitly.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-line bg-panel px-4 py-3">
        <p className="text-sm font-semibold text-navy">Next</p>
        <p className="mt-1 text-sm text-muted">
          {!complete
            ? "Fill every brief box, then the AI steps unlock."
            : draftPrompt.trim().length === 0
              ? "Brief is complete. Draft your prompt in step 3."
              : compiled
                ? "You have a finished prompt. Run it in step 7 to see whether it holds up."
                : "Everything is in place. Review it in step 4, or go straight to compiling in step 6."}
        </p>
      </div>
    </div>
  );
}
