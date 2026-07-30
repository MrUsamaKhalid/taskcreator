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

**Prompt caching.** The Claude endpoints share one byte-identical system prompt
and place the endpoint-specific instruction *after* the `cache_control`
breakpoint, so review / checklist / compile / grade calls on the same brief all
read a single cache entry rather than writing four.

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
