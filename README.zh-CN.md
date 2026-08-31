# Koma（狛犬）

### 验证编程 agent 真实做过什么，也保护它们构建的 AI 应用。

Koma 是一套面向可观察 AI 边界的 TypeScript 工具。**Miko** 根据本地 Agent
Spec 检查 coding agent 的 Skill、工具动作与完成证据；**Gate、Scout 和 Core**
分别保护 prompt 输入、外围资源与检索边界。

```bash
npm install -D koma-miko@alpha
npx koma-miko init --host claude
```

如果你正在构建 LLM endpoint，可以从 `npm install koma-gate` 开始。

<p align="center">
  <img src="logo/logobanner.png" alt="Koma" width="600" />
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="CI" src="https://github.com/swnotmetal/Project-Koma/actions/workflows/ci.yml/badge.svg" />
  <a href="https://www.npmjs.com/package/koma-miko"><img alt="koma-miko" src="https://img.shields.io/npm/v/koma-miko/alpha?label=koma-miko%20alpha&color=C25E38&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-gate"><img alt="koma-gate" src="https://img.shields.io/npm/v/koma-gate?label=koma-gate&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-scout"><img alt="koma-scout" src="https://img.shields.io/npm/v/koma-scout?label=koma-scout&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-core"><img alt="koma-core" src="https://img.shields.io/npm/v/koma-core?label=koma-core&color=3178c6&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/koma-miko-dsh"><img alt="koma-miko-dsh" src="https://img.shields.io/npm/v/koma-miko-dsh/alpha?label=DSH%20adapter&color=C25E38&style=flat-square" /></a>
  <br />
  <a href="https://koma-demo.swbuilds.workers.dev"><img alt="Miko live demo" src="https://img.shields.io/badge/Miko_demo-10--sec_replay-C25E38?style=flat-square" /></a>
  <img alt="Gate benchmark" src="https://img.shields.io/badge/Gate实测-98.8%25召回_0%25误拦-6e3abe?style=flat-square" />
  <img alt="koma-gate downloads" src="https://img.shields.io/npm/dt/koma-gate?label=gate%20下载量&color=blue&style=flat-square" />
  <a href="https://glama.ai/mcp/servers/swnotmetal/Project-Koma"><img alt="MCP server" src="https://glama.ai/mcp/servers/swnotmetal/Project-Koma/badges/score.svg" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

<p align="center">
  <strong>▶ <a href="https://koma-demo.swbuilds.workers.dev">体验 Miko 终端引导回放</a></strong> —— 同页还有 Gate、Scout、Core，无需注册。
</p>

---

### 当前主推：Miko Alpha

<p align="center">
  <img src="packages/koma-miko/assets/miko-lockup.png" alt="Koma Miko" width="420" />
</p>

Coding agent 可以声称自己加载了必需 Skill 或运行了测试，但 Miko 不把自述当作
证据。在宿主提供的本地 Hook 上，它会把观察到的 Skill 加载、参考文档读取、
工具动作和完成检查，与项目维护的 `miko.json` 比对。

如果 agent 尚未满足 Spec 就尝试修改文件，Miko 可以返回拒绝和简短的恢复提示。
它无法读取隐藏模型上下文、证明模型真正理解了 Skill，也无法验证宿主没有暴露的
事件。

```bash
npx --yes koma-miko@alpha demo       # 确定性回放；无需 API key
npx --yes koma-miko@alpha probe --host claude  # 隔离式 adapter 检查；不调用模型
npx koma-miko init --host claude     # 本地安装后自动配置
```

> **Codex 是更窄的 Preview 路径，并不等同于 Claude Code。** Codex CLI
> 必须先通过一次 `/hooks` 审阅，项目 Hook 才会运行。在我们当前的 Codex
> Desktop 测试中，5 个已正确安装的 Hook 在 CLI 完成信任前仍未生效；仅使用
> Desktop 的首次启用流程还不够适合作为 vibe coder 主路径。离线 `probe` 只验证
> adapter 逻辑，不代表真实 Hook 已激活。

