import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = ["/login", "/health"];

function authSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

/** 根路径与静态单页 index.html 无需登录（与 public/index.html 一致） */
function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/index.html") return true;
  return publicPaths.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  /** public 文件夹下的 .html 等静态页不走登录校验 */
  if (pathname.endsWith(".html")) {
    return NextResponse.next();
  }
  if (isPublicPath(pathname)) {
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
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

/** 必须包含 `/`，且排除 .html，否则根路径与 index.html 行为在部分环境下不一致 */
export const config = {
  matcher: [
    "/",
    "/((?!api|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)",
  ],
};
