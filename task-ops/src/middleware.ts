import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = ["/login", "/health"];

function authSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  /** 静态协作页（public/workgraph.html），使用独立账号体系，不走 NextAuth 中间件 */
  if (pathname === "/workgraph.html") {
    return NextResponse.next();
  }
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const secret = authSecret();
  let token = null;
  try {
    token = secret
      ? await getToken({
          req: request,
          secret,
        })
      : null;
  } catch {
    token = null;
  }

  if (!token && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

/** 必须排除整个 `/_next`（含 webpack-hmr、turbopack 等），否则未登录时会把资源请求重定向到 /login，页面无法打开。 */
export const config = {
  matcher: [
    "/((?!api|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
