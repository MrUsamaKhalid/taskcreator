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

## 3. Create your user, and close the door behind you

Sign-in is email + password. There is **no sign-up form in the app**, on purpose:
this deployment is publicly reachable and holds a server-side Anthropic key, so a
self-serve signup would let a stranger create an account and spend your credit.

Supabase dashboard → **Authentication → Users**:

1. **Add user** → **Create new user**
2. Enter your email and a password
3. Tick **Auto Confirm User** (otherwise it waits on a confirmation email)
4. **Create user**

Then close off signups — Supabase dashboard → **Authentication → Sign In / Providers → Email**:

5. Turn **off** "Allow new users to sign up"
6. **Save**

Without step 5 the app's missing signup form is cosmetic: anyone could still
register straight against your Supabase project's auth endpoint.

There is no in-app password reset, because a reset needs email and email is rate
limited (see below). Keep the password in your password manager; change it from
the dashboard if you lose it.

## 4. Supabase redirect allowlist

Only needed for the "email me a sign-in link instead" fallback. Skip it and
password sign-in still works — the link fallback just fails.

Supabase's built-in email service sends roughly **two auth emails per hour, per
project**, and the limit counts per project rather than per recipient, so trying
a different address does not reset it. It is a testing convenience, not a
delivery service. If you ever want magic links to be usable day to day, put real
SMTP behind it (Resend, Postmark, SES) under **Project Settings → Auth → SMTP**.

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

## 5. Region

`vercel.json` pins functions to `fra1` (Frankfurt) because the Supabase project
is in `eu-central-1` (also Frankfurt). This matters more than it looks:
`proxy.ts` calls `supabase.auth.getUser()` on **every** request, so a
cross-continent hop there would tax every page load. If you ever move the
Supabase project, move this too.

## 6. Function timeouts

The upload route declares `maxDuration = 60`, which is the Hobby plan ceiling.

Worth knowing before the model features land: an Opus 5 test run at high effort
can take **minutes** on a substantial brief. On Hobby that will hit the 60s wall.
Options, in order of preference:

1. Stream the response — a streaming function keeps sending bytes, which avoids
   the idle-connection timeout. This is the planned approach for compile and
   test-run.
2. Vercel Pro, which allows up to 300s.
3. Lower `effort` on the long-running calls.

## 7. First deploy checklist

- [ ] Repository imported, build green
- [ ] Three environment variables set for all three environments
- [ ] `ANTHROPIC_API_KEY` **not** prefixed `NEXT_PUBLIC_`
- [ ] Your user created in Supabase, with **Auto Confirm** ticked
- [ ] **"Allow new users to sign up" turned off** — the one that stops a stranger spending your API credit
- [ ] Password sign-in tested on the deployed URL, not just locally
- [ ] Optional: Supabase Site URL and redirect allowlist, if you want the email-link fallback to work

## Model provider

This app calls Claude with an API key, billed per token. There is no
subscription-login path for a hosted web app — neither Anthropic nor OpenAI
lets a third-party deployment authenticate with a Claude Max or ChatGPT
Plus/Pro subscription. Those subscriptions entitle you to use their own first-party
clients (Claude Code, the ChatGPT app, Codex CLI), not to route another
application's traffic through them.

Cost is managed by tiering models per endpoint — see `ENDPOINT_MODEL` and
`ENDPOINT_EFFORT` in `lib/config.ts`. Review and compile run on Opus 5, the
checklist on Sonnet 5, grading on Haiku 4.5.

Modelled on a substantial brief (≈8k prompt, two attachments, 8k of test-run
output), one full cycle costs about **$0.44** tiered, against **$0.57** all-Opus.
A lean text-only brief lands well under $0.10. Tiering is worth having but it is
not the main lever, and an earlier estimate of $0.15–0.25 was too optimistic.

**The test run dominates.** Output tokens cost 5× input, so a single long
generation outweighs the other four calls combined — in the model above it is
$0.21 of the $0.44. Tiering barely touches it, because `testRun` deliberately
runs on whichever model you intend to use the finished prompt with; that is a
correctness choice, not a cost one. If you want cost down, the levers in order of
effect are: shorten the expected output, run the test on a cheaper model, then
tier the rest.

`MODEL_CAPS` in the same file records why the tiering isn't just a string swap:
Haiku 4.5 rejects `output_config.effort` outright, doesn't take adaptive
thinking, and needs a 4096-token prefix before caching engages at all — against
512 on Opus 5. Sending an unsupported field is a 400, not a soft failure.
