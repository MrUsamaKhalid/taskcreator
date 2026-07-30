"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createClient().auth.signOut();
          router.replace("/login");
        })
      }
      className="text-sm text-muted underline underline-offset-2 transition hover:text-ink disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
