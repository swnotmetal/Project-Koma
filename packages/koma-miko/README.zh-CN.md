# koma-miko（alpha）

面向 AI agent 工作流的确定性 skill / action 契约验证器。

Miko 在三个可观察节点检查证据：

1. **准备阶段** — 必需的 skill 和参考文档是否真的被加载；
2. **动作之前** — 工具、风险等级与路径范围是否符合契约；
3. **完成之前** — 测试、UI 渲染检查或其他交付义务是否真的执行。

当前是源码 alpha，尚未发布到 npm；首次公开发布前 API 仍可能调整。

## 为什么

Agent 指令是有用的引导，但不等于强制约束。Skill 可能没有被自动触发，
也可能在长会话中逐渐失去影响，或者 agent 前半段遵守规则、结束时却跳过
测试清单。**Miko 不检查隐藏的模型状态，无法测量指令在接近百万 token 的
上下文中是否仍有影响，也无法证明 agent 能从 100 个 Skill 中选对一个。**
宿主记录可观察事件，Miko 根据明确契约验证这些证据。

## 最小示例

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
      skills: ['product-design'],
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

`toClaudePreToolUseDecision(result)` 可将 `ALLOW / DENY / REVIEW` 映射到
Claude Code `PreToolUse` 的 `allow / deny / ask`。非 ALLOW 结果还会同时
向用户显示精简文字，并把恢复提示交给 agent。Miko core 本身不带图形 UI；
CLI、桌面端或 IDE 使用各自原生的文字与审批界面渲染同一结构化结果。

包内的 `koma-miko-claude-hook` 提供最小可用的持久化 Claude Code 适配器：
它观察自动 `Skill` 调用、用户直接输入的 `/skill-name`、`Read`、`Edit` 与
`Write` 事件；使用仅含必要元数据、并记录非 ALLOW 决策的本地 JSONL 账本；
并可根据真实工具与路径激活合约，不再只相信模型提供的任务标签。配置示例见
[`examples/claude-code`](./examples/claude-code)。

试用源码 alpha 时，先构建/安装该包，把示例合约复制到
`.miko/contracts.json`，再把示例 Hook 合并进 `.claude/settings.json`。
示例不会自动启用，因为目标项目中必须真实存在被强制要求的
`frontend-design` Skill。会话元数据写入 `.miko/state/`，该目录应保持忽略。

Claude Code 本地 CLI、Desktop Code tab 与 VS Code/Cursor 扩展共享 settings、
Hooks 和 Skills；云端/远程会话的配置来源不同，企业策略也可能禁用项目 Hook，
因此适配器应报告实际能力，而不是承诺所有表面完全一致。参见官方
[平台概览](https://code.claude.com/docs/en/platforms)、
[Desktop 共享配置](https://code.claude.com/docs/en/desktop) 与
[VS Code 配置](https://code.claude.com/docs/en/ide-integrations)。

## 自动化回放

`npm run eval:replay -w koma-miko` 无需 API key，即可运行十个极简 Skill
合约。每个 Skill 都验证三种情况：没有证据、agent 自述（`asserted`）以及
宿主观察到的加载（`observed`）。只有 observed 或 external 证据能满足合约。
第一个 UI 案例是窄范围强制演示，其余九个保持 review-only。
`npm run eval:claude-hook -w koma-miko` 还会启动三个彼此独立的 Hook 进程，
验证带审计记录的 `DENY → 观察到 Skill → ALLOW`，并确认账本没有保存代码内容。

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

## Alpha 边界

- **不调用 LLM，不做语义任务分类；**
- **不是 planner、router 或 agent runtime；**
- **不监控 context window 或 token；**
- **尚未验证接近百万 token、100 个 Skill 时的模型行为；**
- **暂无托管遥测和云端策略服务；** Claude 适配器仅使用本地 JSONL 账本；
- **不自动改写工具调用；**
- **不声称“加载过 Skill”就等于模型理解、持续记住或遵守了 Skill。**

研究案例、契约模型和 alpha 后问题见
[设计文档](../../docs/design/miko.md)。
