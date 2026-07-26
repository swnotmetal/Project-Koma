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

### 守卫工厂

| 导出 | 作用 | 适用场景 |
|---|---|---|
| `createGeneralKnowledgeGuard()` | 拦截诊断/建议/闲聊。放行科学、技术、历史。 | 问答机器人、研究助手 |
| `createCodeAssistantGuard()` | 拦截恶意代码、漏洞利用、破解。放行编程、架构。 | 编程助手、CI 机器人 |
| `createSupportGuard()` | 拦截医疗/法律/投资建议。放行账单、账户、FAQ。 | 客服机器人 |
| `createReferenceToolGuard()` | 拦截诊断、角色越权、提示提取。放行事实查询。 | 语音助手、药品查询、文档搜索 |

### 核心类

| 导出 | 作用 |
|---|---|
| `KomaGuard` | 主守卫类。`guard.classify(text)` 编程调用，`guard.middleware()` 用于 Express。 |
| `buildClassificationPrompt()` | 从域配置构建 few-shot 提示词，用于自定义守卫。 |

### 配置类型

`GuardConfig`、`GuardResult`、`GuardDecision` — 完整守卫合约的 TypeScript 类型。

## 设计

- English-first 源码和提示词。
- 低 token 消耗（约 500 tokens 每次分类）。
- 默认 fail-open，优先保证可用性。
- 通过适配器配置切换本地和云端 LLM。