import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing route.
 *
 * Supabase emails a link carrying `token_hash` + `type`; exchanging them here
 * sets the session cookies via the server client before we redirect onward.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/prompts";

  // Only allow relative paths, so a crafted link can't bounce you off-site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/prompts";

  if (!tokenHash || !type) {
    redirect("/login?error=missing_token");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(safeNext);
}
