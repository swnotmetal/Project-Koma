# Koma Gate MCP

Expose Koma Gate's prompt-injection classification as an MCP tool for AI agents.

```bash
npm install koma-gate-mcp
```

## What it does

Provides a single tool, `classify_input`, that an AI agent can call to check whether untrusted user text is safe and in-scope before acting on it.

## Setup

Set the provider and API key:

```bash
# Provider: openai | anthropic | google | deepseek | ollama (default: google)
export KOMA_PROVIDER=google
export GEMINI_API_KEY=sk-...
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "koma-gate": {
      "command": "npx",
      "args": ["-y", "koma-gate-mcp"]
    }
  }
}
```

## Tool: classify_input

- `text` (required) — the untrusted user input to classify
- `preset` (optional) — `general` | `code` | `support` | `reference` (default: general)

Returns:

```json
{
  "allowed": true,
  "in_scope": true,
  "reason": "in scope",
  "preset": "general",
  "model": "gemini-2.5-flash"
}
```

## Security Boundary

This is an LLM-based scope classifier, not a cryptographic prompt-injection defense. See [koma-gate's README](../koma-gate/README.md) for the full security boundary and [BENCHMARKS.md](../../BENCHMARKS.md) for evaluation results.
