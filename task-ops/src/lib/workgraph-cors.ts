import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const DEFAULT_ORIGINS = [
  "https://task-ops-static.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function allowedOrigins(): string[] {
  const raw = process.env.WORKGRAPH_STATIC_ORIGINS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ORIGINS;
}

/** 返回可反射的 Origin，或 null（同域 / 无 Origin 请求不写 CORS） */
export function workgraphAllowOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const list = allowedOrigins();
  return list.includes(origin) ? origin : null;
}

export function applyWorkgraphCors(request: NextRequest, headers: Headers) {
  const o = workgraphAllowOrigin(request);
  if (o) {
    headers.set("Access-Control-Allow-Origin", o);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
}

export function workgraphPreflightHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  applyWorkgraphCors(request, headers);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Auth-Return-Redirect, Authorization",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function workgraphJson(request: NextRequest, data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  applyWorkgraphCors(request, headers);
  return NextResponse.json(data, { ...init, headers });
}
