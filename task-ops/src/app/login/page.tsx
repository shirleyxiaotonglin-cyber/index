import { LoginForm } from "./login-form";

/** 避免登录页被静态缓存成「永远加载」 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <LoginForm />
    </div>
  );
}
