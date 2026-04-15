import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Suspense fallback={<div className="text-muted-foreground">加载…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
