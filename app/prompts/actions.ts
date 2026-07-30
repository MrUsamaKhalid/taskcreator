"use server";

import { redirect } from "next/navigation";

import type { Brief } from "@/lib/brief";
import { EMPTY_BRIEF } from "@/lib/brief";
import { STORAGE_BUCKET } from "@/lib/config";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type AttachmentRole = Database["public"]["Enums"]["attachment_role"];
type CompileMode = Database["public"]["Enums"]["compile_mode"];
type PromptStatus = Database["public"]["Enums"]["prompt_status"];

/**
 * Pages that read through the Supabase server client are already dynamic
 * (reading cookies opts them out of static rendering), so mutations here do not
 * need cache invalidation — callers trigger a `router.refresh()` when the UI
 * needs to re-read.
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Create a prompt plus its first version, then open it. */
export async function createPrompt() {
  const { supabase, user } = await requireUser();

  // Carry the role forward so you set sector/job title once, not every time.
  const { data: profile } = await supabase
    .from("profiles")
    .select("sector, job_title")
    .eq("id", user.id)
    .maybeSingle();

  const { data: prompt, error: promptError } = await supabase
    .from("prompts")
    .insert({
      user_id: user.id,
      sector: profile?.sector ?? null,
      job_title: profile?.job_title ?? null,
    })
    .select("id")
    .single();

  if (promptError || !prompt) {
    throw new Error(promptError?.message ?? "Could not create the prompt");
  }

  const { data: version, error: versionError } = await supabase
    .from("prompt_versions")
    .insert({
      prompt_id: prompt.id,
      user_id: user.id,
      version_no: 1,
      brief: EMPTY_BRIEF,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Could not create the first version");
  }

  await supabase
    .from("prompts")
    .update({ current_version_id: version.id })
    .eq("id", prompt.id);

  redirect(`/prompts/${prompt.id}`);
}

/** Autosave target for the six brief boxes. */
export async function saveBrief(versionId: string, brief: Brief) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("prompt_versions")
    .update({ brief })
    .eq("id", versionId);
  if (error) throw new Error(error.message);
}

/** Autosave target for step 3, the prompt you'd actually send. */
export async function saveDraftPrompt(versionId: string, draftPrompt: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("prompt_versions")
    .update({ draft_prompt: draftPrompt })
    .eq("id", versionId);
  if (error) throw new Error(error.message);
}

/** Persist which advisory chips have been dismissed. */
export async function saveDismissedChips(versionId: string, chipIds: string[]) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("prompt_versions")
    .update({ dismissed_chips: chipIds })
    .eq("id", versionId);
  if (error) throw new Error(error.message);
}

export async function savePromptMeta(
  promptId: string,
  meta: { title?: string; sector?: string | null; job_title?: string | null },
) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("prompts").update(meta).eq("id", promptId);
  if (error) throw new Error(error.message);

  // Role choices are sticky: remember them on the profile for the next prompt.
  if (meta.sector !== undefined || meta.job_title !== undefined) {
    await supabase.from("profiles").upsert({
      id: user.id,
      ...(meta.sector !== undefined ? { sector: meta.sector } : {}),
      ...(meta.job_title !== undefined ? { job_title: meta.job_title } : {}),
    });
  }
}

export async function setPromptStatus(promptId: string, status: PromptStatus) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("prompts")
    .update({ status })
    .eq("id", promptId);
  if (error) throw new Error(error.message);
}

export async function saveCompiledPrompt(
  versionId: string,
  compiledPrompt: string,
  compileMode: CompileMode,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("prompt_versions")
    .update({ compiled_prompt: compiledPrompt, compile_mode: compileMode })
    .eq("id", versionId);
  if (error) throw new Error(error.message);
}

export async function deletePrompt(promptId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("prompts").delete().eq("id", promptId);
  if (error) throw new Error(error.message);
  redirect("/prompts");
}

/**
 * Fork an existing prompt into a fresh draft.
 *
 * This is what makes the manual-brief-only flow bearable day to day: the second
 * listing prompt starts from the first rather than from an empty form. Copies
 * the brief, the draft prompt, and the attachment rows (pointing at the same
 * storage objects and the same Anthropic file ids, so nothing re-uploads).
 */
export async function duplicatePrompt(promptId: string) {
  const { supabase, user } = await requireUser();

  const { data: source, error: sourceError } = await supabase
    .from("prompts")
    .select("title, sector, job_title, current_version_id")
    .eq("id", promptId)
    .single();

  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? "Could not read that prompt");
  }

  const { data: newPrompt, error: insertError } = await supabase
    .from("prompts")
    .insert({
      user_id: user.id,
      title: `${source.title} (copy)`,
      sector: source.sector,
      job_title: source.job_title,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !newPrompt) {
    throw new Error(insertError?.message ?? "Could not duplicate the prompt");
  }

  const { data: sourceVersion } = source.current_version_id
    ? await supabase
        .from("prompt_versions")
        .select("brief, draft_prompt, dismissed_chips")
        .eq("id", source.current_version_id)
        .maybeSingle()
    : { data: null };

  const { data: newVersion, error: versionError } = await supabase
    .from("prompt_versions")
    .insert({
      prompt_id: newPrompt.id,
      user_id: user.id,
      version_no: 1,
      brief: sourceVersion?.brief ?? EMPTY_BRIEF,
      draft_prompt: sourceVersion?.draft_prompt ?? "",
      dismissed_chips: sourceVersion?.dismissed_chips ?? [],
    })
    .select("id")
    .single();

  if (versionError || !newVersion) {
    throw new Error(versionError?.message ?? "Could not copy the brief");
  }

  if (source.current_version_id) {
    const { data: attachments } = await supabase
      .from("attachments")
      .select(
        "role, filename, mime, size_bytes, storage_path, anthropic_file_id, extracted_text, extraction_status, description",
      )
      .eq("prompt_version_id", source.current_version_id);

    if (attachments?.length) {
      await supabase.from("attachments").insert(
        attachments.map((a) => ({
          ...a,
          prompt_version_id: newVersion.id,
          user_id: user.id,
        })),
      );
    }
  }

  await supabase
    .from("prompts")
    .update({ current_version_id: newVersion.id })
    .eq("id", newPrompt.id);

  redirect(`/prompts/${newPrompt.id}`);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function setAttachmentRole(
  attachmentId: string,
  role: AttachmentRole,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("attachments")
    .update({ role })
    .eq("id", attachmentId);
  if (error) throw new Error(error.message);
}

export async function setAttachmentDescription(
  attachmentId: string,
  description: string,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("attachments")
    .update({ description })
    .eq("id", attachmentId);
  if (error) throw new Error(error.message);
}

/**
 * Delete an attachment row and its stored object.
 *
 * The storage object is removed first: a leftover row pointing at a missing file
 * is a visible, fixable error, whereas a leftover object with no row is invisible
 * and accumulates silently.
 *
 * Note the Anthropic Files API copy is intentionally left in place — it is free
 * to store, keyed by an opaque id nothing else references, and deleting it would
 * break any duplicated prompt that shares the id.
 */
export async function deleteAttachment(attachmentId: string) {
  const { supabase } = await requireUser();

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();

  if (attachment?.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([attachment.storage_path]);
  }

  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) throw new Error(error.message);
}
