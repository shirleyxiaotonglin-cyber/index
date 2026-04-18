import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Adapter } from "next-auth/adapters";
import { GlobalRole } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Vercel 上若误把本地 AUTH_URL=http://localhost:3000 配进环境变量，
 * 登录成功后会跳到本机 3000（ERR_CONNECTION_REFUSED）。
 */
if (process.env.VERCEL) {
  const isLocalhostUrl = (u: string | undefined) =>
    !!u && (u.includes("localhost") || u.includes("127.0.0.1"));
  if (isLocalhostUrl(process.env.AUTH_URL)) {
    delete process.env.AUTH_URL;
  }
  if (isLocalhostUrl(process.env.NEXTAUTH_URL)) {
    delete process.env.NEXTAUTH_URL;
  }
}

/** 未执行 seed 时仍可用演示凭据登录（匹配时 upsert 用户）；ENABLE_DEMO_BOOTSTRAP=false 可关闭 */
async function syncDemoUserIfCredentialsMatch(email: string, plainPassword: string) {
  if (process.env.ENABLE_DEMO_BOOTSTRAP === "false") return;
  const demoEmail = (process.env.DEMO_EMAIL ?? "435236356@qq.com").toLowerCase().trim();
  const demoPass = (process.env.DEMO_PASSWORD ?? "123456").trim();
  if (email !== demoEmail || plainPassword !== demoPass) return;
  const passwordHash = await bcrypt.hash(demoPass, 10);
  await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash },
    create: {
      email: demoEmail,
      name: "演示账号",
      passwordHash,
      globalRole: GlobalRole.ADMIN,
      aiPermissionLevel: 3,
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password).trim();
        try {
          await syncDemoUserIfCredentialsMatch(email, password);
          const user = await prisma.user.findUnique({
            where: { email },
          });
          if (!user?.passwordHash) return null;
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            globalRole: user.globalRole,
          };
        } catch (err) {
          console.error("[auth] credentials authorize failed", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? undefined;
        token.globalRole = (user as { globalRole?: string }).globalRole;
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.globalRole = token.globalRole as string;
      }
      return session;
    },
  },
});
