import Link from "next/link";

import { StatusDot } from "@/components/status-dot";
import { APP_NAME } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

import { NewPromptButton } from "./new-prompt-button";
import { SignOutButton } from "./sign-out-button";

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("prompts")
    .select("id, title, status, updated_at, current_version_id")
    .order("updated_at", { ascending: false });

  if (q?.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }

  const { data: prompts, error } = await query;

  // Latest score per prompt. Fetched separately and merged rather than joined —
  // a nested PostgREST select here would need a lateral limit-1 that the client
  // can't express cleanly.
  const versionIds = (prompts ?? [])
    .map((p) => p.current_version_id)
    .filter((id): id is string => Boolean(id));

  const scoreByVersion = new Map<string, number>();
  if (versionIds.length > 0) {
    const { data: runs } = await supabase
      .from("test_runs")
      .select("prompt_version_id, score_pct, created_at")
      .in("prompt_version_id", versionIds)
      .order("created_at", { ascending: false });

    for (const run of runs ?? []) {
      if (run.score_pct === null) continue;
      if (!scoreByVersion.has(run.prompt_version_id)) {
        scoreByVersion.set(run.prompt_version_id, Number(run.score_pct));
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted">
            {prompts?.length
              ? `${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`
              : "No prompts yet"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SignOutButton />
          <NewPromptButton />
        </div>
      </div>

      <form className="mt-8" action="/prompts">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search prompts…"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </form>

      {error ? (
        <p className="mt-6 rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">
          {error.message}
        </p>
      ) : null}

      {prompts && prompts.length > 0 ? (
        <ul className="mt-6 divide-y divide-line-soft rounded-lg border border-line">
          {prompts.map((prompt) => {
            const score = prompt.current_version_id
              ? scoreByVersion.get(prompt.current_version_id)
              : undefined;
            return (
              <li key={prompt.id}>
                <Link
                  href={`/prompts/${prompt.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-panel"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-navy">
                      {prompt.title}
                    </span>
                    <span className="mt-1 flex items-center gap-3">
                      <StatusDot status={prompt.status} />
                      <span className="text-xs text-faint">
                        {formatWhen(prompt.updated_at)}
                      </span>
                    </span>
                  </span>
                  {score !== undefined ? (
                    <span
                      className={`shrink-0 text-sm font-medium ${
                        score >= 100 ? "text-good" : score >= 75 ? "text-warn" : "text-bad"
                      }`}
                    >
                      {Math.round(score)}%
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-panel px-6 py-12 text-center">
          <p className="text-sm font-medium text-navy">Start your first prompt</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            You fill in a structured brief — who&apos;s asking, context, what you
            need made, requirements, style, format — and get back a prompt worth
            pasting into an AI.
          </p>
          <div className="mt-5 flex justify-center">
            <NewPromptButton />
          </div>
        </div>
      )}
    </main>
  );
}
