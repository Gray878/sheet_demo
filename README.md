# Bendwell Health Plan

一个健康测评 funnel MVP，用来覆盖全栈挑战里的核心后端闭环：匿名 session、分步保存、进度恢复、服务端计算、结果鉴权和 mock 支付解锁。

当前实现优先保证本地可演示。没有 `DATABASE_URL` 时，API 会写入 `data/dev-db.json`；配置 Supabase Postgres 连接串后，服务端会通过 Drizzle 自动切到 PostgreSQL。

## 交付物清单

| 交付项 | 地址 / 说明 |
| --- | --- |
| 线上演示地址 | https://sheet-demo-six.vercel.app |
| GitHub 仓库 | https://github.com/Gray878/sheet_demo |
| 数据库 Schema 图 | https://cdn.gandalfpuzzle.com/temp/funnel/sheet_demo_er.png |
| API 文档 | [`docs/api.md`](docs/api.md) |
| AI 使用复盘 | [`docs/ai-retrospective.md`](docs/ai-retrospective.md) |
| Supabase/Vercel 部署说明 | [`docs/deployment.md`](docs/deployment.md) |

![数据库 Schema 图](https://cdn.gandalfpuzzle.com/temp/funnel/sheet_demo_er.png)

## 线上演示与支付测试

评审可直接打开线上地址，从头完成 funnel，并在结果页点击 `Mock pay` 验证支付解锁闭环。

对照测试 session：

| 状态 | sessionId | 结果页 |
| --- | --- | --- |
| 未支付 | `1808617f-90bd-4d29-9102-9957efd4d942` | https://sheet-demo-six.vercel.app/result/1808617f-90bd-4d29-9102-9957efd4d942 |
| 已支付 | `91564939-b953-4b26-9681-dc288ba37c39` | https://sheet-demo-six.vercel.app/result/91564939-b953-4b26-9681-dc288ba37c39 |

未支付 session 的结果接口会返回 `subscriptionStatus: "inactive"` 和 `paywall.required: true`，并隐藏 `recommendedCalories`、`targetDate`、`projectionCurve`。已支付 session 会返回 `subscriptionStatus: "active"`、`paywall.required: false` 和完整结果。

## 技术栈

- Next.js App Router + TypeScript
- Route Handlers 作为后端 API
- Zod 做请求和答案校验
- Supabase PostgreSQL 作为生产存储
- Drizzle ORM 作为服务端数据访问层
- 本地文件存储作为开发 fallback
- Vitest 覆盖健康评估计算

## 本地启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`，可以从测评首页一路填写到结果页。未配置 `DATABASE_URL` 时，数据保存在 `data/dev-db.json`，这个文件已被 `.gitignore` 忽略。

## 图片资源

Funnel 图片已上传到 CDN，前端和 seed 数据都会把抓取数据里的图片 ID 映射成：

```text
https://cdn.gandalfpuzzle.com/temp/funnel/<image-id>.webp
```

## 数据库初始化

1. 从 Supabase Project Settings -> Database -> Connection string 复制 Postgres URI。
2. 在本地或 Vercel 配置 `DATABASE_URL`。
3. 用 Drizzle migration 创建表，schema 源码在 `src/server/db/schema.ts`，迁移 SQL 在 `supabase/migrations/`。
4. 执行 seed 脚本导入默认 funnel。

```bash
pnpm db:migrate
pnpm seed
```

以后如果修改了 `src/server/db/schema.ts`，先生成新的 SQL migration，再同步到数据库：

```bash
pnpm db:generate
pnpm db:migrate
```

`pnpm db:generate` 会根据 `src/server/db/schema.ts` 生成新的 SQL migration；`pnpm db:migrate` 会把 migration 执行到 `DATABASE_URL` 指向的 Supabase/Postgres。不要用 `drizzle-kit push` 作为本项目的同步方式：它需要先 introspect 远程 schema，当前 Supabase/Postgres check constraint 会触发 Drizzle Kit 的读取错误。已有表的数据库如果已经能正常 seed 和运行，可以继续使用；需要让 Drizzle migration 接管时，再给现有库补一条 baseline migration 记录，或者换一个空库重新执行上面的初始化命令。

环境变量：

```env
DATABASE_URL=postgres://...
```

所有数据库读写都在服务端完成，前端不会直接持有 Supabase anon key 或 service role key。Vercel/Supabase pooler 连接建议使用 transaction pooler URI。

更完整的部署步骤见 `docs/deployment.md`。

## API

所有 API 使用统一响应结构：

```json
{
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_xxx"
  }
}
```

核心接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/funnels/default` | 获取默认 funnel 配置 |
| `POST` | `/api/sessions` | 创建匿名测评 session |
| `GET` | `/api/sessions/:sessionId` | 获取 session、答案和进度 |
| `PATCH` | `/api/sessions/:sessionId/answers` | 分步保存答案 |
| `POST` | `/api/sessions/:sessionId/submit` | 提交测评并生成结果 |
| `GET` | `/api/sessions/:sessionId/result` | 获取按订阅状态差异化处理的结果 |
| `POST` | `/api/pay` | mock 支付并激活订阅 |

创建 session：

```bash
curl -X POST http://localhost:3000/api/sessions
```

保存答案：

```bash
curl -X PATCH http://localhost:3000/api/sessions/<sessionId>/answers \
  -H "content-type: application/json" \
  -d '{
    "currentStepIndex": 2,
    "answers": [
      {
        "questionKey": "gender",
        "questionId": "question_gender",
        "stepIndex": 1,
        "answerType": "single_select",
        "value": "female"
      }
    ]
  }'
