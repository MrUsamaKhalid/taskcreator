import { NextResponse, type NextRequest } from "next/server";

import { uploadToAnthropic } from "@/lib/anthropic";
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, STORAGE_BUCKET } from "@/lib/config";
import type { Database } from "@/lib/database.types";
import { extractFile, needsAnthropicUpload } from "@/lib/extract";
import { createClient } from "@/lib/supabase/server";

type AttachmentRole = Database["public"]["Enums"]["attachment_role"];

const VALID_ROLES: AttachmentRole[] = ["input", "brand", "excluded"];

/** Strip anything that could escape the {user}/{prompt}/ prefix. */
function safeName(filename: string): string {
  return (
    filename
      .replace(/[/\\]/g, "_")
      .replace(/\.\.+/g, ".")
      .replace(/[^\w \-.()]/g, "_")
      .slice(0, 120) || "file"
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const versionId = formData.get("versionId");
  const promptId = formData.get("promptId");
  const roleRaw = formData.get("role");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof versionId !== "string" || typeof promptId !== "string") {
    return NextResponse.json(
      { error: "versionId and promptId are required" },
      { status: 400 },
    );
  }

  const role: AttachmentRole =
    typeof roleRaw === "string" && VALID_ROLES.includes(roleRaw as AttachmentRole)
      ? (roleRaw as AttachmentRole)
      : "input";

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }

  // The version must belong to this user. RLS would block the insert anyway,
  // but checking here returns a clear error instead of a constraint failure.
  const { data: version } = await supabase
    .from("prompt_versions")
    .select("id")
    .eq("id", versionId)
    .maybeSingle();

  if (!version) {
    return NextResponse.json({ error: "Unknown prompt version" }, { status: 404 });
  }

  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("prompt_version_id", versionId);

  if ((count ?? 0) >= MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `You can attach at most ${MAX_ATTACHMENTS} files to one prompt.` },
      { status: 409 },
    );
  }

  const bytes = await file.arrayBuffer();
  const mime = file.type || "application/octet-stream";
  const cleanName = safeName(file.name);
  const storagePath = `${user.id}/${promptId}/${crypto.randomUUID()}-${cleanName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const extraction = await extractFile(file.name, mime, bytes);

  // Best effort: a missing key or a transient Files API failure must not lose the
  // upload. The id is backfilled the first time the file is actually needed.
  let anthropicFileId: string | null = null;
  if (needsAnthropicUpload(extraction.delivery)) {
    try {
      anthropicFileId = await uploadToAnthropic(file.name, mime, bytes);
    } catch {
      anthropicFileId = null;
    }
  }

  const { data: attachment, error: insertError } = await supabase
    .from("attachments")
    .insert({
      prompt_version_id: versionId,
      user_id: user.id,
      role,
      filename: file.name,
      mime,
      size_bytes: file.size,
      storage_path: storagePath,
      anthropic_file_id: anthropicFileId,
      extracted_text: extraction.text,
      extraction_status: extraction.status,
    })
    .select("id, filename, mime, size_bytes, role, extraction_status")
    .single();

  if (insertError) {
    // Don't leave an orphaned object behind if the row failed to write.
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ attachment });
}
