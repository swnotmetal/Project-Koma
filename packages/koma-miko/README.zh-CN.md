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
测试清单。Miko 不猜测隐藏的模型上下文，也不依赖 token 阈值。宿主记录事件，
Miko 根据明确契约验证这些证据。

## 最小示例

```ts
import { createMiko } from 'koma-miko';

const miko = createMiko({
  contracts: [{
    id: 'ui-change-v1',
    appliesWhen: { taskTags: ['ui'] },
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
});
miko.record({
  taskId: 'new-settings-page',
  type: 'reference_read',
  path: 'docs/design-system.md',
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
Claude Code `PreToolUse` 的 `allow / deny / ask`。任务标签与跨 hook 进程的
事件持久化仍由宿主负责，Miko 不会静默推断。

## Alpha 边界

- 不调用 LLM，不做语义任务分类；
- 不是 planner、router 或 agent runtime；
- 不监控 context window 或 token；
- 暂无持久化、遥测和托管策略服务；
- 不自动改写工具调用；
- 当前只有内存任务账本。

研究案例、契约模型和 alpha 后问题见
[设计文档](../../docs/design/miko.md)。
