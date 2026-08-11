# Koma Miko — Design Document

Status: **pre-implementation research**. No code yet. This document exists to
clarify the problem before we build the wrong solution.

---

## 1. Observed Failures

> *Fill in from your internship — real cases where an AI agent selected the
> wrong tool, called a tool with mismatched intent, or bypassed skill contracts.*

| # | What happened | Why it matters |
|---|--------------|----------------|
| 01 | *(e.g. Agent has 30 skills. User asks for order lookup. Agent calls delete_customer.)* | |
| 02 | | |
| 03 | | |
| 04 | | |
| 05 | | |
| 06 | | |
| 07 | | |
| 08 | | |
| 09 | | |
| 10 | | |

---

## 2. What Miko Is

> **A verifier that sits between an agent's proposed tool call and actual
> execution. It checks whether the call is appropriate for the current task,
> given the tool's declared contract — without taking over planning.**

Miko does **not** decide what the agent should do. It only checks what the agent
*already decided to do* against a policy.

---

## 3. Non-Goals

Miko is explicitly **not**:

| Not this | Why |
|----------|-----|
| A planner | Miko doesn't choose tools; the agent does |
| A router | Miko doesn't redirect calls to different tools |
| A skill allocator | Miko doesn't match tasks to skills |
| An agent framework | Miko is a verifier, not a runtime |
| A permission system | Miko checks intent/task alignment, not RBAC |
| Another LLM classifier | Deterministic checks first; semantic only when needed |

---

## 4. Architecture

```
                    ┌──────────────┐
User ──────────────►│     Agent    │
                    │  reasoning   │
                    │  planning    │
                    └──────┬───────┘
                           │ proposed tool call
                           ▼
                  ┌─────────────────┐
                  │      MIKO       │
                  │                 │
                  │ deterministic   │
                  │   checks ───────┤
                  │                 │
                  │ semantic check  │
                  │  (if needed)    │
                  └────────┬────────┘
                           │ ALLOW / DENY / REVIEW
                           ▼
                         Tool
```

### Decision vocabulary (v1)

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Tool call matches task, contract, and policy |
| `DENY` | Clear violation of contract, scope, or policy |
| `REVIEW` | Cannot reliably determine — escalate to host application |

`REVIEW` is intentionally a non-decision. The host application decides what to
do (ask user, fallback, human approval).

---

## 5. Verification Model

### 5.1 Deterministic Checks (always run)

```
tool exists in registry?
  ↓
arguments match schema?
  ↓
capability allowed by policy?
  ↓
risk level allowed for this task?
  ↓
scope within allowed boundaries?
```

### 5.2 Semantic Check (optional, configurable)

Only invoked when deterministic checks pass but the system is configured for
deeper verification:

> *"Is this proposed tool invocation semantically appropriate for the
> agent's current task and declared capability?"*

The semantic check may use an LLM, but it receives structured input (task
description, tool contract, proposed call) — not raw conversation history.

---

## 6. Tool Contract (example)

Each tool/skill in the agent's arsenal has a contract that Miko validates
against:

```json
{
  "name": "search_docs",
  "description": "Search internal documentation",
  "capabilities": ["document_search", "knowledge_lookup"],
  "risk": "low",
  "arguments": {
    "query": { "type": "string", "required": true },
    "maxResults": { "type": "number", "default": 10 }
  }
}
```

```json
{
  "name": "delete_file",
  "description": "Permanently delete a file",
  "capabilities": ["filesystem_mutation"],
  "risk": "high",
  "arguments": {
    "path": { "type": "string", "required": true }
  }
}
```

---

## 7. API Sketch (v1)

```
const miko = createMiko({
  tools: [searchDocsContract, deleteFileContract, ...],
  policy: {
    allowedCapabilities: ['document_search', 'knowledge_lookup'],
    maxRisk: 'medium',
  },
});

const decision = await miko.verify({
  task: "User asked to find Q3 financial report",
  toolCall: {
    name: "search_docs",
    arguments: { query: "Q3 financial report" }
  },
});

// decision: { allowed: true | false, reason: string, confidence?: number }
```

---

## 8. Relationship to Other Koma Packages

```
                 KOMA
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
    INPUT       NETWORK      DATA      ACTION
    GATE        SCOUT        CORE       MIKO
      │           │           │           │
 prompt/scope  rate limit   RAG token   tool call
 classifier    audio geo    access      verification
```

Each package guards a different boundary. They don't depend on each other.
They share a philosophy: small, standalone, zero-dependency primitives.

---

## 9. Open Questions

- Should tool contracts be defined in-code, in config, or inferred from
  existing tool registries (MCP, LangChain tools, etc.)?
- How does Miko integrate with different agent runtimes without becoming
  a framework dependency?
- Should `REVIEW` decisions be pluggable (custom handler per application)?
- Does the semantic check need its own LLM call, or can it share context
  with the agent's existing LLM session?
