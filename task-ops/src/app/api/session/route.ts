import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { workgraphJson, workgraphPreflightHeaders } from "@/lib/workgraph-cors";
import { getUsernameFromWorkgraphRequest } from "@/lib/workgraph-request-auth";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: workgraphPreflightHeaders(request) });
}

export async function GET(request: NextRequest) {
  try {
    const username = await getUsernameFromWorkgraphRequest(request);
    if (!username) {
      return workgraphJson(request, { ok: false });
    }
    const row = await prisma.workgraphAccount.findUnique({ where: { username } });
    if (!row) {
      return workgraphJson(request, { ok: false });
    }
    return workgraphJson(request, {
      ok: true,
      username,
      ...(row.state != null ? { state: row.state } : {}),
    });
  } catch {
    return workgraphJson(request, { ok: false }, { status: 500 });
  }
}
