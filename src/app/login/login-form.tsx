"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEMO_EMAIL = "435236356@qq.com";
const DEMO_PASSWORD = "123456";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signInWithCredentials(em: string, pw: string) {
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email: em,
      password: pw,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setError("登录失败，请检查邮箱与密码。");
      return;
    }
    window.location.href = callbackUrl;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signInWithCredentials(email, password);
  }

  useEffect(() => {
    const demo = searchParams.get("demo");
    if (demo !== "1" && demo !== "true") return;
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem("taskops_demo_auto_login") === "1") return;
      if (typeof window !== "undefined") sessionStorage.setItem("taskops_demo_auto_login", "1");
    } catch {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await signIn("credentials", {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        redirect: false,
        callbackUrl,
      });
      if (cancelled) return;
      setLoading(false);
      if (res?.error) {
        setError("登录失败，请检查邮箱与密码。");
        return;
      }
      window.location.href = callbackUrl;
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, callbackUrl]);

  return (
    <Card className="w-full max-w-md border-border/80">
      <CardHeader>
        <CardTitle>Task Ops</CardTitle>
        <CardDescription>企业任务执行透明化 — 请登录</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
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
            {loading ? "登录中…" : "登录"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={loading}
            onClick={() => void signInWithCredentials(DEMO_EMAIL, DEMO_PASSWORD)}
          >
            演示账号一键登录
          </Button>
          <p className="text-xs text-muted-foreground">
            演示账号：{DEMO_EMAIL} / {DEMO_PASSWORD}（未跑 seed 时首次登录会自动创建）
          </p>
          <p className="text-xs text-muted-foreground">
            访问 <span className="font-mono">/login?demo=1</span> 可自动以演示账号登录
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
