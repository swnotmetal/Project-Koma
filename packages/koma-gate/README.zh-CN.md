# Koma Gate

Koma Gate 是面向 AI 应用的语义请求过滤模块。
它会对输入做范围判断，并输出严格的 JSON 决策：

## AI Agent 快速阅读

- 阅读顺序：本页 README、`src/index.ts`、[../../demo/server.js](../../demo/server.js)。
- 边界：在任何模型或工具工作之前判断输入是否在范围内。
- 输出：严格的 JSON 决策和中间件封装。
- 适合放在请求入口，而不是业务后面。

## Agent Handoff

- 输入：简短用户请求或路由文本。
- 输出：放行或拒绝，以及一份 JSON 决策对象。
- 控制点：`createGeneralKnowledgeGuard()`、`createCodeAssistantGuard()`、`createSupportGuard()`。
- 常见误读：把这一层当成意图路由器，而不是守卫。

```json
{"in_scope": true}
```

## 入口

- 源码入口：`src/index.ts`

## 导出

- `KomaGuard`
- `GuardConfig`
- `GuardResult`
- `GuardDecision`
- `createGeneralKnowledgeGuard()`
- `createCodeAssistantGuard()`
- `createSupportGuard()`
- `buildClassificationPrompt()`

## 说明

- English-first 的源码和提示词。
- 适合放在 LLM、工具调用或客服流程前面。
- 默认 fail-open，优先保证可用性。