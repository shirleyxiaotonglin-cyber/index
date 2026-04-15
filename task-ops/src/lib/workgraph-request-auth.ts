import type { NextRequest } from "next/server";
import { verifyWorkgraphToken } from "@/lib/workgraph-session";

/** Cookie 或 Authorization: Bearer（手机 Safari 跨站常无法写入 Cookie，用 token 兜底） */
export async function getUsernameFromWorkgraphRequest(request: NextRequest): Promise<string | null> {
  const cookie = request.cookies.get("workgraph_session")?.value;
  if (cookie) {
    const u = await verifyWorkgraphToken(cookie);
    if (u) return u;
  }
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return verifyWorkgraphToken(t);
  }
  return null;
}
