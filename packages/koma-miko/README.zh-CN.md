# koma-miko（alpha）

<p align="center">
  <img src="./assets/miko-lockup.png" alt="Koma Miko" width="420" />
</p>

面向 AI agent 工作流的确定性 skill / action 契约验证器。

可以把每份 Contract 理解成开发者维护的 **Agent Spec（智能体测试用例）**：
它像测试代码一样约束 agent 如何准备、行动和完成任务，而不是企业治理控制台。

Miko 在三个可观察节点检查证据：

1. **准备阶段** — 必需的 skill 和参考文档是否真的被加载；
2. **动作之前** — 工具、风险等级与路径范围是否符合契约；
3. **完成之前** — 测试、UI 渲染检查或其他交付义务是否真的执行。

公开 alpha 已发布：

```sh
npm install koma-miko@alpha
```

首次稳定版之前 API 仍可能调整。

## 为什么

Agent 指令是有用的引导，但不等于强制约束。Skill 可能没有被自动触发，
也可能在长会话中逐渐失去影响，或者 agent 前半段遵守规则、结束时却跳过
测试清单。**Miko 不检查隐藏的模型状态，无法测量指令在接近百万 token 的
上下文中是否仍有影响，也无法证明 agent 能从 100 个 Skill 中选对一个。**
宿主记录可观察事件，Miko 根据明确契约验证这些证据。

## 最小示例

开发者直接维护项目根目录的 `miko.json`：

```json
{
  "$schema": "./node_modules/koma-miko/schema/miko.schema.json",
  "version": 1,
  "specs": [
    {
      "id": "ui-change-v1",
      "appliesWhen": {
        "action": {
          "tools": ["Edit", "Write"],
          "pathPrefixes": ["src/ui"]
        }
      },
      "requires": {
        "skills": [
          { "name": "product-design", "reloadAfterCompaction": true }
        ]
      },
      "mode": "enforce"
    }
  ]
}
```

TypeScript API 可以直接使用同一批 Spec 对象：

```ts
import { createMiko } from 'koma-miko';

const miko = createMiko({
  contracts: [{
    id: 'ui-change-v1',
    appliesWhen: {
      action: {
        tools: ['write_file'],
        pathPrefixes: ['src/ui'],
      },
    },
    requires: {
      skills: [{ name: 'product-design', reloadAfterCompaction: true }],
      references: ['docs/design-system.md'],
    },
    actions: {
      allow: ['read_file', 'write_file', 'run_check'],
      deny: ['delete_file'],
      maxRisk: 'medium',
      scope: {
        tools: ['write_file'],
        allowedPathPrefixes: ['src/ui'],
      },
    },
    completion: {
      evidence: [
        { type: 'check_passed', name: 'rendered-ui-review' },
        { type: 'check_passed', name: 'targeted-tests' },
      ],
    },
    mode: 'review',
  }],
});

miko.startTask({
  sessionId: 'session-7',
  taskId: 'new-settings-page',
  tags: ['ui'],
});

// 未记录 product-design 与 design-system 时返回 REVIEW。
miko.verifyPreparation('new-settings-page');

miko.record({
  taskId: 'new-settings-page',
  type: 'skill_loaded',
  name: 'product-design',
  source: 'observed',
});
miko.record({
  taskId: 'new-settings-page',
  type: 'reference_read',
  path: 'docs/design-system.md',
  source: 'observed',
});

miko.verifyAction({
  taskId: 'new-settings-page',
  tool: 'write_file',
  risk: 'medium',
  arguments: { path: 'src/ui/Settings.tsx' },
});

// 直到完成证据齐全前都返回 REVIEW。
miko.verifyCompletion('new-settings-page');
```

`mode: 'review'` 会把缺失证据映射为 `REVIEW`；`mode: 'enforce'` 则映射为
`DENY`。明确越权的工具、风险或路径在两种模式下都会返回 `DENY`。

终端文字采用有阶段含义、且长度受限的开发者红绿灯；即使许多 Agent Spec
重叠，也只展开最重要的前三项：

```text
🔴 Miko DENY · PREPARE — PREPARATION_EVIDENCE_MISSING
Missing evidence:
- ui-change-v1:skill_loaded:product-design
Next: load the required skill/reference, then retry the blocked action.
```

