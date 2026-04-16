# 部署到互联网（多人使用）

`task-ops` 是 **Next.js + PostgreSQL + NextAuth** 应用。部署后，团队成员通过 **HTTPS 网址** 登录，数据集中在数据库中，实现多人协作。

---

## 一、你需要准备什么

1. **代码仓库**：把 `task-ops` 推到 GitHub / GitLab（私有仓库即可）。
2. **PostgreSQL 云数据库**（任选其一）：
   - [Neon](https://neon.tech/)（免费额度，与 Vercel 配合文档多）
   - [Supabase](https://supabase.com/) PostgreSQL
   - [Railway](https://railway.app/) / 自建云数据库
3. **部署平台**（推荐 **Vercel**，与 Next.js 同生态）：
   - 注册 [Vercel](https://vercel.com/)，用 GitHub 导入项目。

---

## 二、创建云数据库（以 Neon 为例）

1. 在 Neon 新建 Project，创建一个数据库。
2. 复制 **Connection string**（选择 **Pooled** 或带 `?sslmode=require` 的 URL）。
3. 若 Neon 同时提供 **Direct** 连接串，迁移大表时可用；仅用 `prisma db push` 时，**一条 `DATABASE_URL` 即可**。

---

## 三、在 Vercel 配置环境变量

在 Vercel 项目 → **Settings** → **Environment Variables** 中添加：

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 连接串（必须含 `sslmode=require` 若云厂商要求） |
| `AUTH_SECRET` | 随机长字符串，本地生成：`openssl rand -base64 32` |
| `AUTH_URL` | **部署后的站点根地址**，例如 `https://你的项目.vercel.app` 或自定义域名 `https://taskops.company.com` |

**重要：** 每次更换正式域名，都要把 `AUTH_URL` 改成新地址并重新部署，否则登录、回调可能异常。

可选（AI 真实接口）：

| `OPENROUTER_API_KEY` | OpenRouter API Key |
| `OPENAI_BASE_URL` | 默认 `https://api.openai.com/v1` |

保存后，对 **Production**（及需要的话 **Preview**）勾选这些变量。

---

## 四、首次部署后的数据库初始化

Vercel 完成第一次 **Build** 后，你需要在**能访问生产库**的环境里执行（任选一种方式）：

### 方式 A：本地电脑执行（DATABASE_URL 指向生产库）

```bash
cd task-ops
cp .env.example .env
# 编辑 .env：DATABASE_URL、AUTH_SECRET、AUTH_URL 与 Vercel 中一致

npm install
npx prisma db push
npm run db:seed
```

### 方式 B：在 CI 或一次性脚本中执行

保证 `DATABASE_URL` 与生产相同，同样执行 `prisma db push` 与 `db:seed`。

**注意：** `db:seed` 会写入演示账号（见 `prisma/seed.ts`）。生产环境请在首次登录后 **修改密码**，并仅向可信人员分发账号；当前版本**没有**自助注册页，新增用户可通过 Prisma Studio 或后续管理功能添加。

```bash
npx prisma studio
```

---

## 五、自定义域名（可选）

在 Vercel → **Domains** 绑定域名，DNS 按提示配置。然后把环境变量 **`AUTH_URL`** 改为 `https://你的域名`，再 **Redeploy** 一次。

---

## 六、多人使用说明

- 每个用户使用 **自己的邮箱 + 密码** 登录（数据库中一条 `User` 记录）。
- **项目成员**：在项目设置里按邮箱添加成员并分配角色（与代码中权限逻辑一致）。
- 所有任务、评论、通知数据均在 **PostgreSQL** 中，不依赖单机浏览器缓存。

---

## 七、常见问题

| 现象 | 处理 |
|------|------|
| 构建失败 `Prisma Client` | 本仓库 `build` 已包含 `prisma generate`；确认 `postinstall` 未被禁用。 |
| 登录后立刻退出 / OAuth 异常 | 检查 `AUTH_URL` 是否与浏览器地址完全一致（含 `https`、无末尾多余 `/`）。 |
| 数据库连接超时 | 使用云厂商提供的 **连接池** URL；检查防火墙是否允许 Vercel 出口 IP（多数云库默认允许）。 |
| 仅自己可访问 | 确认站点为公网 HTTPS；检查公司网络是否拦截。 |

---

## 八、其他托管方式

- **Railway / Render / Fly.io**：使用 Node 或 Docker 运行 `npm run build` 与 `npm run start`，同样配置上述环境变量，并确保进程能访问公网 PostgreSQL。
- **自建 VPS**：`NODE_ENV=production` 下运行 `next start`，前面加 Nginx 与 HTTPS 证书。

---

部署完成后，把 **`AUTH_URL` 对应的地址** 发给团队即可多人同时使用。