```

模拟支付：

```bash
curl -X POST http://localhost:3000/api/pay \
  -H "content-type: application/json" \
  -d '{
    "sessionId": "<sessionId>",
    "providerEventId": "mock_<sessionId>"
}'
```

线上 mock 支付验证：

```bash
APP_URL=https://sheet-demo-six.vercel.app
SESSION_ID=<sessionId>

curl "$APP_URL/api/sessions/$SESSION_ID/result"

curl -X POST "$APP_URL/api/pay" \
  -H "content-type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"providerEventId\": \"mock_${SESSION_ID}_manual\"
  }"

curl "$APP_URL/api/sessions/$SESSION_ID/result"
```

调用 `/api/pay` 后，再次请求 result 接口应看到 `subscriptionStatus` 变为 `active`，`paywall.required` 变为 `false`。

## 关键业务规则

- `assessment_answers` 使用 `unique(session_id, question_key)` 支持答案 upsert。
- `payments.provider_event_id` 唯一，重复 mock 支付保持幂等。
- 提交测评前必须具备 `gender`、`goal`、`age`、`heightCm`、`currentWeightKg`、`targetWeightKg`、`activityFrequency`。
- 未支付结果隐藏 `recommendedCalories`、`targetDate` 和 `projectionCurve`。
- 支付后再次调用结果接口，返回完整预测曲线和建议。

## 测试

```bash
pnpm typecheck
pnpm test
```

部署后创建评审用测试 session：

```bash
APP_URL=https://sheet-demo-six.vercel.app PAID=true pnpm demo:session
```

## 交付说明

- Drizzle schema：[`src/server/db/schema.ts`](src/server/db/schema.ts)
- 数据库 migration：[`supabase/migrations/`](supabase/migrations/)
- 数据库 Schema 图：[`PNG`](https://cdn.gandalfpuzzle.com/temp/funnel/sheet_demo_er.png)，文档版见 [`docs/requirements-and-tech-selection.md`](docs/requirements-and-tech-selection.md) 的 `11.2 ER 图`
- API 细节：[`docs/api.md`](docs/api.md)
- Supabase/Vercel 部署：[`docs/deployment.md`](docs/deployment.md)
- AI 使用复盘：[`docs/ai-retrospective.md`](docs/ai-retrospective.md)
- 原始需求与排期：[`docs/`](docs/)
- BetterMe 公开数据抓取结果：[`scrape/betterme_scrape/`](scrape/betterme_scrape/)
