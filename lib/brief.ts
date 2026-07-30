/**
 * The structured brief — six labelled boxes, ported from the TaskCrafter
 * "Describe the task scenario" step.
 *
 * Coverage chips are deliberately *deterministic*: they run as plain regex
 * heuristics in the browser on every keystroke. No API call, no cost, no
 * latency. They are advisory only — every chip can be dismissed, and nothing
 * they say ever blocks progress.
 */

export type BriefKey =
  | "who_asking"
  | "context"
  | "what_needed"
  | "requirements"
  | "style_brand"
  | "format_specs";

export type Brief = Record<BriefKey, string>;

export const EMPTY_BRIEF: Brief = {
  who_asking: "",
  context: "",
  what_needed: "",
  requirements: "",
  style_brand: "",
  format_specs: "",
};

/** Minimal shape the chip heuristics need from an attachment row. */
export type ChipAttachment = {
  filename: string;
  role: "input" | "brand" | "excluded";
};

export type ChipContext = {
  brief: Brief;
  attachments: ChipAttachment[];
};

export type Chip = {
  id: string;
  label: string;
  /** True when the brief appears to cover this. */
  test: (value: string, ctx: ChipContext) => boolean;
};

export type BriefField = {
  key: BriefKey;
  label: string;
  /** Italic helper text under the label, as in the screenshots. */
  hint: string;
  placeholder: string;
  /** Rows for the textarea at rest. */
  rows: number;
  chips: Chip[];
};

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

