# Koma Core

Koma Core 是面向敏感数据的分层存储模块。
它把可搜索索引与私有内容拆开，并用后端派生的 opaque token 连接两者。

## AI Agent 快速阅读

- 阅读顺序：本页 README、`src/index.ts`、[../../demo/server.js](../../demo/server.js)。
- 边界：把可搜索索引和私有内容分开存放。
- token 规则：检索 token 由后端派生，客户端不可直接见到。
- 适合在保留检索能力的同时保护敏感内容。

## Agent Handoff

- 输入：待入库的条目、用于解析的 token，以及两份存储句柄。
- 输出：可搜索元数据和基于 token 的私有内容。
- 控制点：`createKomaStorage()` 以及它返回的 writer / reader。
- 常见误读：把私有记录暴露到搜索中，或者假设 token 由客户端生成。

## 入口

- 源码入口：`src/index.ts`

## 导出

- `TokenDeriver`
- `ContentHasher`
- `DualCollectionWriter`
- `DualCollectionReader`
- `RateLimiter`
- `DualCollectionMigrator`
- `createKomaStorage()`

## 说明

- Core Lite 适合先落地 split-store 模式。
- Core Strict 适合上线后加强审计、分级和限次读取。
- 内容层 token 不暴露给客户端。