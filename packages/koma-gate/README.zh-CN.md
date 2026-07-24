# Koma Gate

Koma Gate 是面向 AI 应用的语义请求过滤模块。
它会对输入做范围判断，并输出严格的 JSON 决策：

```json
{"in_scope": true}
```

## 入口

- 源码入口：`src/index.ts`

## 导出

- `VibeShieldGuard`
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