const FIRST_PERSON = /\bI\s*(?:am|'m|’m|work|lead|own|run|manage|handle|head)\b/i;

const AUDIENCE =
  /\b(audience|client|customer|tenant|landlord|buyer|seller|investor|team|stakeholder|reader|viewer|follower|subscriber|manager|user|reviewer|developer|designer|engineer|agent|broker|colleague)\b/i;

const WHY_NOW =
  /\b(because|since|deadline|due|launch(?:ing|es)?|releas(?:e|ing)|ahead of|before|after|urgent|asap|this (?:week|month|quarter)|next (?:week|month|quarter)|campaign|by (?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|q[1-4]\b)/i;

const MEDIA_TYPE =
  /\b(pdf|deck|slides?|presentation|images?|png|jpe?g|svg|webp|video|mp4|mov|audio|mp3|wav|docx?|document|spreadsheet|xlsx?|csv|report|brochure|flyer|logo|banner|email|newsletter|script|caption|post|reel|article|blog|copy|landing page|website|page|mockup|wireframe|screens?|icons?|infographic|invoice|contract|proposal|listing|memo|summary|plan|checklist|table)\b/i;

const PURPOSE =
  /\b(for |so that|so we|so I|to help|in order to|used by|goes to|will be (?:used|shown|sent|posted|published)|intended for|aimed at|targeted at)/i;

const QUANTITY =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a dozen)\s+(?:\w+\s+){0,2}(files?|pages?|slides?|images?|screens?|versions?|variants?|options?|deliverables?|documents?|posts?|copies|assets?|sheets?|sections?|items?|examples?)\b/i;

/** A quoted run of at least three characters — the signal for exact copy. */
const QUOTED = /["“”'‘’]([^"“”'‘’\n]{3,})["“”'‘’]/;

const FIGURES =
  /(#[0-9a-f]{3,8}\b)|(\b\d+(?:\.\d+)?\s*(?:px|pt|pts|mm|cm|in|%|kg|m2|sqft|sq\s?ft|aed|usd|eur|gbp|k|bed|bath|bhk)\b)|(\$\s?\d)|(\b\d{3,}\b)/i;

/** Bulleted lines, a numbered list, or three-plus comma-separated clauses. */
function hasSections(value: string): boolean {
  const bulletLines = value
    .split("\n")
    .filter((line) => /^\s*(?:[-*•–—]|\d+[.)])\s+\S/.test(line));
  if (bulletLines.length >= 2) return true;
  return value.split(",").filter((part) => part.trim().length > 2).length >= 3;
}

const DIMENSIONS =
  /(\b\d{2,}\s*[x×]\s*\d{2,}\b)|(\b\d+(?:\.\d+)?\s*(?:px|pt|mm|cm|in)\b)|(\bA[0-9]\b)|(\b(?:portrait|landscape|square)\b)/i;

const FILE_TYPE =
  /(\.(?:pdf|png|jpe?g|svg|docx?|xlsx?|csv|pptx?|mp4|mov|mp3|wav|json|md|txt|webp|gif|zip)\b)|(\b(?:pdf|png|jpeg|svg|docx|xlsx|csv|pptx|markdown|plain text)\b)/i;

const LENGTH =
  /\b\d+\s*(?:pages?|words?|slides?|characters?|chars?|minutes?|mins?|seconds?|secs?|paragraphs?|lines?|items?|bullets?|sentences?|rows?)\b/i;

/**
 * Filename-looking tokens mentioned anywhere in the brief.
 * Used to check that everything the brief names has actually been attached.
 */
export function referencedFilenames(brief: Brief): string[] {
  const all = Object.values(brief).join("\n");
  const matches = all.match(
    /\b[\w][\w \-.]*\.(?:pdf|png|jpe?g|svg|docx?|xlsx?|csv|pptx?|mp4|mov|mp3|wav|json|md|txt|webp|gif|zip)\b/gi,
  );
  return [...new Set((matches ?? []).map((m) => m.trim().toLowerCase()))];
}

function allReferencedFilesAttached(_value: string, ctx: ChipContext): boolean {
  const referenced = referencedFilenames(ctx.brief);
  if (referenced.length === 0) return ctx.attachments.length > 0;
  const attached = ctx.attachments.map((a) => a.filename.toLowerCase());
  return referenced.every((name) =>
    attached.some((f) => f === name || f.endsWith(name) || f.includes(name)),
  );
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export const BRIEF_FIELDS: BriefField[] = [
  {
    key: "who_asking",
    label: "Who's asking",
    hint: 'the persona you\'re writing as — first person ("I am a…")',
    placeholder:
      "I am the product designer at …, and I own the design system and every screen that ships.",
    rows: 3,
    chips: [
      {
        id: "first_person",
        label: "first person",
        test: (v) => FIRST_PERSON.test(v),
      },
      {
        id: "role_detail",
        label: "role & organisation",
        test: (v) => v.trim().length >= 60,
      },
    ],
  },
  {
    key: "context",
    label: "Context",
    hint: "the situation and who this is for",
    placeholder:
      "This goes to two front-end engineers and to our accessibility reviewer, so it has to be exact.",
    rows: 3,
    chips: [
      { id: "audience", label: "audience", test: (v) => AUDIENCE.test(v) },
      { id: "why_now", label: "situation / timing", test: (v) => WHY_NOW.test(v) },
    ],
  },
  {
    key: "what_needed",
    label: "What you need made",
    hint: "the artefact you want out the other end",
    placeholder:
      "Six screens at 390x844, delivered as a PDF plus PNG exports. Four deliverables in total.",
    rows: 4,
    chips: [
      { id: "media_type", label: "media type", test: (v) => MEDIA_TYPE.test(v) },
      { id: "what_for", label: "what it's for", test: (v) => PURPOSE.test(v) },
      { id: "quantity", label: "quantity", test: (v) => QUANTITY.test(v) },
    ],
  },
  {
    key: "requirements",
    label: "Requirements",
    hint: "the specific must-haves the output needs",
    placeholder:
      'Every value comes off the token sheet — don\'t invent numbers. The primary button reads "Request swap".',
    rows: 8,
    chips: [
      {
        id: "exact_copy",
        label: "exact copy / text",
        test: (v) => QUOTED.test(v),
      },
      {
        id: "figures",
        label: "specific facts or figures",
        test: (v) => FIGURES.test(v),
      },
      {
        id: "sections",
        label: "sections to include",
        test: (v) => hasSections(v),
      },
    ],
  },
  {
    key: "style_brand",
    label: "Style & brand",
    hint: "the look and feel, and which attached files to follow",
    placeholder:
      "Utility first. High contrast, generous tap areas, no decorative illustration and no gradients.",
    rows: 4,
    chips: [
      {
        id: "brand_file",
        label: "brand / reference file",
        test: (_v, ctx) => ctx.attachments.some((a) => a.role === "brand"),
      },
    ],
  },
  {
    key: "format_specs",
    label: "Format & specs",
    hint: "dimensions, length, file type",
    placeholder:
      "4 files. screens.pdf, 6 pages, 390x844 pt each. tokens.pdf, 1 page, A4 portrait.",
    rows: 5,
    chips: [
      { id: "dimensions", label: "dimensions", test: (v) => DIMENSIONS.test(v) },
      { id: "file_type", label: "file type", test: (v) => FILE_TYPE.test(v) },
      {
        id: "length",
        label: "length / page count",
        test: (v) => LENGTH.test(v),
      },
    ],
  },
];

/** Chip shown against the attachments block rather than a brief box. */
export const ATTACHMENT_CHIP: Chip = {
  id: "files_attached",
  label: "referenced files are attached",
  test: allReferencedFilesAttached,
};

export type ChipState = {
  id: string;
  label: string;
  covered: boolean;
  dismissed: boolean;
};

/** Evaluate every chip for one field. */
export function evaluateFieldChips(
  field: BriefField,
  ctx: ChipContext,
  dismissed: string[],
): ChipState[] {
  const value = ctx.brief[field.key] ?? "";
  return field.chips.map((chip) => ({
    id: `${field.key}.${chip.id}`,
    label: chip.label,
    covered: value.trim().length > 0 && chip.test(value, ctx),
    dismissed: dismissed.includes(`${field.key}.${chip.id}`),
  }));
}

/** How complete the brief looks overall — drives the status dot in the rail. */
export function briefCompletion(ctx: ChipContext, dismissed: string[]): number {
  const chips = BRIEF_FIELDS.flatMap((f) =>
    evaluateFieldChips(f, ctx, dismissed),
  );
  const live = chips.filter((c) => !c.dismissed);
  if (live.length === 0) return 1;
  return live.filter((c) => c.covered).length / live.length;
}

/** Every box has something in it — the gate for enabling Review. */
export function briefIsComplete(brief: Brief): boolean {
  return BRIEF_FIELDS.every((f) => (brief[f.key] ?? "").trim().length > 0);
}
