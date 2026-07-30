import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + route protection.
 *
 * In Next.js 16 the `middleware` file convention was renamed to `proxy`, and the
 * exported function must be named `proxy` (or be the default export). The proxy
 * runtime is always Node.js — `edge` is not supported here and cannot be
 * configured.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // Rebuild the response so it carries the refreshed request cookies,
          // then mirror them onto the outgoing response. Returning a response
          // that lacks these cookies silently logs the user out.
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase on every request. This call
  // is what actually performs the refresh — do not remove it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isAuthRoute) {
    const redirectTo = new URL("/login", request.url);
    if (pathname !== "/") {
      redirectTo.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(redirectTo);
  }

  if (user && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/prompts", request.url));
  }

  return response;
}

export const config = {
  // Without a matcher the proxy runs on every request including static assets,
  // which would put an auth redirect in front of CSS and JS. Exclude those, and
  // exclude /api so route handlers return JSON errors instead of an HTML
  // redirect — they do their own auth check.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
