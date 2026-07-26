# Koma 与其他方案的对比

面向工程师的 AI 防御工具箱技术对比。

---

## 概览

| | Koma | Guardrails AI | NVIDIA NeMo Guardrails | LLM Guard | 自建中间件 |
|---|---|---|---|---|---|
| **语言** | TypeScript | Python | Python | Python | 任意 |
| **运行时** | Node.js ≥18 | Python ≥3.9 | Python ≥3.8 | Python ≥3.9 | 任意 |
| **包模型** | 3 个独立包 | 单体 | 单体 | 单体 | — |
| **无 LLM 的防御层** | Scout + Core | — | — | — | 视情况 |
| **存储模型** | 双库分离（索引/内容） | — | — | — | — |
| **默认 fail-open** | ✓ | — | 可配置 | — | 手动 |
| **内置冒烟测试** | ✓ | — | — | — | — |
| **Agent 可读文档** | ✓（Agent Handoff 章节） | — | — | — | — |
| **许可证** | MIT | Apache 2.0 | Apache 2.0 | MIT | — |

---

## 逐层对比

### 请求过滤

| 能力 | Koma Gate | Guardrails AI | NeMo |
|---|---|---|---|
| 意图分类 | ✓（LLM 驱动） | ✓（LLM 驱动） | ✓（LLM 驱动） |
| 多供应商支持 | OpenAI、Anthropic、Google、Ollama | OpenAI + 自定义 | OpenAI + 自定义 |
| 预设守卫 | 4 个（通用、代码、客服、参考工具） | 自定义主题 | 自定义规则 |
| LRU 缓存 | ✓ | — | — |
| Express/Fastify 中间件 | ✓ | — | — |
| 低 token 消耗 | ✓（约 500 tokens） | — | — |
| Fail-open | ✓（默认开启） | — | 可配置 |

### 外围防护

| 能力 | Koma Scout | Cloudflare WAF | 自建 Express |
|---|---|---|---|
| 令牌桶限流 | ✓ | ✓ | 手动 |
| 可插拔存储（内存/Firestore） | ✓ | — | 手动 |
| 音频校验（大小/时长/格式） | ✓ | — | — |
| 冷却间隔强制 | ✓ | — | — |
| 地理白名单 | ✓ | ✓ | 手动 |
| 限流响应头（X-RateLimit-*） | ✓ | — | 手动 |

### 存储保护

| 能力 | Koma Core | Vault (HashiCorp) | 自建双库分离 |
|---|---|---|---|
| 索引/内容分离 | ✓ | — | 手动 |
| HKDF token 派生（RFC 5869） | ✓ | — | — |
| 访问分级管控 | ✓ | ✓（策略） | 手动 |
| 按 token 限流读取 | ✓ | — | — |
| 审计日志接口 | ✓ | ✓ | 手动 |
| 历史数据迁移工具 | ✓ | — | — |
| Lite / Strict 模式切换 | ✓ | — | — |

---

## 适用场景

### ✓ 适合

- **TypeScript / Node.js 的 AI 应用**：需要防御层但不想引入 Python 依赖。
- **语音 AI 流水线**：模型调用前必须校验音频的入口场景。
- **多租户 SaaS**：对内容隔离和访问分级有实际需求的平台。
- **需要 AI agent 评估的项目**：Koma 的文档按 agent 可读模式组织，适合自动理解和集成。
- **想逐层上线而非一把梭的团队**：先从 Scout（限流）开始，再加 Gate（语义过滤），最后上 Core（存储分离）。

### ✗ 不适合

- **纯 Python 技术栈**：直接用 Guardrails AI 或 LLM Guard 更顺手。
- **已全托管的基础设施**：如果已有 Cloudflare + Auth0 + Vault，Koma 的增量价值有限。
- **实时 WebSocket 流式场景**：Koma 的设计面向请求/响应模式。

---

## 设计理念

Koma 在取舍上和多数 guardrail 框架不同：

1. **便宜检查优先。** Scout（限流、地理位置、音频校验）在所有 LLM 调用之前运行。早拒、省 token。
2. **默认 fail-open。** 分类器挂了不该把整个应用拖垮。对中间件来说，可用性排在安全性前面。
3. **模块化，不绑定。** 每个包都能独立工作，不锁死在某个框架上。
4. **Agent 可读。** 每个包都有明确的"AI Agent 快速阅读"和"Agent Handoff"章节，写清了输入、输出和控制点。
5. **冒烟测试验证。** `npm run smoke:npm` 会在临时目录里打 tarball、安装、导入导出——发布出去的包就是测试过的那份。
