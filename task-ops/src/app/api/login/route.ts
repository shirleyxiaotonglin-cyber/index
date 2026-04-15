import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { workgraphJson, workgraphPreflightHeaders } from "@/lib/workgraph-cors";
import { signWorkgraphToken, workgraphCookieOptions } from "@/lib/workgraph-session";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: workgraphPreflightHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (username.length < 2) {
      return workgraphJson(request, { ok: false, error: "用户名至少 2 个字符" }, { status: 400 });
    }
    if (password.length < 6) {
      return workgraphJson(request, { ok: false, error: "密码至少 6 位" }, { status: 400 });
    }
    const token = await signWorkgraphToken(username);
    if (!token) {
      return workgraphJson(request, { ok: false, error: "服务器未配置 AUTH_SECRET" }, { status: 503 });
    }
    const row = await prisma.workgraphAccount.findUnique({ where: { username } });
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      return workgraphJson(request, { ok: false, error: "用户名或密码错误" }, { status: 401 });
    }
    const res = workgraphJson(request, { ok: true, username, token });
    res.cookies.set("workgraph_session", token, workgraphCookieOptions());
    return res;
  } catch {
    return workgraphJson(request, { ok: false, error: "服务器错误" }, { status: 500 });
  }
}
