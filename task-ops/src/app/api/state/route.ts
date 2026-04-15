import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { workgraphJson, workgraphPreflightHeaders } from "@/lib/workgraph-cors";
import { getUsernameFromWorkgraphRequest } from "@/lib/workgraph-request-auth";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: workgraphPreflightHeaders(request) });
}

export async function PUT(request: NextRequest) {
  try {
    const username = await getUsernameFromWorkgraphRequest(request);
    if (!username) {
      return workgraphJson(request, { ok: false, error: "未登录" }, { status: 401 });
    }
    const body = (await request.json()) as { state?: unknown };
    if (body.state === undefined) {
      return workgraphJson(request, { ok: false, error: "缺少 state" }, { status: 400 });
    }
    await prisma.workgraphAccount.update({
      where: { username },
      data: { state: body.state as object },
    });
    return workgraphJson(request, { ok: true });
  } catch {
    return workgraphJson(request, { ok: false, error: "保存失败" }, { status: 500 });
  }
}
