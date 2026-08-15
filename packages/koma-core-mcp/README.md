# Koma Core MCP

Expose Koma Core's protected RAG storage as MCP tools for AI agents.

```bash
npm install koma-core-mcp
```

## What it demonstrates

**Discovery ≠ Authorization.** Agents can search the public index, but retrieve private content only with the correct access tier.

| Tool | What it does | Access |
|------|-------------|--------|
| `search_docs` | Search the public index — returns metadata, never content | Public |
| `retrieve_doc` | Fetch full content by source ID | Requires `userTier` ≥ document tier |

## Setup

```bash
# Optional: set a master key for token derivation (default is a demo key)
export KOMA_MASTER_KEY=your-32-byte-minimum-secret
```

### Claude Desktop

```json
{
  "mcpServers": {
    "koma-core": {
      "command": "npx",
      "args": ["-y", "koma-core-mcp"]
    }
  }
}
```

## Tools

### search_docs

- `category` (optional) — filter by category
- `tag` (optional) — filter by tag
- `limit` (optional) — max results

Returns metadata only: `displayName`, `category`, `tags`, `accessTier`, `preview`. **No content, no token.**

### retrieve_doc

- `sourceId` (required) — the document source ID from `search_docs`
- `userTier` (required) — `public` | `premium` | `enterprise`

Returns full content only if `userTier` ≥ the document's tier.

## Seed Data

Three demo documents are ingested on startup:

| sourceId | Tier |
|----------|------|
| `guide-getting-started` | public |
| `api-reference` | premium |
| `internal-architecture` | enterprise |

## Security Boundary

This is an **in-memory reference implementation** — no persistence, demo master key. For production, implement the `DatabaseAdapter` interface against a real database and provide a real master key. See [koma-core's README](../koma-core/README.md) for the full security boundary.
