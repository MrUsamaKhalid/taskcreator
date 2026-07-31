# TaskCreator

Turn a structured brief into a production-grade prompt.

You fill in six labelled boxes — who's asking, context, what you need made,
requirements, style & brand, format & specs — attach the files the task involves,
and the app reviews the brief, drafts an acceptance checklist, compiles a
finished prompt, then test-runs that prompt and scores the result against the
checklist so you can iterate to 100%.

The flow is adapted from Prolific's TaskCrafter, with the purpose inverted:
TaskCrafter manufactures hard evaluation tasks and targets a 20–60% model score.
This targets **100%**, and the deliverable is the prompt itself.

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19.2 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Data / auth / files | Supabase (Postgres + RLS, Auth, Storage) |
| Model | Anthropic Claude (`claude-opus-5`) |
| Hosting | Vercel (`fra1`, co-located with Supabase) |

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev
```

Open http://localhost:3000. Sign-in is a magic link — no password.

Deploying? See [DEPLOYMENT.md](./DEPLOYMENT.md). The step people skip is the
Supabase redirect allowlist, without which magic-link sign-in fails in
production.

### Environment

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Safe to expose. RLS is what protects the data. |
| `ANTHROPIC_API_KEY` | **Server only.** Never prefix with `NEXT_PUBLIC_`. Optional until the model features land. |

There is no site-URL variable: magic links redirect to
`window.location.origin`, so preview deployments sign you into the preview
rather than production, with nothing per-deployment to keep in sync.

## Architecture notes

**Next.js 16 specifics.** `middleware.ts` is renamed to `proxy.ts` with an
exported `proxy` function, and its runtime is always Node.js. `cookies()`,
`headers()`, `params`, and `searchParams` are async-only — synchronous access was
removed, so `await` them everywhere.

**Session handling.** `proxy.ts` refreshes the Supabase session on every request
and gates unauthenticated traffic. It must return the response object carrying
the refreshed cookies — dropping them silently signs the user out.

**Coverage chips** (the green ✓ / amber ✗ pills under each brief box) are plain
client-side regex heuristics in `lib/brief.ts`. No API call, no cost, no latency,
and every chip is dismissible. They are advisory and never block progress.

**Row Level Security.** Every table carries `user_id` and is protected by RLS
using `(select auth.uid())` rather than bare `auth.uid()`, so Postgres evaluates
the subquery once per statement instead of once per row. `user_id` is
denormalised onto child tables so no policy needs a join.

**Model tiering.** Endpoints run on different models by how much judgement each
needs: Sonnet 5 for review, compile and the checklist, Haiku 4.5 for grading,
and Opus 5 for the test run alone. Review and compile started on Opus 5 and
moved for two measured reasons: Opus review took 63.9s against the platform's
60s ceiling, so it failed every time while still billing for the work, and Opus
accounted for 98% of spend ($1.90 of $1.93 across a day) on the two jobs Sonnet
5 is closest to it on. The test run stays on Opus because it is meant to mirror
where the finished prompt will actually be run. `MODEL_CAPS` in `lib/config.ts` records the per-model constraints,
because they are 400s rather than soft failures — Haiku 4.5 rejects
`output_config.effort`, takes no adaptive thinking, and needs a 4096-token prefix
before caching engages at all, against 512 on Opus 5.

**Prompt caching.** Each endpoint uses one byte-identical system prompt and puts
its specific instruction *after* the `cache_control` breakpoint, so the shared
brief prefix is reused rather than re-billed. Caches are scoped per model, so
tiering and caching partly work against each other. Review, compile and the
checklist now share one model and therefore one entry; grade and the test run
each pay their own write. The cheaper per-token rates still win comfortably.

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # production build
pnpm lint       # eslint (next lint was removed in Next.js 16)
pnpm typecheck  # tsc --noEmit
```

CI runs `typecheck`, `lint`, and `build` on every pull request. It needs **no
secrets**: every page that touches Supabase or Anthropic is server-rendered on
demand, so nothing calls out during a build — which is asserted by the build
passing with no environment configured at all.

## Status

Working: auth, prompt library, the three-pane workspace, the six-box brief with
live coverage chips, draft prompt, and autosave.

Next: attachments and text extraction, the Claude wrapper, AI review, checklist
generation, prompt compilation, and test-run scoring.
