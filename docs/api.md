# API 文档

## 响应格式

成功：

```json
{
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_xxx"
  }
}
```

失败：

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "heightCm must be between 120 and 230",
    "details": []
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

## Funnel

### `GET /api/funnels/default`

返回前端渲染所需的步骤、题型、选项和输入边界。MVP 从抓取数据中抽取关键步骤，并补充 `gender` 题。

## Sessions

### `POST /api/sessions`

创建匿名测评 session，并写入 `health_funnel_session` httpOnly cookie。

响应重点：

```json
{
  "sessionId": "uuid",
  "status": "in_progress",
  "currentStepIndex": 0,
  "subscriptionStatus": "inactive"
}
```

### `GET /api/sessions/:sessionId`

返回 session、已保存答案和进度，可用于刷新恢复。

### `PATCH /api/sessions/:sessionId/answers`

保存一个或多个答案。服务端会验证题型、枚举值和数值边界。

请求：

```json
{
  "currentStepIndex": 5,
  "answers": [
    {
      "questionKey": "heightCm",
      "questionId": "question_289965",
      "stepIndex": 11,
      "answerType": "input",
      "value": 165
    }
  ]
}
```

### `POST /api/sessions/:sessionId/submit`

校验必填项，计算 BMI、BMR、TDEE、建议热量、目标日期和预测曲线，并持久化结果。

缺少必填项时返回 `422 UNPROCESSABLE_ENTITY`。

## Results

### `GET /api/sessions/:sessionId/result`

未支付：

```json
{
  "sessionId": "uuid",
  "subscriptionStatus": "inactive",
  "result": {
    "bmi": 26.4,
    "bmiCategory": "overweight",
    "summary": {},
    "estimatedWeeksRange": "12-16"
  },
  "paywall": {
    "required": true,
    "reason": "subscription_required"
  }
}
```

已支付：

```json
{
  "sessionId": "uuid",
  "subscriptionStatus": "active",
  "result": {
    "bmi": 26.4,
    "bmiCategory": "overweight",
    "recommendedCalories": 1680,
    "targetDate": "2026-08-07",
    "projectionCurve": [
      {
        "week": 1,
        "weightKg": 71.3
      }
    ],
    "recommendations": []
  },
  "paywall": {
    "required": false
  }
}
```

## Payment

### `POST /api/pay`

Mock 支付接口。写入 `payments` 记录，并将 `assessment_sessions.subscription_status` 更新为 `active`。

请求：

```json
{
  "sessionId": "uuid",
  "providerEventId": "mock_evt_001",
  "amountCents": 1900,
  "currency": "USD"
}
```

`providerEventId` 是幂等键，重复调用不会破坏订阅状态。
