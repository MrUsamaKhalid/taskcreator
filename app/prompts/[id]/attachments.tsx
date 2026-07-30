"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { MAX_ATTACHMENTS } from "@/lib/config";
import type { Database } from "@/lib/database.types";

import { deleteAttachment, setAttachmentRole } from "../actions";

type AttachmentRole = Database["public"]["Enums"]["attachment_role"];
type ExtractionStatus = Database["public"]["Enums"]["extraction_status"];

export type AttachmentRow = {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  role: AttachmentRole;
  extraction_status: ExtractionStatus;
};

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.csv,.tsv,.json,.docx,.xlsx,.xls,.html,.xml,.yml,.yaml";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What Claude will actually be able to see, in plain language. */
function readability(row: AttachmentRow): { label: string; tone: string } {
  if (row.mime === "application/pdf") {
    return { label: "read as a document", tone: "text-good" };
  }
  if (row.mime.startsWith("image/") && row.mime !== "image/svg+xml") {
    return { label: "read as an image", tone: "text-good" };
  }
  switch (row.extraction_status) {
    case "ok":
      return { label: "text extracted", tone: "text-good" };
    case "failed":
      return { label: "could not read contents", tone: "text-warn" };
    case "unsupported":
      return { label: "name only — contents unreadable", tone: "text-warn" };
    default:
      return { label: "attached", tone: "text-muted" };
  }
}

export function Attachments({
  promptId,
  versionId,
  attachments,
  onChange,
}: {
  promptId: string;
  versionId: string;
  attachments: AttachmentRow[];
  onChange: (next: AttachmentRow[]) => void;
}) {
  const inputs = attachments.filter((a) => a.role !== "excluded");
  const excluded = attachments.filter((a) => a.role === "excluded");

  return (
    <div className="space-y-5">
      <DropZone
        promptId={promptId}
        versionId={versionId}
        role="input"
        title="Input files"
        hint="the files the task actually needs"
        note={`Up to ${MAX_ATTACHMENTS} files, 20 MB each. PDFs and images are read natively; spreadsheets, documents and text files are extracted to text.`}
        rows={inputs}
        attachments={attachments}
        onChange={onChange}
      />

      <DropZone
        promptId={promptId}
        versionId={versionId}
        role="excluded"
        title="Excluded files"
        hint="files that exist but must not be used"
        note="Optional. Superseded token sheets, old exports, last year's data — anything the compiled prompt should explicitly tell the AI to ignore."
        rows={excluded}
        attachments={attachments}
        onChange={onChange}
      />
    </div>
  );
}

function DropZone({
  promptId,
  versionId,
  role,
  title,
  hint,
  note,
  rows,
  attachments,
  onChange,
}: {
  promptId: string;
  versionId: string;
  role: AttachmentRole;
  title: string;
  hint: string;
  note: string;
  rows: AttachmentRow[];
  attachments: AttachmentRow[];
  onChange: (next: AttachmentRow[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    if (attachments.length + list.length > MAX_ATTACHMENTS) {
      toast.error(`That would exceed the ${MAX_ATTACHMENTS} file limit.`);
      return;
    }

    setUploading((current) => [...current, ...list.map((f) => f.name)]);

    // Sequential rather than parallel: uploads share one Supabase Storage
    // connection and one Files API rate limit, and a clear per-file error beats
    // a race where three failures surface as one toast.
    let added: AttachmentRow[] = [];
    for (const file of list) {
      const body = new FormData();
      body.set("file", file);
      body.set("versionId", versionId);
      body.set("promptId", promptId);
      body.set("role", role);

      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = (await response.json()) as {
          attachment?: AttachmentRow;
          error?: string;
        };

        if (!response.ok || !payload.attachment) {
          toast.error(payload.error ?? `Could not upload ${file.name}`);
        } else {
          added = [...added, payload.attachment];
        }
      } catch {
        toast.error(`Could not upload ${file.name}`);
      } finally {
        setUploading((current) => current.filter((name) => name !== file.name));
      }
    }

    if (added.length > 0) onChange([...attachments, ...added]);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) void upload(event.dataTransfer.files);
  }

  return (
    <div>
      <p className="text-sm font-semibold text-navy">
        {title} <span className="font-normal italic text-faint">{hint}</span>
      </p>
      <p className="mt-1 text-xs text-muted">{note}</p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={(event) => {
          if (event.clipboardData.files.length > 0) {
            void upload(event.clipboardData.files);
          }
        }}
        className={`mt-2 rounded-md border border-dashed px-4 py-5 text-center transition ${
          dragging ? "border-accent bg-accent/5" : "border-line bg-panel"
        }`}
      >
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="text-sm text-accent underline underline-offset-2"
        >
          Drag &amp; drop files here, paste, or click to browse
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {(rows.length > 0 || uploading.length > 0) && (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => {
            const read = readability(row);
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink">
                  {row.filename}
                </span>
                <span className="shrink-0 text-faint">{formatSize(row.size_bytes)}</span>
                <span className={`shrink-0 ${read.tone}`}>{read.label}</span>

                <select
                  value={row.role}
                  aria-label={`Role for ${row.filename}`}
                  onChange={(event) => {
                    const nextRole = event.target.value as AttachmentRole;
                    onChange(
                      attachments.map((a) =>
                        a.id === row.id ? { ...a, role: nextRole } : a,
                      ),
                    );
                    startTransition(async () => {
                      try {
                        await setAttachmentRole(row.id, nextRole);
                      } catch {
                        toast.error("Could not change that file's role");
                      }
                    });
                  }}
                  className="shrink-0 rounded border border-line bg-white px-1.5 py-0.5 text-xs"
                >
                  <option value="input">Input file</option>
                  <option value="brand">Brand reference</option>
                  <option value="excluded">Do not use</option>
                </select>

                <button
                  type="button"
                  aria-label={`Remove ${row.filename}`}
                  onClick={() => {
                    onChange(attachments.filter((a) => a.id !== row.id));
                    startTransition(async () => {
                      try {
                        await deleteAttachment(row.id);
                      } catch {
                        toast.error("Could not remove that file");
                      }
                    });
                  }}
                  className="shrink-0 px-1 text-faint transition hover:text-bad"
                >
                  ×
                </button>
              </li>
            );
          })}

          {uploading.map((name) => (
            <li
              key={`uploading-${name}`}
              className="flex items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs text-faint"
            >
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="shrink-0">uploading…</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
