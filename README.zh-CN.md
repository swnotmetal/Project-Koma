# Koma（狛犬）

### Node.js 的提示注入防火墙。
狛犬立，百邪散。
在恶意 prompt 到达你的 LLM、工具或 RAG 管道之前阻止它。

```bash
npm install koma-gate
```

<p align="center">
  <img src="logo/logobanner.png" alt="Koma" width="600" />
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="CI" src="https://github.com/swnotmetal/Project-Koma/actions/workflows/ci.yml/badge.svg" />
  <a href="https://www.npmjs.com/package/koma-gate"><img alt="koma-gate" src="https://img.shields.io/npm/v/koma-gate?label=koma-gate&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-scout"><img alt="koma-scout" src="https://img.shields.io/npm/v/koma-scout?label=koma-scout&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-core"><img alt="koma-core" src="https://img.shields.io/npm/v/koma-core?label=koma-core&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-miko"><img alt="koma-miko" src="https://img.shields.io/npm/v/koma-miko/alpha?label=koma-miko%20alpha&color=C25E38&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-miko-dsh"><img alt="koma-miko-dsh" src="https://img.shields.io/npm/v/koma-miko-dsh/alpha?label=DSH%20adapter&color=C25E38&style=flat-square" /></a>
  <br />
  <img alt="benchmark" src="https://img.shields.io/badge/实测-98.8%25_召回率_0%25_误拦-6e3abe?style=flat-square" />
  <img alt="total downloads" src="https://img.shields.io/npm/dt/koma-gate?label=下载量&color=blue&style=flat-square" />
  <img alt="visitors" src="https://hits.dwyl.com/swnotmetal/Project-Koma.svg?style=flat-square" />
  <a href="https://koma-demo.swbuilds.workers.dev"><img alt="live demo" src="https://img.shields.io/badge/live_demo-try_it_now-C25E38?style=flat-square" /></a>
  <a href="https://glama.ai/mcp/servers/swnotmetal/Project-Koma"><img alt="MCP server" src="https://glama.ai/mcp/servers/swnotmetal/Project-Koma/badges/score.svg" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

<p align="center">
  <strong>▶ <a href="https://koma-demo.swbuilds.workers.dev">在线体验 Demo</a></strong> —— Gate、Scout、Core 三合一页面，无需注册。
</p>

---

### 它挡什么

| 你的应用 | 攻击方式 | 如何防御 | 安装 |
|---|---|---|---|
| AI 聊天 | 提示注入 / 越狱 | 语义过滤器在模型前拦截攻击 | `koma-gate` |
| 语音 AI | 音频滥用 / 洪水攻击 | 校验 + 限流 + 地理限制 | `koma-scout` |
| RAG / 搜索 | 数据遍历 / 爬取 | 索引内容分离，token 控制检索 | `koma-core` |
| AI 编程 agent | Skill 漏调用 / 合规漂移 | 验证准备、动作和完成证据 | `koma-miko@alpha` |

---

### 实测数据

我用 **1,769 条真实提示注入攻击** 在 fail-closed 模式下测试了 Koma Gate，使用真实商用模型——非 mock 适配器。

| 供应商 | 召回率 | 精确率 | 误拦 |
|----------|:------:|:------:|:---:|
| DeepSeek (deepseek-chat) | **98.8%** | **100%** | **0** |
| Google (gemini-2.5-flash) | 96.2% | **100%** | **0** |

**中文攻击集**：8 个类别，100% 召回 · 100% 精确 · 0% 误拦。

> **你能绕过吗？** [提交 issue](https://github.com/swnotmetal/Project-Koma/issues) 告诉我 Koma 漏了什么。→ [完整方法学](./BENCHMARKS.md)

---

### 快速开始

```ts
import { createGeneralKnowledgeGuard } from 'koma-gate';

const guard = createGeneralKnowledgeGuard({
  llm: { apiKey: process.env.GEMINI_API_KEY },
});

app.post('/api/chat', guard.middleware(), async (req, res) => {
  // 只有范围内的请求才会到达模型
  res.json({ reply: await chat(req.body.message) });
});
```

```bash
git clone https://github.com/swnotmetal/Project-Koma
cd Project-Koma && node demo/server.js
curl http://localhost:8080/self-test
```

---

### 三层防御

**`koma-gate`** — 提示注入防火墙。基于 LLM 的范围分类器，拦截越狱、越界请求和指令覆盖。支持 OpenAI、Anthropic、Google、DeepSeek 和本地 Ollama。[README →](./packages/koma-gate/README.md)

<img src="show-koma.gif" alt="Koma Gate 实时拦截提示注入" width="100%" />

**`koma-scout`** — 外围防护。限流、音频上传校验、地理白名单。在昂贵的 AI 调用之前做便宜检查。[README →](./packages/koma-scout/README.md)

<img src="logo/scout-diagram.svg" alt="Koma Scout 外围检查" width="480" />

**`koma-core`** — 受保护的 RAG 存储。公开搜索索引，私有内容，不透明的 HKDF 派生 token。*发现不等于授权。* [README →](./packages/koma-core/README.md)

<img src="logo/core-diagram.svg" alt="Koma Core 分离存储" width="480" />

每层独立使用。叠加：Gate 过滤 → Scout 控流 → Core 存数据。

**Alpha：`koma-miko`** — 验证 agent 是否加载了必需 skill、动作是否符合契约，
以及测试或 UI 渲染检查等完成证据是否真实存在。在 Claude Code 项目中安装并
自动配置：

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host claude
```

无需 API key 即可运行 `npx koma-miko@alpha demo`。DeepSeek Harness 用户可运行
`dsh plugin --profile miko add koma-miko-dsh@alpha`。
[核心 README →](./packages/koma-miko/README.zh-CN.md) ·
[DSH adapter →](./packages/koma-miko-dsh/README.md) ·
[Codex/Gemini Hook 示例 →](./packages/koma-miko/examples) ·
[研究与设计 →](./docs/design/miko.md)

---

### 使用 AI 编程助手？

告诉它：

> *"Add Koma to protect this AI endpoint. Use koma-gate for prompt injection, koma-scout for perimeter abuse, and koma-core for protected RAG retrieval. Each works standalone."*

Koma 同时为人类和 AI agent 的可发现性而设计。参见 [llms.txt](./llms.txt)。

---

### 信任与安全

- **最小依赖面。** Gate 与 Core 没有第三方运行时依赖；Scout 仅将 Express 声明为 peer dependency。
- **不执行代码。** 分类、限流、存储——绝不执行 AI 输出。
- **默认 fail-open。** 可选守卫故障时不拖垮应用；安全优先的部署可设置 `failOpen: false`。
- **每次推送 CodeQL。** 覆盖 OWASP LLM01。
- **MIT 协议。**

→ [安全策略](./SECURITY.md) · [已知限制](./SECURITY-HARDENING.md) · [同类对比](./COMPARISON.zh-CN.md) · [贡献指南](./CONTRIBUTING.md)

---

Koma 取自神社前的石狮"狛犬"（こまいぬ）。三层已部署防御各自独立，另有 Miko alpha agent 契约边界。模式提炼自生产环境，而非纸上谈兵。

[English](./README.md) · [License](./LICENSE)
