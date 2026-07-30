import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

/**
 * Server-side Supabase client for Server Components, Server Actions, and Route
 * Handlers.
 *
 * `cookies()` is async in Next.js 16 — synchronous access was removed, so this
 * factory has to be awaited at every call site.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Safe to swallow: proxy.ts
            // refreshes the session on every request, so the tokens stay fresh.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always uses getUser() rather than getSession() — getUser() revalidates the
 * token against Supabase, whereas getSession() trusts whatever is in the cookie
 * and can therefore be spoofed on the server.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
