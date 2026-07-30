# Deploying to Vercel

Nothing secret lives in this repository or in GitHub. The only secret this app
needs is `ANTHROPIC_API_KEY`, and it belongs in Vercel's encrypted environment
variables.

## 1. Import the repository

Vercel → **Add New** → **Project** → import `MrUsamaKhalid/taskcreator`.

Framework preset, build command, and output directory are all auto-detected —
leave them alone. `packageManager` in `package.json` pins pnpm, so Vercel uses
the same version as local development.

## 2. Environment variables

Set these under **Settings → Environment Variables**, for Production, Preview,
and Development.

| Variable | Value | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://elqthtylusgwwvdslrqu.supabase.co` | No — safe in the browser |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | No — RLS is what protects data |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | **Yes. Server only.** |

Two things to get right:

- **Never prefix the Anthropic key with `NEXT_PUBLIC_`.** That prefix is what
  tells Next.js to inline a value into the client bundle, which would publish
  your key to every visitor.
- The two Supabase values genuinely are public. Row Level Security is the
  protection, not key secrecy — every table is `user_id`-scoped and verified to
  return zero rows to an anonymous caller.

The app builds and deploys fine with `ANTHROPIC_API_KEY` unset. Uploads, the
brief, coverage chips, and autosave all work; only the model-backed features
(review, checklist, compile, test run) need it.

## 3. Supabase redirect allowlist

**This is the step that breaks magic-link sign-in if you skip it.** Supabase
refuses to send users to an origin it doesn't recognise.

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://<your-production-domain>`
- **Redirect URLs**, one entry per line:
  ```
  http://localhost:3000/**
  https://<your-production-domain>/**
  https://taskcreator-*-<your-vercel-scope>.vercel.app/**
  ```

The third line is the wildcard that makes preview deployments work. Sign-in
redirects back to `window.location.origin`, so a preview deploy signs you into
that preview rather than bouncing you to production — but only if its origin
matches an allowlist entry. Copy the exact preview hostname pattern from any
Vercel preview URL.

## 4. Region

`vercel.json` pins functions to `fra1` (Frankfurt) because the Supabase project
is in `eu-central-1` (also Frankfurt). This matters more than it looks:
`proxy.ts` calls `supabase.auth.getUser()` on **every** request, so a
cross-continent hop there would tax every page load. If you ever move the
Supabase project, move this too.

## 5. Function timeouts

The upload route declares `maxDuration = 60`, which is the Hobby plan ceiling.

Worth knowing before the model features land: an Opus 5 test run at high effort
can take **minutes** on a substantial brief. On Hobby that will hit the 60s wall.
Options, in order of preference:

1. Stream the response — a streaming function keeps sending bytes, which avoids
   the idle-connection timeout. This is the planned approach for compile and
   test-run.
2. Vercel Pro, which allows up to 300s.
3. Lower `effort` on the long-running calls.

## 6. First deploy checklist

- [ ] Repository imported, build green
- [ ] Three environment variables set for all three environments
- [ ] `ANTHROPIC_API_KEY` **not** prefixed `NEXT_PUBLIC_`
- [ ] Supabase Site URL set to the production domain
- [ ] Supabase redirect allowlist covers localhost, production, and the preview wildcard
- [ ] Magic-link sign-in tested on the deployed URL, not just locally

## Model provider

This app calls Claude with an API key, billed per token. There is no
subscription-login path for a hosted web app — neither Anthropic nor OpenAI
lets a third-party deployment authenticate with a Claude Max or ChatGPT
Plus/Pro subscription. Those subscriptions entitle you to use their own first-party
clients (Claude Code, the ChatGPT app, Codex CLI), not to route another
application's traffic through them.

If per-token cost is a concern, the levers that actually exist are model choice
and effort per endpoint — see `EFFORT` and `MODEL` in `lib/config.ts`. The
mechanical calls (grading an output against explicit yes/no criteria, drafting
checklist items) hold up well on a cheaper model; the judgement-heavy ones
(review, compile) are where Opus earns its price.
