# AI 使用复盘

## 需求拆解

先让 AI 从挑战说明中抽象核心评分点：API 设计、数据库建模、分步持久化、服务端计算、订阅鉴权和 mock 支付闭环。随后把需求拆成 session、answer、result、payment 和 funnel config 五个边界，避免把项目做成单纯表单。

## 数据建模

AI 辅助生成了初版表结构，再结合 Drizzle/Supabase Postgres 最佳实践进行审查：

- 使用 `uuid` 暴露给前端，避免自增 ID 泄露。
- 使用 `timestamptz` 保存时间。
- 使用 `numeric` 保存计算结果。
- 为外键列和常用查询列补充索引。
- 使用 `unique(session_id, question_key)` 支撑答案 upsert。
- 使用 `provider_event_id` 唯一约束保证支付幂等。
- 为 `subscription_status = 'active'` 增加 partial index。

数据访问层后续收敛到 Drizzle ORM，只保留一条 `DATABASE_URL`，避免前端不需要的 Supabase anon key 和服务端 service role key 出现在项目配置里。

## BetterMe 数据抽象

抓取数据只作为公开参考和 seed 来源，没有 1:1 复制完整商业页面。MVP 选取了目标、身体状态、训练频率、生活方式、睡眠、饮食、身高、体重、年龄和重要事件等关键问题，并补充挑战要求中的 `gender` 字段。

## 计算逻辑

AI 生成了 BMI、Mifflin-St Jeor BMR、TDEE、建议热量和目标日期的基础实现。人工审查重点放在边界上：

- 热量建议设置了性别安全下限。
- 减重和增重使用不同 weekly change 区间。
- 目标 BMI 低于 18.5 时返回风险提示。
- 未支付结果由后端裁剪，前端不参与鉴权判断。

## 人工修正点

- 本地增加文件存储 fallback，降低评审和开发环境启动成本。
- API 统一响应结构，便于 Postman 或 cURL 验证。
- 支付接口使用可重复的 `providerEventId`，确保重复回调安全。
- 页面只做可转化、可信的基础体验，把复杂动画和像素还原让位给后端闭环。
