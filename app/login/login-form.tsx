"use client";

import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setPending(true);
    const supabase = createClient();

    // Always send the link back to the origin the user is actually on. That way
    // a Vercel preview deployment signs you into that preview rather than
    // bouncing you to production, and there is no per-deployment env var to keep
    // in sync — the only requirement is that Supabase's redirect allowlist
    // covers the origin (see DEPLOYMENT.md).
    const redirectTo = new URL("/auth/confirm", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo.toString() },
    });

    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-sm">
        <p className="font-medium text-navy">Check your email</p>
        <p className="mt-1 text-muted">
          We sent a sign-in link to <span className="font-medium">{email}</span>.
          Open it on this device.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 text-accent underline underline-offset-2"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white transition hover:bg-navy-soft disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      <p className="text-xs text-faint">
        No password. We email you a one-time link.
      </p>
    </form>
  );
}
