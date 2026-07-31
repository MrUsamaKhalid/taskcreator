import { z } from "zod";

/**
 * Structured output schemas for the three JSON-returning endpoints.
 *
 * Deliberately free of `.min()`, `.max()`, `.length()`, and numeric bounds:
 * structured outputs do not support string-length or numeric constraints, and the
 * SDK strips them before sending, so any such rule would validate client-side
 * only and read as a server guarantee it never was. Bounds that matter are stated
 * in the prompt text instead, where the model can actually act on them.
 */

export const RatingSchema = z.enum([
  "excellent",
  "good",
  "needs_work",
  "missing",
]);

/**
 * One graded row in the review pane.
 *
 * `suggestion` is separate from `comment` on purpose. A grade alone is not
 * actionable — the whole value of the review is the concrete rewrite, so the
 * schema forces the model to produce one rather than leaving it optional and
 * getting a rating with no fix attached.
 */
export const CriterionSchema = z.object({
  key: z.string().describe("Stable identifier, snake_case, e.g. who_asking"),
  label: z.string().describe("Human label shown in the row, e.g. Who's asking"),
  rating: RatingSchema,
  comment: z.string().describe("One or two sentences on what is or isn't there"),
  suggestion: z
    .string()
    .describe(
      "A concrete rewrite or addition. Quote text the user should actually use. Empty string only when the rating is excellent.",
    ),
});

export const SectionSchema = z.object({
  rating: RatingSchema.describe("Overall for this section"),
  summary: z.string().describe("One paragraph, plain and specific"),
  criteria: z.array(CriterionSchema),
});

export const ReviewSchema = z.object({
  brief: SectionSchema.describe("One criterion per brief box, six in total"),
  prompt: SectionSchema.describe(
    "Criteria: clarity, specificity, completeness, ambiguity_risk, inputs, model_fit",
  ),
  attachments: SectionSchema.describe(
    "Criteria: present, content, relevance. If there are no attachments, say so and rate accordingly rather than inventing rows.",
  ),
});

export type Review = z.infer<typeof ReviewSchema>;

export const ChecklistCategorySchema = z.enum([
  "format",
  "content",
  "substance",
]);

export const ChecklistSchema = z.object({
  items: z.array(
    z.object({
      category: ChecklistCategorySchema,
      text: z
        .string()
        .describe(
          "One requirement, phrased as a yes/no question answerable by looking at the output. No conjunctions — split 'A and B' into two items.",
        ),
    }),
  ),
});

export type Checklist = z.infer<typeof ChecklistSchema>;

/**
 * Grading verdicts.
 *
 * Keyed by `index` into the checklist array as sent, not by database id. Models
 * are unreliable at echoing UUIDs back byte-exactly, and a single transposed
 * character would silently orphan a verdict; a small integer they can count to is
 * robust. The route maps index back to the real row.
 */
export const GradeSchema = z.object({
  results: z.array(
    z.object({
      index: z
        .number()
        .int()
        .describe("Zero-based position of the checklist item being judged"),
      passed: z.boolean(),
      evidence: z
        .string()
        .describe(
          "Quote or cite the part of the output that decides it. For a fail, say what is missing or wrong.",
        ),
    }),
  ),
});

export type Grade = z.infer<typeof GradeSchema>;
