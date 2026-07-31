import { BRIEF_FIELDS } from "@/lib/brief";

/**
 * Endpoint instructions.
 *
 * These go in the user turn, *after* the cache breakpoints — that placement is
 * what lets every endpoint reuse one cached prefix. Keep them free of anything
 * derived from the brief itself; brief content belongs above the breakpoint or it
 * fragments the cache.
 */

const BRIEF_KEYS = BRIEF_FIELDS.map((field) => field.key).join(", ");

export const REVIEW_INSTRUCTION = `Review the brief and the draft prompt above. Return JSON matching the schema.

Three sections:

1. **brief** — exactly one criterion per box, six in total, with keys: ${BRIEF_KEYS}. Use the box's own name as the label. Judge whether each box says enough that a model could not plausibly get it wrong. A box can be long and still be weak if it is all adjectives.

2. **prompt** — criteria with these keys, in order:
   - clarity — could a model misread what is being asked?
   - specificity — does the prompt carry the brief's actual constraints, or does it gesture at them?
   - completeness — is anything the person cares about left for the model to invent?
   - ambiguity_risk — name the single most likely way a competent model goes wrong here.
   - inputs — are the prompt plus the attached files enough to do the task at all?
   - model_fit — would a current frontier model land this in one shot? If not, say what to add.

3. **attachments** — criteria with keys: present, content, relevance. Judge whether every file the brief names is actually attached, whether the contents match what the brief claims, and whether anything attached is irrelevant. If there are no attachments at all, say so plainly and rate accordingly — do not invent rows about files that do not exist.

Rules for every criterion:
- rating is one of excellent, good, needs_work, missing.
- comment is one or two sentences on what is or is not there. No restating the brief.
- suggestion is the concrete fix: quote the text to use, the value to state, or the sentence to add. Leave it empty only when the rating is excellent.

Grade against "would this reliably produce what they want", not against effort spent.`;

export const CHECKLIST_INSTRUCTION = (
  target: number,
) => `Write ${target} acceptance criteria for the output this prompt will produce. Return JSON matching the schema.

Each item must be:
- A single requirement. Split "A and B" into two items.
- Answerable yes or no by looking at the finished output, with no judgement call. "Is the heading 32px" works; "is the design good" does not.
- Traceable to something the brief actually says. Do not invent requirements the brief never stated.

Category each one:
- format — file type, dimensions, page or word count, naming, structure
- content — specific text, figures, sections, or data that must appear
- substance — whether the thing actually does its job: correct, coherent, complete, internally consistent

Weight toward whatever the brief emphasises. A brief full of exact values should produce mostly format and content items; one about analysis or writing should lean substance. Do not pad to hit the number — if the brief only supports fewer real criteria, return fewer.`;

export const COMPILE_STRUCTURED_INSTRUCTION = `Write the finished prompt. Output the prompt text only — no preamble, no explanation, no code fence.

Structure it under these headings, omitting any the brief has nothing for:

# Role and context
# What I need
# Requirements
# Style and brand
# Format and output spec
# Files provided
# Before you finish, verify

Rules:
- Write in the first person, as the person from the brief. Keep their role and situation.
- Carry every exact value through unchanged: quoted copy, hex codes, dimensions, counts, names. If the brief says "AED 4,200,000", the prompt says "AED 4,200,000" — never "about 4.2M".
- Under "Files provided", list each file by its exact filename with one line on what it contains. Files marked DO NOT USE must be listed and explicitly marked as not to be used.
- "Before you finish, verify" is a short checklist of the requirements most likely to be missed. Phrase each as a check, not a restatement.
- Do not invent requirements. If the brief is silent on something, leave it silent rather than guessing a default.
- Do not include meta-commentary about the brief or about this instruction.`;

export const COMPILE_NATURAL_INSTRUCTION = `Write the finished prompt as a message the person would actually send. Output the prompt text only — no preamble, no explanation, no code fence.

Rules:
- First person, conversational, the way a competent professional writes to a colleague who needs to get something exactly right. Not a form, not headings, not bullet-point-only.
- Keep every exact value unchanged: quoted copy, hex codes, dimensions, counts, names. Precision is the point; the register is the only thing that is relaxed.
- Name each file by its exact filename where it becomes relevant, rather than listing them all up front.
- Say plainly which files must not be used, and why, if the brief marks any.
- End by naming the two or three things most likely to be got wrong, as a request to double-check them.
- Do not invent requirements the brief does not state.`;

export const GRADE_INSTRUCTION = `Judge the output against the checklist. Return JSON matching the schema, one result per checklist item.

- index is the item's zero-based position in the list exactly as given. Return every item once. Do not reorder, skip, or merge.
- passed is true only if the output plainly satisfies the item. Ambiguous or partial means false.
- evidence quotes or cites the part of the output that decides it. For a fail, say specifically what is missing or wrong — enough that the person knows which part of their brief to strengthen.

Judge only what the item asks. Do not deduct for things outside the checklist, however much you would have done differently.`;

/**
 * The material the grader judges, appended after GRADE_INSTRUCTION.
 *
 * Kept out of the cached prefix on purpose: the output and the checklist change
 * on every run, so putting them above a breakpoint would invalidate the brief
 * prefix each time and turn every grade into a full cache write.
 */
export function gradePayload({
  items,
  output,
}: {
  items: Array<{ text: string; category: string }>;
  output: string;
}): string {
  return [
    "",
    "## The checklist",
    "",
    ...items.map(
      (item, index) => `${index}. [${item.category}] ${item.text}`,
    ),
    "",
    "## The output to judge",
    "",
    "<output>",
    output,
    "</output>",
  ].join("\n");
}
