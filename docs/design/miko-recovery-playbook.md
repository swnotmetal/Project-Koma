# Miko recovery playbook

Miko reports a deterministic reason; the host or developer chooses the
recovery action. The verifier never invents a Skill, silently rewrites a tool
call, or grants a permission that the host did not grant.

| Reason code / checkpoint | What it means | Recommended developer action |
|---|---|---|
| `PREPARATION_EVIDENCE_MISSING` / `PREPARE` | A contract became active but no required Skill/reference was observed | Reload the named Skill, read the named reference, then retry the blocked action |
| `SKILL_DECLARED_BUT_NOT_OBSERVED` / `PREPARE` | The agent asserted a Skill, but the host emitted no load event | Treat the assertion as untrusted; invoke the host's real Skill command or inspect the Hook mapping |
| `ACTION_NOT_ALLOWED` / `PRE_ACTION` | The tool is outside the contract's allow-list | Change the plan to an allowed tool, or switch the Spec to `review` and request human approval |
| `PATH_OUT_OF_SCOPE` / `PRE_ACTION` | The requested path is outside the declared project scope | Narrow the target path; do not broaden the scope just to make the current call pass |
| `RISK_EXCEEDED` / `PRE_ACTION` | A high-risk tool or host action exceeds the Spec ceiling | Ask for explicit host approval and add a reviewed, narrow risk override if the workflow truly needs it |
| `COMPLETION_EVIDENCE_MISSING` / `COMPLETE` | Work may be changed, but a required check/review/artifact is unobserved | Run the exact foreground check or review and let the host record its successful result |
| `CONTEXT_EPOCH_MISMATCH` / `PREPARE` | Resume/compaction invalidated evidence that was required to be fresh | Reload the required Skill/reference and repeat any completion checks in the new epoch |

## Host-specific notes

Every interactive adapter defers when Miko returns `ALLOW` and blocks the
proposed action for `DENY`. A `REVIEW` uses the host's native approval path only
when that host can actually open one; otherwise Miko must pause safely and name
the limitation. Deferring is not an approval; the host's own policy remains
authoritative. A denial with an exact recovery step should be handled by the
agent without asking the user to repair evidence manually.

- Claude Code and VS Code map `REVIEW` to `permissionDecision: ask` and `DENY`
  to `permissionDecision: deny`.
- Codex currently does not support `permissionDecision: ask` from
  `PreToolUse`. Miko therefore maps both `REVIEW` and `DENY` to a visible,
  recoverable deny and never emits an explicit allow. This avoids Codex's
  documented failure mode where an unsupported `ask` is ignored and the tool
  call continues.
- Gemini maps `REVIEW` to `decision: ask` on current interactive CLI releases
  and `DENY` to `decision: deny`; non-interactive mode may deny because no user
  is available. Project Hook fingerprints may require a one-time trust action.
- DeepSeek Harness maps `REVIEW` to native `ask` by default. It may steer one
  corrective completion step, bounded by
  `maxCompletionSteers`; it is not an infinite retry loop.

## Operator checklist

1. Read the checkpoint and reason code, not only the red/amber color.
2. Confirm that the missing item is observable evidence, not a model claim.
3. Perform the smallest host-native recovery action.
4. Retry once and inspect the resulting evidence.
5. If the same denial repeats, stop broadening permissions and fix the Spec,
   Skill, or Hook integration deliberately.