当集成方明确需要完整三态映射时，`toClaudePreToolUseDecision(result)` 可将
`ALLOW / DENY / REVIEW` 映射到 Claude Code `PreToolUse` 的
`allow / deny / ask`。非 ALLOW 结果还会同时
向用户显示精简文字，并把恢复提示交给 agent。Miko Verifier 本身不带图形 UI；
CLI、桌面端或 IDE 使用各自原生的文字与审批界面渲染同一结构化结果。
所有 adapter 现在统一使用一套可感知状态语言：DENY 显示
`🔴 Miko 已暂停/拦截`，REVIEW 显示 `🟡 Miko 需要你的决定`，新观察到的证据
补齐 PREPARE 时显示 `🟢 Miko 已恢复`，活动 Agent Spec 到达 COMPLETE 时显示
精简的 `🟢 Miko 已验证` 收据。面向用户的状态保持简短；精确缺失项只进入
agent 上下文与本地账本。
包内所有 adapter 统一遵守一条交互规则：`ALLOW` 只表示 Miko 不反对，仍由宿主
自身的权限策略决定；`REVIEW` 调用宿主原生审批；`DENY` 只拦截当前动作，并把
恢复信息交给 agent。可恢复的拒绝应由 agent 自行补齐证据并重试，不要求用户
手工修理 Miko 状态。共享的 `toHostInteractionDecision(result)` 将这条规则表达为
`defer | ask | deny`；包内 Claude adapter 即使底层 mapper 能生成 `allow`，也会
刻意对 `ALLOW` 不输出显式放行。

包内的 `koma-miko-claude-hook` 提供最小可用的持久化 Claude Code 适配器：
它观察自动 `Skill` 调用、用户直接输入的 `/skill-name`、`Read`、`Edit` 与
`Write` 事件；使用仅含必要元数据、并记录非 ALLOW 决策的本地 JSONL 账本；
并可根据真实工具与路径激活合约，不再只相信模型提供的任务标签。配置示例见
[`examples/claude-code`](./examples/claude-code)。

设置 `reloadAfterCompaction: true` 的 Skill 会在 Claude `PostCompact` 后重新
变为缺失。adapter 保留 append-only JSONL 作为审计记录，同时使用紧凑 snapshot，
每次 Hook 只需回放 snapshot 之后的尾部事件。该账本便于审计，但并非防篡改账本。

