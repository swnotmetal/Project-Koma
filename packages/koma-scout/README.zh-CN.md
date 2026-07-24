# Koma Scout

Koma Scout 是面向 AI 应用的流量控制与防机器人中间件。
它会先做便宜的确定性检查，再进入昂贵的模型调用。

## 入口

- 源码入口：`src/index.ts`

## 导出

- `MemoryRateLimitStorage`
- `FirestoreRateLimitStorage`
- `AudioValidator`
- `GeoAllowlist`
- `createVibeShieldMiddleware()`
- `applyVibeShield()`

## 说明

- 支持限流、音频校验、地理白名单。
- 适合语音入口和高频上传入口。
- 当可选基础设施失败时默认 fail-open。