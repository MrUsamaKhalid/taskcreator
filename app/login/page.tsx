import { APP_NAME, APP_TAGLINE } from "@/lib/config";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  // searchParams is a Promise in Next.js 16 — synchronous access was removed.
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted">{APP_TAGLINE}</p>

        <div className="mt-8 rounded-lg border border-line bg-panel p-5">
          <LoginForm next={next} />
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">
            {error === "missing_token"
              ? "That sign-in link was incomplete. Request a new one."
              : error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
