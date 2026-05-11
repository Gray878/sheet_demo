# Supabase Postgres、Vercel 与 PayPal 部署说明

本项目本地开发时可以不配置 Postgres；未配置 `DATABASE_URL` 时，会使用本地文件作为开发 fallback。部署到 Vercel 后必须使用 Supabase Postgres，因为 serverless 环境中的文件存储不会持久化。数据库访问统一通过 Drizzle ORM 和 `DATABASE_URL` 完成。

支付使用 PayPal JavaScript SDK + 服务端 Orders API：浏览器只负责渲染 PayPal 按钮并触发回调，订单创建、capture、金额校验、session 校验和订阅解锁都在服务端完成，`PAYPAL_CLIENT_SECRET` 不会暴露给前端。

## 1. 创建 Supabase 项目

先创建 Supabase 项目，然后在 Project Settings -> Database -> Connection string 复制 Postgres 连接串。Vercel/serverless 环境建议使用 transaction pooler URI，并保持应用侧不启用 prepared statements。

```env
DATABASE_URL=postgres://...
```

本项目不需要配置 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY`，因为浏览器不会直接访问 Supabase，所有数据库读写都在服务端 Route Handlers 中完成。

## 2. 创建数据表

在新的 Supabase 数据库上使用 Drizzle migrations 创建表结构：

```bash
pnpm db:migrate
```

Drizzle schema 的源码位置：

```text
src/server/db/schema.ts
```

生成的 SQL migration 文件位置：

```text
supabase/migrations/
```

后续如果需要修改表结构，先编辑 `src/server/db/schema.ts`，再生成并执行 migration：

```bash
pnpm db:generate
pnpm db:migrate
```

本项目使用 migration，而不是 `drizzle-kit push`。`push` 会在同步前 introspect 远程数据库，当前 Supabase/Postgres 的 check constraint 可能触发 Drizzle Kit 读取约束时报错。如果目标数据库之前已经通过手动 SQL 或 `push` 创建过这些表，只要 `pnpm seed` 后能正常运行，可以继续使用；如果需要让 Drizzle migration 接管，可以补一条 baseline migration 记录，或者换一个空库重新执行 `pnpm db:migrate`。

当前 schema 会创建：

- `funnels`、`funnel_steps`、`answer_options`
- `assessment_sessions`、`assessment_answers`、`assessment_results`
- `payments`
- 外键、session 查询、答案 upsert、有效订阅等常用路径的索引
- 所有表启用 RLS

应用通过服务端 Route Handlers 直连 Postgres。保留 RLS 可以避免未来误接 Supabase browser client 时产生意外的客户端数据访问风险。

## 3. 导入 Funnel 数据

从 `.env.example` 复制一份本地 `.env`，填入 `DATABASE_URL`，然后执行：

```bash
pnpm seed
```

seed 脚本会导入基于 BetterMe 公开数据整理出的完整 funnel 数据，来源文件为：

```text
scrape/betterme_scrape/betterme_public_data.json
```

导入内容包含步骤图片、问题图片和选项图标。

图片 URL 会映射到项目 CDN：

```text
https://cdn.gandalfpuzzle.com/temp/funnel/<image-id>.webp
```

## 4. 配置 PayPal

在 PayPal Developer Dashboard 创建 REST app，先使用 sandbox credentials 完成本地和 preview 验证。需要配置：

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_CURRENCY=USD
PAYPAL_PLAN_AMOUNT_CENTS=1900
```

说明：

- `PAYPAL_ENV=sandbox` 时使用 `https://api-m.sandbox.paypal.com`。
- `PAYPAL_ENV=live` 时使用 `https://api-m.paypal.com`。
- `PAYPAL_CLIENT_ID` 会通过 `/api/paypal/config` 返回给浏览器加载 PayPal JS SDK；client id 是公开值。
- `PAYPAL_CLIENT_SECRET` 只用于服务端换取 access token，不能放到前端。
- `PAYPAL_PLAN_AMOUNT_CENTS` 是服务端套餐金额，前端不会传金额。

切到真实生产支付时，将 `PAYPAL_ENV` 改为 `live`，并替换成 PayPal live app 的 client id 和 secret。

## 5. 配置 Vercel

在 Vercel 项目的环境变量设置中，为 Production、Preview 和 Development 添加：

```env
DATABASE_URL=postgres://...
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_CURRENCY=USD
PAYPAL_PLAN_AMOUNT_CENTS=1900
```

Production 环境如果已经准备接收真实付款，应使用 PayPal live app credentials，并设置：

```env
PAYPAL_ENV=live
```

仓库内已包含 `vercel.json`，用于固定安装和构建命令：

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build"
}
```

这样可以确保 Vercel 使用的包管理器和本地开发保持一致。

## 6. 部署

Vercel 控制台流程：

```text
Import Git repository -> Framework: Next.js -> Add env vars -> Deploy
```

Vercel CLI 流程：

```bash
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add PAYPAL_ENV production
npx vercel env add PAYPAL_CLIENT_ID production
npx vercel env add PAYPAL_CLIENT_SECRET production
npx vercel env add PAYPAL_CURRENCY production
npx vercel env add PAYPAL_PLAN_AMOUNT_CENTS production
npx vercel --prod
```

如果希望 preview deployment 也连接 Supabase 和 PayPal sandbox，需要为 `preview` 环境重复添加这些变量。

## 7. 冒烟测试

部署完成后，先创建一个未支付 session 并打开结果页，确认页面出现 PayPal 按钮：

```bash
APP_URL=https://www.clawbot.co PAID=false pnpm demo:session
```

使用 PayPal sandbox buyer 账号完成支付后，再次请求 result 接口，应看到 `subscriptionStatus` 变为 `active`，`paywall.required` 变为 `false`。

也可以创建一个 mock 已支付 session，用来快速验证结果页解锁状态：

```bash
APP_URL=https://www.clawbot.co PAID=true pnpm demo:session
```

脚本会自动完成一次测评、提交结果、调用 mock 支付，并打印：

- `sessionId`
- `resultUrl`
- paywall 是否已关闭
- 返回的 result 字段列表

最终可以把已支付的 `sessionId` 放进 README 或交付邮件里，方便评审直接对比付费前后的差异化返回。
