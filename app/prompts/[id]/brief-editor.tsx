"use client";

import { useMemo } from "react";

import {
  ATTACHMENT_CHIP,
  BRIEF_FIELDS,
  type Brief,
  type ChipAttachment,
  type ChipState,
  evaluateFieldChips,
} from "@/lib/brief";

/**
 * The six labelled brief boxes plus their advisory coverage chips.
 *
 * Chips are pure client-side regex heuristics — they update on every keystroke
 * with no network call. Clicking one dismisses it, which is why they can afford
 * to be a little eager: a false amber costs one click, not a wrong prompt.
 */
export function BriefEditor({
  brief,
  attachments,
  dismissedChips,
  onChange,
  onToggleChip,
}: {
  brief: Brief;
  attachments: ChipAttachment[];
  dismissedChips: string[];
  onChange: (next: Brief) => void;
  onToggleChip: (chipId: string) => void;
}) {
  const ctx = useMemo(() => ({ brief, attachments }), [brief, attachments]);

  return (
    <div className="space-y-6">
      {BRIEF_FIELDS.map((field) => {
        const chips = evaluateFieldChips(field, ctx, dismissedChips);
        return (
          <div key={field.key}>
            <label
              htmlFor={`brief-${field.key}`}
              className="block text-sm font-semibold text-navy"
            >
              {field.label}{" "}
              <span className="font-normal italic text-faint">{field.hint}</span>
            </label>

            <textarea
              id={`brief-${field.key}`}
              className="autogrow mt-2 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-accent focus:bg-white focus:ring-1 focus:ring-accent"
              rows={field.rows}
              value={brief[field.key]}
              placeholder={field.placeholder}
              onChange={(event) =>
                onChange({ ...brief, [field.key]: event.target.value })
              }
            />

            {chips.length > 0 ? (
              <ChipRow chips={chips} onToggle={onToggleChip} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Chip row for the attachments block, evaluated against the whole brief. */
export function AttachmentChipRow({
  brief,
  attachments,
  dismissedChips,
  onToggleChip,
}: {
  brief: Brief;
  attachments: ChipAttachment[];
  dismissedChips: string[];
  onToggleChip: (chipId: string) => void;
}) {
  const id = `attachments.${ATTACHMENT_CHIP.id}`;
  const chip: ChipState = {
    id,
    label: ATTACHMENT_CHIP.label,
    covered: ATTACHMENT_CHIP.test("", { brief, attachments }),
    dismissed: dismissedChips.includes(id),
  };
  return <ChipRow chips={[chip]} onToggle={onToggleChip} />;
}

function ChipRow({
  chips,
  onToggle,
}: {
  chips: ChipState[];
  onToggle: (chipId: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-faint">Include:</span>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onToggle(chip.id)}
          title={
            chip.dismissed
              ? "Dismissed — click to bring back"
              : chip.covered
                ? "Looks covered — click to dismiss"
                : "Not detected yet — click to dismiss if your brief already covers it"
          }
          className={`rounded-full border px-2 py-0.5 text-xs transition ${
            chip.dismissed
              ? "border-line bg-white text-faint line-through"
              : chip.covered
                ? "border-good/30 bg-good-bg text-good"
                : "border-warn/30 bg-warn-bg text-warn"
          }`}
        >
          <span aria-hidden className="mr-1">
            {chip.dismissed ? "–" : chip.covered ? "✓" : "✗"}
          </span>
          {chip.label}
        </button>
      ))}
    </div>
  );
}
