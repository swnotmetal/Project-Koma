# Koma Core

Koma Core 是面向敏感数据的分层存储模块。
它把可搜索索引与私有内容拆开，并用后端派生的 opaque token 连接两者。

## 入口

- 源码入口：`src/index.ts`

## 导出

- `TokenDeriver`
- `ContentHasher`
- `DualCollectionWriter`
- `DualCollectionReader`
- `RateLimiter`
- `DualCollectionMigrator`
- `createVibeShieldStorage()`

## 说明

- Core Lite 适合先落地 split-store 模式。
- Core Strict 适合上线后加强审计、分级和限次读取。
- 内容层 token 不暴露给客户端。