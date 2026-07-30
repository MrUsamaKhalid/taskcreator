import { BRIEF_FIELDS, type Brief } from "@/lib/brief";
import type { Database } from "@/lib/database.types";

type AttachmentRole = Database["public"]["Enums"]["attachment_role"];
type ExtractionStatus = Database["public"]["Enums"]["extraction_status"];

/** What the context builder needs from an attachment row. */
export type ContextAttachment = {
  filename: string;
  mime: string;
  role: AttachmentRole;
  anthropic_file_id: string | null;
  extracted_text: string | null;
  extraction_status: ExtractionStatus;
  description: string | null;
};

/**
 * The content-block shapes this app produces. A deliberately narrow local type
 * rather than the SDK's full union — it keeps the builder testable in isolation
 * and makes the cache_control placement obvious at a glance.
 */
export type ContentBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | {
      type: "document";
      source: { type: "file"; file_id: string };
      title?: string;
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "image";
      source: { type: "file"; file_id: string };
      cache_control?: { type: "ephemeral" };
    };

const ROLE_LABEL: Record<AttachmentRole, string> = {
  input: "input file",
  brand: "brand / style reference",
  excluded: "DO NOT USE — superseded or wrong",
};

/**
 * Assemble the shared, cacheable prefix for every model call about one brief.
 *
 * Ordering is a caching decision, not cosmetic. Attachments come first because
 * they are the most stable part — you attach files once and then edit the brief
 * repeatedly. Caching is a prefix match, so putting the volatile brief text last
 * means an edit to the brief still leaves the attachment prefix reusable.
 *
 * Two of the four available breakpoints are spent here:
 *   1. after the attachments — survives brief edits
 *   2. after the brief       — the full hit when the brief is unchanged
 *
 * Below a model's minimum cacheable prefix a breakpoint is a silent no-op: no
 * error, just a zero cache write. That minimum is 512 tokens on Opus 5 but 4096
 * on Haiku 4.5, so a small brief legitimately caches on one model and not another.
 */
export function buildContext({
  brief,
  attachments,
  sector,
  jobTitle,
  draftPrompt,
}: {
  brief: Brief;
  attachments: ContextAttachment[];
  sector: string | null;
  jobTitle: string | null;
  draftPrompt: string;
}): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // ---- Attachments: most stable, so first in the prefix ----
  const readable = attachments.filter((a) => a.role !== "excluded");
  const excluded = attachments.filter((a) => a.role === "excluded");

  for (const file of readable) {
    if (file.anthropic_file_id) {
      const isImage =
        file.mime.startsWith("image/") && file.mime !== "image/svg+xml";
      blocks.push(
        isImage
          ? { type: "image", source: { type: "file", file_id: file.anthropic_file_id } }
          : {
              type: "document",
              source: { type: "file", file_id: file.anthropic_file_id },
              title: file.filename,
            },
      );
      // A file block carries no filename the model can quote reliably, so pair it
      // with a label. The compiled prompt has to name files exactly.
      blocks.push({
        type: "text",
        text: `The preceding file is "${file.filename}" (${ROLE_LABEL[file.role]}).${
          file.description ? ` ${file.description}` : ""
        }`,
      });
      continue;
    }

    if (file.extracted_text) {
      blocks.push({
        type: "text",
        text: `<file name="${file.filename}" role="${ROLE_LABEL[file.role]}">\n${file.extracted_text}\n</file>`,
      });
      continue;
    }

    blocks.push({
      type: "text",
      text: `<file name="${file.filename}" role="${ROLE_LABEL[file.role]}" contents="unavailable" reason="${file.extraction_status}" />`,
    });
  }

  if (excluded.length > 0) {
    blocks.push({
      type: "text",
      text: [
        "These files exist but must NOT be used as sources. The finished prompt should name them and say explicitly that they are not to be used:",
        ...excluded.map((f) => `- ${f.filename}${f.description ? ` — ${f.description}` : ""}`),
      ].join("\n"),
    });
  }

  // Breakpoint 1: everything above survives an edit to the brief below.
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    last.cache_control = { type: "ephemeral" };
  }

  // ---- The brief itself ----
  const role =
    sector || jobTitle
      ? `The person writing this works as ${[jobTitle, sector].filter(Boolean).join(" in ")}.`
      : "";

  const briefText = [
    role,
    "",
    "Their structured brief, one section per labelled box:",
    "",
    ...BRIEF_FIELDS.map((field) => {
      const value = (brief[field.key] ?? "").trim();
      return `## ${field.label}\n${value.length > 0 ? value : "(left blank)"}`;
    }),
    "",
    "## Their own draft of the prompt",
    draftPrompt.trim().length > 0
      ? draftPrompt.trim()
      : "(not written yet)",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  blocks.push({
    type: "text",
    text: briefText,
    // Breakpoint 2: the full hit when the brief hasn't changed between calls.
    cache_control: { type: "ephemeral" },
  });

  return blocks;
}

/** Whether any block cites a file_id, which gates the Files API beta header. */
export function citesFiles(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) => block.type === "document" || block.type === "image",
  );
}

/** How many cache breakpoints the blocks carry. Max 4 per request. */
export function countBreakpoints(blocks: ContentBlock[]): number {
  return blocks.filter((block) => block.cache_control).length;
}