在 Claude Code 项目中试用 alpha 时，安装后让初始化命令自动完成配置：

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host claude
```

`init` 会创建一个默认 `review-only` 的 starter `miko.json`，把所需 Claude
Hook 合并进 `.claude/settings.json`（不会替换无关设置），修改已有设置前先
备份，并把 `.miko/state/` 加入 `.gitignore`。命令可以安全重复运行。使用
`--skill <name>` 和 `--path <prefix>` 定制 starter spec；准备好阻止缺失证据
后再加 `--enforce`。修改 Hook 后请重新启动 Claude 会话；使用 `--dry-run`
可只预览改动。Codex、Gemini 与 VS Code Copilot 可分别使用 `--host codex`、
`--host gemini` 或 `--host vscode`（`--host copilot` 是别名）。

初始化器不会覆盖已有的 `miko.json`；请按项目实际情况编辑它。会话元数据写入
`.miko/state/`，该目录应保持忽略。旧 `.miko/contracts.json` 数组仍可读取，
但不再是推荐的开发者入口。

花费模型额度前，先运行完全离线的预检：

```sh
npx koma-miko probe --host claude
npx koma-miko probe --host codex
npx koma-miko probe --host gemini
npx koma-miko probe --host vscode
npx koma-miko doctor
npx koma-miko doctor --strict --json
npx koma-miko doctor --host codex
npx koma-miko doctor --host gemini --strict
npx koma-miko doctor --host vscode --strict
```

`probe` 会在隔离 fixture 中让所选 adapter 完整走一遍
`DENY -> evidence -> ALLOW`，检查 JSONL ledger 没有 prompt、源码或工具输出，
随后自动清理。它不会调用模型，也不会修改当前项目；`--json` 输出同一份
隐私安全报告。它验证的是 adapter conformance，不代表用户安装的宿主版本一定
会发出完全相同的事件或工具名。

Doctor 会验证 Agent Spec，并报告所选宿主的 Skill、Hook 覆盖范围以及
`.miko/state/` 是否已忽略。默认检查 Claude；检查其他宿主时选择对应的
`--host`。它不会调用模型，也不会读取 API key。

Claude Code 本地 CLI、Desktop Code tab 与 VS Code/Cursor 扩展共享 settings、
Hooks 和 Skills；云端/远程会话的配置来源不同，企业策略也可能禁用项目 Hook，
因此适配器应报告实际能力，而不是承诺所有表面完全一致。参见官方
[平台概览](https://code.claude.com/docs/en/platforms)、
[Desktop 共享配置](https://code.claude.com/docs/en/desktop) 与
[VS Code 配置](https://code.claude.com/docs/en/ide-integrations)。

## Codex、Gemini 与 VS Code Copilot 宿主适配器

alpha 也提供以下窄范围 Hook 适配器：

- `koma-miko-codex-hook` 消费 Codex 的 `SessionStart`、`PreToolUse`、
  `PostToolUse`、`PostCompact` 与 `Stop` 事件。Codex 当前可以解析、但尚不能
  执行来自 `PreToolUse` 的 `permissionDecision: ask`，因此 `REVIEW` 与 `DENY`
  都会用 `permissionDecision: deny` 暂停本次调用。review 暂停会明确说明宿主
  限制，并让 Agent 加载缺失证据，或者请用户修改 Agent Spec。适配器刻意
  不发出 `allow`，让 Codex 自己的权限策略保持最终权威。参见官方
  [Codex Hooks 文档](https://learn.chatgpt.com/docs/hooks#pretooluse)。`apply_patch` 只记录
  路径元数据，并且只识别极窄的只读
  `Get-Content`/`cat` Skill 重载命令。
- `koma-miko-gemini-hook` 消费 Gemini 的 `BeforeTool`、`AfterTool`、
  `SessionStart`、`PreCompress` 与 `AfterAgent` 事件。`DENY` 映射到 Gemini
  原生的 `decision: deny`，`REVIEW` 映射到当前 CLI 的交互式
  `decision: ask`，并且只记录成功工具的元数据。无交互模式没有用户可询问，
  因而可能把 review 当作 deny；早于 Hook `ask` 的 Gemini CLI 版本需要升级。
  Gemini 项目级 Hook 首次
  可能需要用户信任 Hook 指纹；无交互自动化应把命令安装到受信任的用户设置层，
  活体验证 runner 就采用此方式。
- `koma-miko-vscode-hook` 消费 VS Code 的 `SessionStart`、`PreToolUse`、
  `PostToolUse`、`PreCompact` 与 `Stop`。它使用官方文档中的嵌套
  `permissionDecision: ask | deny` 与 stop 输出，把多文件编辑拆成逐路径校验，
  并且不会用显式 allow 覆盖 VS Code 自己的审批策略。初始化器会写入
  `.github/hooks/miko.json`；不需要安装扩展，也不需要 Miko API key。

可以让 Copilot Agent mode 针对一个已有项目 Skill 做小范围测试：

```sh
npm install -D koma-miko@alpha
npx koma-miko init --host vscode --skill product-design --path src --enforce
npx koma-miko doctor --host vscode --strict
```

新开 Copilot chat 后，请它修改 `src` 下的文件。预期第一次被 Miko 拒绝；随后
agent 明确读取 `.github/skills/product-design/SKILL.md`（也支持 `.agents` 或
`.claude` 下同名 Skill），再重试成功。可查看 **GitHub Copilot Chat Hooks**
输出，或运行 **Developer: Show Agent Debug Logs** 记录真实 `tool_name`。VS Code
Agent Hooks 目前仍是 Preview，且组织策略可以禁用。VS Code 默认还会加载
`.claude/settings*.json`；如果其中已有 Miko Claude Hook，`doctor` 会提示潜在的
重复执行。

实现依据官方 [VS Code Agent Hooks 指南](https://code.visualstudio.com/docs/agent-customization/hooks)、
[Hook schema](https://code.visualstudio.com/docs/agents/reference/hooks-reference) 与
[Copilot Agent Skills 目录约定](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)。

这些适配器只是宿主连接层，并不承诺所有编辑器、云端会话或特殊工具路径都会
发出相同事件。云端工具可能不进入本地账本，宿主返回值也只能提供尽力而为的
成功信号。尤其是 Copilot 原生 Skill 注入如果没有产生文档化工具事件，就不能
算作 observed evidence；当前 alpha 的恢复路径要求可观察的 `read_file` 或极窄
的只读终端读取命令。配置示例见 [`examples/codex`](./examples/codex)、
[`examples/gemini`](./examples/gemini) 与 [`examples/vscode`](./examples/vscode)。

## 自动化回放

无需克隆仓库即可试用已发布的 alpha：

```sh
npx koma-miko@alpha demo
```

该命令会在无需 API key 或项目配置的情况下运行十个确定性的 Agent Spec。
源码级开发时，可在仓库内使用 `npm run eval:replay -w koma-miko` 运行同一回放。

`npm run eval:replay -w koma-miko` 无需 API key，即可运行十个极简 Skill
合约。每个 Skill 都验证三种情况：没有证据、agent 自述（`asserted`）以及
宿主观察到的加载（`observed`）。只有 observed 或 external 证据能满足合约。
第一个 UI 案例是窄范围强制演示，其余九个保持 review-only。
`npm run eval:claude-hook -w koma-miko` 还会启动三个彼此独立的 Hook 进程，
验证带审计记录的 `DENY → 观察到 Skill → ALLOW`，并确认账本没有保存代码内容。
`npm run eval:codex-hook -w koma-miko`、`npm run eval:gemini-hook -w koma-miko`
与 `npm run eval:vscode-hook -w koma-miko` 会在无需 API key 的情况下走同一套
独立 Hook 一致性测试；VS Code 这一步覆盖文档化 Hook schema，不代表真实编辑器
活体验证。Codex live runner（`npm run eval:codex-live -w koma-miko`）使用现有
Codex CLI 登录态（`MIKO_CODEX_BIN`），不需要 OpenAI API key。Gemini live
runner（`npm run eval:gemini-live -w koma-miko`）使用父进程中的
`GEMINI_API_KEY` 或 `GOOGLE_API_KEY` 与官方 Gemini CLI 入口
（`MIKO_GEMINI_ENTRY`）。两个 runner 都使用一次性夹具，且不会读取 env 文件。
`npm run eval:scale -w koma-miko` 不需要 API key；它会测试 100/1,000 份
Agent Spec、10,000 条索引证据、100 份重叠 Spec、snapshot 恢复和终端输出上限。
带环境信息的结果见 [scale 参考记录](../../docs/evals/miko-scale-alpha.md)；它衡量
本地 verifier，不是模型 benchmark。
`npm run eval:audit-demo -w koma-miko` 会用真实 Verifier 结果重新生成公开 CLI
引导演示背后的 13 个事件；`eval:audit-demo:check` 只检查 fixture 是否过期。
回放不包含 prompt、代码或模型回复，也不需要后端。终端故事只是展示层；可展开
的原始事件仍保留 reason code、provenance 与 contract ID，供技术读者检查。

父进程设置好 `ANTHROPIC_API_KEY` 后，
`npm run eval:claude-live -w koma-miko` 会运行一个可自动删除的真实 Claude Code
fixture。它只暴露 `Read`、`Edit` 与 `Skill`，默认使用 Haiku，单次硬上限为
`$0.10`，并验证：

```text
Read → Miko DENY → Claude 加载 frontend-design → Miko 放行 → Edit
```

fixture 建在包工作区内，使 Claude Code 把它视为项目内容，结束后删除。runner
不会自行读取任何 env 文件。可用 `MIKO_LIVE_MODEL` 与
`MIKO_LIVE_MAX_BUDGET_USD` 覆盖默认值（runner 最高只接受 `$1`）。

100 Skills 长上下文 fixture 应先离线检查，不消耗额度：

```sh
npm run eval:claude-scale-dry -w koma-miko
```

然后再运行约 20k-token、硬上限 `$0.12` 的单次 Haiku 测试：

```sh
MIKO_LIVE_CONTEXT_TOKENS=20000 \
MIKO_LIVE_MAX_BUDGET_USD=0.12 \
MIKO_LIVE_CAMPAIGN_BUDGET_USD=0.12 \
npm run eval:claude-scale-live -w koma-miko
```

runner 最多接受三个以逗号分隔、范围为 1,000–190,000 的上下文档位；它会生成
恰好 100 个项目 Skills，仅暴露 `Read`/`Edit`/`Skill`，在一次性目录运行并记录
cache、turn 与成本。runner 不会读取 env 文件。结果见
[alpha 评估记录](../../docs/evals/miko-claude-haiku-alpha.md)。

## Alpha 边界

- **不调用 LLM，不做语义任务分类；**
- **不是 planner、router 或 agent runtime；**
- **不监控 context window 或 token；**
- **无法强迫模型调用或遵守 Skill；只能拒绝可观察的动作、返回恢复提示并记录违约；**
- **100-Skills fixture 仅在约 20k tokens 的一次 Haiku 测试中通过；这不能代表 100k、190k 或近百万 token 的行为；**
- **暂无托管遥测和云端策略服务；** Claude 适配器仅使用本地 JSONL 账本；
- **无法观察没有发出已配置宿主 Hook 事件的云端工具、编辑器包装层或远程会话；**
- **VS Code Agent Hooks 仍是 Preview；适配器已通过离线 schema 一致性测试，
  但仍需在测试者的真实 Copilot 工具集上完成编辑器活测；**
- **不自动改写工具调用；**
- **不声称“加载过 Skill”就等于模型理解、持续记住或遵守了 Skill。**

研究案例、契约模型和 alpha 后问题见
[设计文档](../../docs/design/miko.md)；常见违约处理见
[恢复手册](../../docs/design/miko-recovery-playbook.md)；产品定位与可执行 TODO 见
[开发者路线图](../../docs/design/miko-roadmap.md)。