[Miko README →](./packages/koma-miko/README.zh-CN.md) ·
[10 秒网页回放 →](https://koma-demo.swbuilds.workers.dev) ·
[DeepSeek Harness adapter →](./packages/koma-miko-dsh/README.md)

---

### 四种边界

| 边界 | 失败方式 | Koma 检查什么 | Package |
|---|---|---|---|
| Coding agent | 必需 Skill 或完成检查被跳过 | 宿主观察到的准备、动作范围与证据 | `koma-miko@alpha` |
| 用户 → LLM | 提示注入 / 越狱 | 应用模型之前的语义范围 | `koma-gate` |
| 请求外围 | 音频滥用 / 洪水攻击 | 校验、限流与地理规则 | `koma-scout` |
| 检索 | 数据遍历 / 爬取 | 索引与内容分离，token 控制检索 | `koma-core` |

---

### 实测数据

#### Miko alpha 评估

Miko 本身是确定性验证器，因此这里衡量的是验证开销和端到端 Hook 行为，
而不是给模型“智力”打一个笼统分数。

| 信号 | 实测结果 |
|---|---|
| 离线宿主一致性 | Claude、Codex、Gemini 与 VS Code Copilot 均复现 `DENY → 观察到 Skill → ALLOW`；账本夹具确认不保存 prompt、代码或工具响应 |
| 本地 verifier 规模测试 | 1,000 份 Agent Spec：每次动作 **p95 1.34 ms**；10,001 条索引证据：**p95 0.0041 ms**；恢复 1,000 条证据：**p95 1.52 ms** |
| Claude Code smoke | 一次 100-Skill / 约 20k context 测试通过；另一次单 Skill 恢复完成 `DENY → Skill → edit` |
| Codex 激活 smoke | 使用现有 ChatGPT 登录态，在 CLI 一次性信任后观察到真实 `SessionStart` / `Stop` Hook 并写入本地 Miko heartbeat；该测试只证明激活，尚未完成编辑恢复链路 |
| DeepSeek Harness smoke | 窄范围 packed-artifact 恢复 **3/3** 通过；模型阶段平均 19.425 秒 |

规模数据来自 2026-08-27 的 Node 24.19 / Windows 参考运行；可用
`npm run eval:scale -w koma-miko` 在自己的机器复现。Context token 不会进入
verifier。付费样本刻意保持很小，**不能证明普遍的模型、长上下文或编辑器可靠性**。
参见 [scale 记录](./docs/evals/miko-scale-alpha.md)、
[Claude 记录](./docs/evals/miko-claude-haiku-alpha.md)、
[宿主适配器记录](./docs/evals/miko-host-adapters-alpha.md) 与
[DSH 记录](./docs/evals/miko-dsh-alpha.md)。

#### Koma Gate 真实模型 benchmark

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

### 应用侧 Packages

**`koma-gate`** — 提示注入防火墙。基于 LLM 的范围分类器，拦截越狱、越界请求和指令覆盖。支持 OpenAI、Anthropic、Google、DeepSeek 和本地 Ollama。[README →](./packages/koma-gate/README.md)

<img src="show-koma.gif" alt="Koma Gate 实时拦截提示注入" width="100%" />

**`koma-scout`** — 外围防护。限流、音频上传校验、地理白名单。在昂贵的 AI 调用之前做便宜检查。[README →](./packages/koma-scout/README.md)

<img src="logo/scout-diagram.svg" alt="Koma Scout 外围检查" width="480" />

**`koma-core`** — 受保护的 RAG 存储。公开搜索索引，私有内容，不透明的 HKDF 派生 token。*发现不等于授权。* [README →](./packages/koma-core/README.md)

<img src="logo/core-diagram.svg" alt="Koma Core 分离存储" width="480" />

每层独立使用。叠加：Gate 过滤 → Scout 控流 → Core 存数据。

---

### 使用 AI 编程助手？

告诉它：

> *"Add Koma to protect this AI endpoint. Use koma-gate for prompt injection, koma-scout for perimeter abuse, and koma-core for protected RAG retrieval. Each works standalone."*

对于 coding-agent 项目，安装 Miko 后运行
`npx koma-miko init --host claude`，再在生成的 `miko.json` 中填写项目真正关心的
Skill、路径与完成证据。

Koma 同时为人类和 AI agent 的可发现性而设计。参见 [llms.txt](./llms.txt)。

---

### 信任与安全

- **最小依赖面。** Miko、Gate 与 Core 没有第三方运行时依赖；Scout 仅将 Express 声明为 peer dependency。
- **不执行模型输出。** Miko 观察宿主事件；Gate、Scout、Core 负责分类、限流或存储，均不执行生成代码。
- **默认 fail-open。** 可选守卫故障时不拖垮应用；安全优先的部署可设置 `failOpen: false`。
- **每次推送 CodeQL。** 覆盖 OWASP LLM01。
- **MIT 协议。**

→ [安全策略](./SECURITY.md) · [已知限制](./SECURITY-HARDENING.md) · [同类对比](./COMPARISON.zh-CN.md) · [贡献指南](./CONTRIBUTING.md)

---

Koma 取自神社前的石狮"狛犬"（こまいぬ）。三层已部署防御各自独立，另有 Miko alpha agent 契约边界。模式提炼自生产环境，而非纸上谈兵。

[English](./README.md) · [License](./LICENSE)
