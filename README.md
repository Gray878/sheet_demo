# Bendwell Health Plan

一个健康测评 funnel MVP，用来覆盖全栈挑战里的核心后端闭环：匿名 session、分步保存、进度恢复、服务端计算、结果鉴权和 mock 支付解锁。

当前实现优先保证本地可演示。没有 Supabase 环境变量时，API 会写入 `data/dev-db.json`；配置 Supabase 后，服务端会自动切到 PostgreSQL。

## 技术栈

- Next.js App Router + TypeScript
- Route Handlers 作为后端 API
- Zod 做请求和答案校验
- Supabase PostgreSQL 作为生产存储
- 本地文件存储作为开发 fallback
- Vitest 覆盖健康评估计算

## 本地启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，可以从测评首页一路填写到结果页。未配置 Supabase 时，数据保存在 `data/dev-db.json`，这个文件已被 `.gitignore` 忽略。

## Supabase 初始化

1. 在 Supabase SQL editor 执行 `supabase/schema.sql`。
2. 在本地或 Vercel 配置环境变量。
3. 执行 seed 脚本导入默认 funnel。

```bash
npm run seed:supabase
```

环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

服务端写操作使用 `SUPABASE_SERVICE_ROLE_KEY`，前端不会直接写库。

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

## 关键业务规则

- `assessment_answers` 使用 `unique(session_id, question_key)` 支持答案 upsert。
- `payments.provider_event_id` 唯一，重复 mock 支付保持幂等。
- 提交测评前必须具备 `gender`、`goal`、`age`、`heightCm`、`currentWeightKg`、`targetWeightKg`、`activityFrequency`。
- 未支付结果隐藏 `recommendedCalories`、`targetDate` 和 `projectionCurve`。
- 支付后再次调用结果接口，返回完整预测曲线和建议。

## 测试

```bash
npm run typecheck
npm test
```

部署后创建评审用测试 session：

```bash
APP_URL=https://your-vercel-domain.vercel.app PAID=true npm run demo:session
```

## 交付说明

- 数据库 schema：`supabase/schema.sql`
- API 细节：`docs/api.md`
- Supabase/Vercel 部署：`docs/deployment.md`
- AI 使用复盘草稿：`docs/ai-retrospective.md`
- 原始需求与排期：`docs/`
- BetterMe 公开数据抓取结果：`scrape/betterme_scrape/`
