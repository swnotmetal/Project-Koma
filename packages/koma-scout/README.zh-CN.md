# Koma Scout

Koma Scout 是面向 AI 应用的流量控制与防机器人中间件。
它会先做便宜的确定性检查，再进入昂贵的模型调用。

## AI Agent 快速阅读

- 阅读顺序：本页 README、`src/index.ts`、[../../demo/server.js](../../demo/server.js)。
- 边界：限流、音频校验和地理白名单。
- 决策顺序：先便宜检查，再做昂贵处理。
- 适合拦在模型或存储层之前。

## Agent Handoff

- 输入：请求元数据、文件大小、时长、MIME 类型，以及可选的 IP 或地区信息。
- 输出：通过或拦截，并返回外围检查原因。
- 控制点：`createKomaScoutMiddleware()` 以及传入的存储或校验配置。
- 常见误读：把 Scout 当成应用主策略层，而不是外围过滤层。

## 入口

- 源码入口：`src/index.ts`

## 导出

### 中间件工厂

| 导出 | 作用 | 适用场景 |
|---|---|---|
| `createKomaScoutMiddleware()` | 返回 Express 中间件数组：限流 + 音频校验 + 地理。 | 大多数项目的主入口 |
| `applyKomaScout()` | 便捷封装：对每个中间件调用 `app.use()`。 | Express 应用 |

### 独立组件

| 导出 | 作用 |
|---|---|
| `MemoryRateLimitStorage` | 内存限流存储。适合单实例开发环境。 |
| `FirestoreRateLimitStorage` | Firestore 限流存储。生产环境分布式安全。 |
| `AudioValidator` | 校验 base64 音频：大小、时长估算、MIME 类型、冷却。 |
| `GeoAllowlist` | IP 地理定位查询 + 缓存。按国家代码放行或拦截。 |

### 配置类型

`RateLimitConfig`、`AudioValidationConfig`、`GeoAllowlistConfig` — 各层的 TypeScript 类型。

## 设计

- 便宜检查优先，昂贵处理靠后。
- 共享存储（Firestore）后端支持分布式安全限流。
- 可选基础设施失败时 fail-open。
- 可作为独立中间件层使用。