"use client";

import Link from "next/link";
import { useState } from "react";

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
import { SaveIndicatorText, useAutosave } from "@/lib/use-autosave";

import {
  saveBrief,
  saveDismissedChips,
  saveDraftPrompt,
  savePromptMeta,
} from "../actions";
import { Attachments, type AttachmentRow } from "./attachments";
import { AttachmentChipRow, BriefEditor } from "./brief-editor";

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
        </section>

        {/* Right: coverage */}
        <aside className="pane-scroll hidden w-96 shrink-0 overflow-y-auto lg:block">
          <CoveragePane
            brief={brief}
            attachments={attachments}
            dismissedChips={dismissedChips}
            draftPrompt={draftPrompt}
          />
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
}: {
  brief: Brief;
  attachments: ChipAttachment[];
  dismissedChips: string[];
  draftPrompt: string;
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
            ? "Fill every brief box, then the AI review unlocks."
            : draftPrompt.trim().length === 0
              ? "Brief is complete. Draft your prompt in step 3."
              : "Brief and draft are in place — AI review, checklist, and test run land in the next build step."}
        </p>
      </div>
    </div>
  );
}
