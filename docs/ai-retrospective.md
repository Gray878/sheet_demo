# AI 使用复盘

本项目中，我主要把 AI 当作工程协作伙伴，而不是单纯的代码生成器。AI 参与了需求拆解、数据库建模、Mock/seed 数据整理、核心计算逻辑实现、测试用例补充和交付文档收口；我负责业务取舍、边界确认、代码审查和最终验证。

## 1. 需求拆解

我先把挑战说明和 BetterMe funnel 的公开流程交给 AI，让它提取评分重点和后端闭环：

- API 设计是否规范。
- 数据库模型是否能支撑动态 funnel、答案持久化和结果扩展。
- 用户中断后是否能恢复进度。
- 结果页是否基于订阅状态返回差异化数据。
- mock 支付是否形成可重复验证的闭环。

在 AI 的帮助下，我把系统拆成五个边界：`funnel config`、`session`、`answer`、`result`、`payment`。这个拆分避免项目变成一个只在前端跑通的表单，而是让后端真正承载状态、计算和权限。

## 2. 数据库建模

数据库建模阶段，我让 AI 先根据业务流程生成初版实体关系，再结合 Supabase PostgreSQL 和 Drizzle ORM 做人工审查和调整。最终模型包括：

- `users`：保留匿名用户扩展点。
- `funnels`、`funnel_steps`、`answer_options`：把测评流程配置化，而不是写死在前端。
- `assessment_sessions`：记录匿名 session、当前进度、提交状态和订阅状态。
- `assessment_answers`：按 `session_id + question_key` upsert 保存分步答案。
- `assessment_results`：保存服务端计算出的 BMI、热量、目标日期和预测曲线。
- `payments`：保存 PayPal capture 或 mock 支付记录，并保留 provider order/capture id。

AI 对字段类型、索引和约束给了初步建议，我重点审查了以下部分：

- 前端暴露的主 ID 使用 `uuid`，避免自增 ID 泄露。
- 时间字段使用 `timestamptz`。
- 计算结果使用 `numeric` 或 `integer`，避免把数值存成字符串。
- `assessment_answers` 增加 `unique(session_id, question_key)`，保证重复保存不会产生脏数据。
- `payments.provider_event_id` 设置唯一约束，用作支付回调幂等键。
- 为 session、answer、payment 等常用查询路径补索引。
- 为枚举状态增加 check constraint，例如 session status、subscription status、payment status。

最终 Drizzle schema 位于 `src/server/db/schema.ts`，迁移 SQL 位于 `supabase/migrations/`。

## 3. Mock 数据与 BetterMe 数据抽象

我使用 AI 帮助理解抓取到的 BetterMe 公开数据结构，包括步骤、题型、选项、图片资源和分组信息。AI 辅助我把原始数据抽象成项目自己的 funnel 配置，而不是 1:1 复制竞品页面。

具体处理包括：

- 从公开数据中提取核心问题，如目标、身体数据、训练频率、饮食和睡眠习惯。
- 补充挑战要求中明确需要的 `gender` 字段。
- 将 BetterMe 图片 ID 映射到项目 CDN 路径。
- 编写 seed 脚本，把默认 funnel 导入 `funnels`、`funnel_steps` 和 `answer_options`。
- 编写 `scripts/create-demo-session.mjs`，自动创建测试 session、保存核心答案、提交测评，并可按 `PAID=true/false` 生成已支付或未支付状态。

这样评审既可以手动走页面，也可以用脚本快速生成对照数据。

## 4. 复杂业务逻辑

核心计算逻辑由 AI 先生成基础版本，再经过人工调整边界条件。主要逻辑包括：

- BMI 计算和分类。
- Mifflin-St Jeor BMR 公式。
- TDEE 活动系数。
- 建议每日热量。
- 目标达成日期。
- 周维度体重预测曲线。
- 根据订阅状态裁剪结果字段。

人工审查和修正重点：

- 对女性、男性和其他性别设置不同的安全热量下限。
- 减重和增重使用不同的 weekly change 区间。
- 目标 BMI 低于健康范围时返回 `riskFlags`，不直接承诺不健康目标。
- 未支付用户只能拿到 BMI、摘要和模糊周期，不能从接口拿到完整预测曲线。
- 支付后再次请求 result 接口，才返回 `recommendedCalories`、`targetDate`、`projectionCurve` 和完整建议。

这部分代码集中在 `src/server/domain/result-calculator.ts` 和 `src/server/services/result-service.ts`。

## 5. API 与校验

AI 帮助我整理了 API 路径和统一响应结构，我再根据挑战要求收敛成 REST 风格接口：

- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `PATCH /api/sessions/:sessionId/answers`
- `POST /api/sessions/:sessionId/submit`
- `GET /api/sessions/:sessionId/result`
- `POST /api/pay`

请求校验使用 Zod。AI 生成了基础 DTO 后，我补充了业务级校验：

- `sessionId` 必须是 UUID。
- 年龄、身高、当前体重、目标体重必须在合理范围内。
- 单选/多选答案必须存在于当前 funnel 配置的合法选项中。
- 提交前必须具备核心字段：`gender`、`goal`、`age`、`heightCm`、`currentWeightKg`、`targetWeightKg`、`activityFrequency`。

## 6. 测试与验证

AI 协助生成了计算逻辑的 Vitest 测试。我重点验证：

- BMI、热量和目标日期是否稳定。
- 目标 BMI 过低时是否返回风险提示。
- 未支付和已支付接口返回字段是否有明显差异。
- PayPal capture 完成后会校验金额、币种和 session 绑定，`/api/pay` 重复调用也不会破坏订阅状态。

项目交付前使用以下命令验证：

```bash
pnpm typecheck
pnpm test
pnpm build
```

线上也准备了一个未支付 session 和一个已支付 session，方便评审直接对比接口返回。

## 7. 人工取舍

AI 在本项目中提高了建模和实现速度，但最终取舍由我完成：

- 没有接入真实账号体系，使用匿名 session 满足挑战重点。
- 线上结果页接入 PayPal JavaScript SDK，订单创建和 capture 都在服务端完成；mock `/api/pay` 保留给 demo 脚本和快速对照验证。
- 没有把所有竞品问题全部用于核心算法，而是保留动态问题模型和核心字段计算。
- 没有让前端承担权限判断，结果脱敏在服务端完成。
- 增加本地文件存储 fallback，降低本地评审启动成本；线上仍使用 Supabase PostgreSQL。
