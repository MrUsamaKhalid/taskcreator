"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

/** Only allow relative paths, so a crafted ?next= can't bounce you off-site. */
function safeNext(next: string | undefined): string {
  if (!next) return "/prompts";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/prompts";
}

/**
 * Password sign-in, with a magic link kept as a fallback.
 *
 * There is deliberately no sign-up form. This is a single-user tool deployed on
 * a public URL with a server-side Anthropic key — a self-serve signup would let
 * anyone create an account and spend that credit. The one user is created in the
 * Supabase dashboard, and "allow new users to sign up" should be off.
 *
 * Password is the default path because Supabase's built-in email service only
 * sends a couple of auth mails per hour per project, which makes magic links
 * unusable as a daily sign-in.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setPending(true);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPending(false);

    if (error) {
      // Supabase returns the same generic message for a wrong password and an
      // unknown address, which is correct — it avoids confirming which emails
      // have accounts. Add the likely cause without undoing that.
      toast.error(
        error.message === "Invalid login credentials"
          ? "Wrong email or password. If you haven't set one yet, add it in the Supabase dashboard."
          : error.message,
      );
      return;
    }

    router.replace(safeNext(next));
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      toast.error("Enter your email first.");
      return;
    }

    setPending(true);
    const redirectTo = new URL("/auth/confirm", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo.toString() },
    });
    setPending(false);

    if (error) {
      toast.error(
        error.message.toLowerCase().includes("rate limit")
          ? "Supabase's built-in email limit is used up — it resets hourly. Use your password instead."
          : error.message,
      );
      return;
    }

    setLinkSent(true);
  }

  if (linkSent) {
    return (
      <div className="text-sm">
        <p className="font-medium text-navy">Check your email</p>
        <p className="mt-1 text-muted">
          We sent a sign-in link to <span className="font-medium">{email}</span>.
          Open it on this device.
        </p>
        <button
          type="button"
          onClick={() => setLinkSent(false)}
          className="mt-3 text-accent underline underline-offset-2"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={signInWithPassword} className="space-y-3">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white transition hover:bg-navy-soft disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="border-t border-line-soft pt-3">
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={pending}
          className="text-xs text-muted underline underline-offset-2 transition hover:text-ink disabled:opacity-50"
        >
          Email me a sign-in link instead
        </button>
        <p className="mt-1 text-xs text-faint">
          Fallback only — Supabase&apos;s built-in email allows just a couple of
          messages per hour.
        </p>
      </div>
    </form>
  );
}
