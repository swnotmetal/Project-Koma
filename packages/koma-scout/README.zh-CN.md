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

- `MemoryRateLimitStorage`
- `FirestoreRateLimitStorage`
- `AudioValidator`
- `GeoAllowlist`
- `createKomaScoutMiddleware()`
- `applyKomaScout()`

## 设计

- 便宜检查优先，昂贵处理靠后。
- 共享存储（Firestore）后端支持分布式安全限流。
- 可选基础设施失败时 fail-open。
- 可作为独立中间件层使用。