# Koma

面向 AI 应用的防御型基础能力集合。

<p align="center">
	<img src="logo/lognobg.png" alt="Koma logo" width="160" />
</p>

<p align="center">
	<img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
	<img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.x-3178c6?style=flat-square" />
	<img alt="Workspace" src="https://img.shields.io/badge/workspace-monorepo-111827?style=flat-square" />
</p>

<p align="center">
	<a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文导览</a>
</p>

Koma 是一个面向 AI 应用的模块化防御工具箱。每个技能都可以单独采用，先解决最需要的那一层，再逐步叠加防护。

## 一览

<table>
	<tr>
		<td width="33%">
			<strong>1. Koma Gate</strong><br />
			语义请求过滤与范围控制。<br />
			<code>koma-gate</code>
		</td>
		<td width="33%">
			<strong>2. Koma Scout</strong><br />
			流量控制、上传检查与反机器人策略。<br />
			<code>koma-scout</code>
		</td>
		<td width="33%">
			<strong>3. Koma Core</strong><br />
			面向敏感数据的零信任索引/内容分离。<br />
			<code>koma-core</code>
		</td>
	</tr>
</table>

`koma-core` 的存储层还分成两个模式：

<table>
	<tr>
		<td width="50%">
			<strong>Core Lite</strong><br />
			适合入门的最小 split-store 模式。
		</td>
		<td width="50%">
			<strong>Core Strict</strong><br />
			带分级、审计和限次读取的强化模式。
		</td>
	</tr>
</table>

## 为什么看起来更清楚

- 一个仓库，三个清晰职责。
- 每个模块只做一件事。
- 存储层区分入门模式和严格模式。
- GitHub 首页可以直接读懂，不需要额外说明。

## 目录结构

- `packages/koma-gate/README.md`
- `packages/koma-scout/README.md`
- `packages/koma-core/README.md`
- `package.json`
- `VERSIONING.md`

## 如何切换中文版本

- 英文版：[README.md](README.md)
- 中文导览：[README.zh-CN.md](README.zh-CN.md)

## 版本管理

Koma 使用语义化版本管理，发布前请先查看 `VERSIONING.md`。

## 说明

- 源码和说明文档保持 English-first，但中文版本保留在仓库中。
- 当前仓库是 workspace 风格，根目录负责版本与发布入口，`packages/` 负责功能模块。

## 本地验证 npm 包

如果你想在一个全新的目录里验证发布包，可以直接用仓库自带的 smoke test：

```bash
npm run smoke:npm
```

或者手工验证：

```bash
npm pack packages/koma-gate
mkdir C:\temp\koma-test
cd C:\temp\koma-test
npm init -y
npm install D:\path\to\koma-gate-0.1.0.tgz
node --input-type=module -e "import { createGeneralKnowledgeGuard } from 'koma-gate'; console.log(typeof createGeneralKnowledgeGuard)"
```

