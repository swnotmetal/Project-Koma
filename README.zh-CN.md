# Koma

面向 AI 应用的防御型基础能力集合。

![Koma logo](logo/logonobg.png)

Koma 拆成三个独立技能，便于按需采用：

1. `koma-gate` - 语义请求过滤与范围控制
2. `koma-scout` - 流量控制、上传检查与反机器人策略
3. `koma-core` - 面向敏感数据的零信任索引/内容分离

存储层在 `koma-core` 中还分成两个模式：

- **Core Lite** - 适合入门的最小 split-store 模式
- **Core Strict** - 带分级、审计和限次读取的强化模式

## 目录结构

- `packages/koma-gate/README.md`
- `packages/koma-scout/README.md`
- `packages/koma-core/README.md`
- `package.json`
- `VERSIONING.md`

## 如何切换中文版本

直接打开这个文件：`README.zh-CN.md`。

如果你在 GitHub 上浏览，优先访问同名的中文文件；如果以后要给子包也补中文说明，按同样规则使用 `packages/<name>/README.zh-CN.md`。

## 版本管理

Koma 使用语义化版本管理，发布前请先查看 `VERSIONING.md`。

## 说明

- 源码和说明文档保持 English-first，但中文版本保留在仓库中。
- 当前仓库是 workspace 风格，根目录负责版本与发布入口，`packages/` 负责功能模块。