"use client";

import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function normalizeCallbackUrl(raw: string | null): string {
  if (!raw || raw === "") return "/";
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw.split("?")[0] || "/";
    const u = new URL(raw);
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return `${u.pathname}${u.search}` || "/";
    }
    return "/";
  } catch {
    return "/";
  }
}

function absoluteCallbackUrl(callbackPath: string) {
  const path = callbackPath.startsWith("/") ? callbackPath : "/";
  return `${window.location.origin}${path}`;
}

/**
 * 不用 next-auth 的 signIn(redirect:false)：其内部会对 data.url 做 `new URL(data.url)`，
 * 服务端若返回相对路径（如 `/`）会抛错，导致登录永远失败。
 * 与官方客户端相同：POST /api/auth/callback/credentials + form body。
 */
async function postCredentialsSignIn(
  email: string,
  password: string,
  callbackPath: string,
): Promise<{ ok: true } | { ok: false; errorCode?: string; serverError?: boolean }> {
  try {
    const callbackUrl = absoluteCallbackUrl(callbackPath);
    const csrfToken = await getCsrfToken();
    if (!csrfToken) {
      return { ok: false, serverError: true };
    }
    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        csrfToken,
        callbackUrl,
      }),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (res.ok) {
      let target = callbackUrl;
      if (typeof data.url === "string" && data.url.trim()) {
        const u = data.url.trim();
        if (/^https?:\/\//i.test(u)) {
          target = u;
        } else if (u.startsWith("/")) {
          target = `${window.location.origin}${u}`;
        }
      }
      window.location.replace(target);
      return { ok: true };
    }
    if (res.status >= 500) {
      return { ok: false, serverError: true };
    }
    let errorCode: string | undefined;
    if (typeof data.url === "string") {
      try {
        const u = new URL(data.url, window.location.origin);
        errorCode = u.searchParams.get("error") ?? undefined;
      } catch {
        // ignore
      }
    }
    return { ok: false, errorCode };
  } catch {
    return { ok: false, serverError: true };
  }
}

const DEMO_EMAIL = "435236356@qq.com";
const DEMO_PASSWORD = "123456";

export function LoginForm() {
  /** 不用 useSearchParams（生产上曾导致 Suspense 一直挂起，页面只显示「加载…」） */
  const [callbackPath, setCallbackPath] = useState("/");
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const path = normalizeCallbackUrl(params.get("callbackUrl"));
      setCallbackPath(path);
      const demo = params.get("demo");
      if (demo !== "1" && demo !== "true") return;
      if (sessionStorage.getItem("taskops_demo_url_auto") === "1") return;
      sessionStorage.setItem("taskops_demo_url_auto", "1");
      let cancelled = false;
      void (async () => {
        setLoading(true);
        setError(null);
        const result = await postCredentialsSignIn(DEMO_EMAIL, DEMO_PASSWORD, path);
        if (cancelled) return;
        setLoading(false);
        if (result.ok) return;
        if (result.serverError) {
          setError("服务暂时不可用，请稍后重试。若持续失败，请确认 Vercel 已配置 DATABASE_URL、AUTH_SECRET，并已执行 prisma migrate deploy。");
          return;
        }
        setError("登录失败，请检查邮箱与密码。");
      })();
      return () => {
        cancelled = true;
      };
    } catch {
      setCallbackPath("/");
    }
  }, []);
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function doSignIn(userEmail: string, userPassword: string) {
    const result = await postCredentialsSignIn(userEmail, userPassword, callbackPath);
    if (result.ok) return;
    if (result.serverError) {
      setError("服务暂时不可用，请稍后重试。若持续失败，请确认 Vercel 已配置 DATABASE_URL、AUTH_SECRET，并已执行 prisma migrate deploy。");
      return;
    }
    setError("登录失败，请检查邮箱与密码。");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "register") {
        const resp = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setError(data?.error || "注册失败，请稍后重试。");
          return;
        }
      }
      await doSignIn(email, password);
    } catch {
      setError(mode === "login" ? "登录失败，请检查邮箱与密码。" : "操作失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function onDemoLogin() {
    setLoading(true);
    setError(null);
    try {
      await doSignIn(DEMO_EMAIL, DEMO_PASSWORD);
    } catch {
      setError("演示账号登录失败，请检查网络或稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/80">
      <CardHeader>
        <CardTitle>Task Ops</CardTitle>
        <CardDescription>
          企业任务执行透明化 — {mode === "login" ? "请登录" : "创建账号"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "register" ? (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">昵称</label>
              <Input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入昵称"
                required
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">邮箱</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">密码</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "提交中…" : mode === "login" ? "登录" : "注册并登录"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={loading}
            onClick={onDemoLogin}
          >
            直接使用演示账号登录
          </Button>
          <div className="text-center text-sm">
            {mode === "login" ? (
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                没有账号？去注册
              </button>
            ) : (
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                已有账号？去登录
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            演示账号：{DEMO_EMAIL} / {DEMO_PASSWORD}（未跑 seed 时首次登录会自动创建）
          </p>
          <p className="text-xs text-muted-foreground">
            访问 /login?demo=1 可自动以演示账号登录
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
