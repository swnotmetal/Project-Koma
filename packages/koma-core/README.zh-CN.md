# Koma Core

Koma Core 是面向敏感数据的分层存储模块。
它把可搜索索引与私有内容拆开，并用后端派生的 opaque token 连接两者。

## 安全边界

Koma Core 提供存储模式（索引/内容分离），但集成应用需要从已认证的身份中自行推导出可信的 `userTier`。Core 不对用户进行身份认证，也不对访问级别做授权——它只强制执行应用传入的层级。在调用存储方法之前，务必先验证身份。

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

### 主工厂

| 导出 | 作用 | 适用场景 |
|---|---|---|
| `createKomaStorage()` | 从两个数据库句柄创建写入器 + 读取器 + token 派生器。 | 所有项目的主入口 |

### 存储组件

| 导出 | 作用 |
|---|---|
| `DualCollectionWriter` | 写入：轻量元数据进索引，完整载荷进内容库。 |
| `DualCollectionReader` | 读取：先搜索引，再按 token 取内容，可选限流。 |
| `TokenDeriver` | 基于 HKDF 的确定性 token 生成。同一 sourceId 永远产出同一 token。 |
| `ContentHasher` | 对载荷做 SHA-256 哈希，用于完整性校验。 |
| `DualCollectionMigrator` | 从旧的扁平集合批量迁移到双库格式。 |

### 共享工具

| 导出 | 作用 |
|---|---|
| `RateLimiter` | 按 token 或 IP 限流读取。防止内容遍历。 |
| `MemoryRateLimitStorage` | RateLimiter 的内存后端。 |

### 配置类型

`StorageConfig` — 完整存储配置的 TypeScript 类型。

## 设计

- 公共记录保持最小化（仅元数据）。
- 私有记录按 token 寻址，不可遍历。
- token 映射始终在服务端。
- 版本化和哈希使迁移更安全。