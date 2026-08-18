# MCP Distribution — PR Drafts & Official Registry

Ready-to-paste material for getting the two Koma MCP servers listed in official and
community directories.

## The two servers

| Package | Registry name | Tools | What it does |
|---|---|---|---|
| `koma-gate-mcp` | `io.github.swnotmetal/koma-gate-mcp` | `classify_input` | Blocks prompt injection / jailbreaks / out-of-scope input before an agent acts |
| `koma-core-mcp` | `io.github.swnotmetal/koma-core-mcp` | `search_docs`, `retrieve_doc` | Protected RAG — public index, token-gated content |

Both: TypeScript · stdio transport · MIT · published on npm.

```bash
npx -y koma-gate-mcp
npx -y koma-core-mcp
```

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

This is the canonical registry Claude Desktop / Cursor / most clients discover from.
The packages are already prepared (`mcpName` in `package.json` + `server.json`, both
published on npm).

Use the **official** `mcp-publisher` binary (NOT the unrelated `npx mcp-publisher`
npm package). Install once:

```bash
# Linux/macOS — download the release binary
curl -fsSL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/   # or ~/.local/bin/
# or: brew install mcp-publisher
```

```bash
mcp-publisher login github      # device-flow OAuth as `swnotmetal`

cd packages/koma-gate-mcp && mcp-publisher validate && mcp-publisher publish
cd packages/koma-core-mcp && mcp-publisher validate && mcp-publisher publish
```

Namespace ownership: `mcpName` starts with `io.github.swnotmetal/`, so GitHub auth
as `swnotmetal` is required (already satisfied). Once published, the servers
surface in the official registry and every client that syncs with it (including
the Anthropic/Claude ecosystem) — no separate "Anthropic directory" PR is needed.

---

## 2. `punkpeye/awesome-mcp-servers` (92k+ stars)

Insert both entries under the **`### 🔒 Security`** section. Follow
`CONTRIBUTING.md`: one bullet per server, alphabetical order, install command last.

> **Fast-track tip** (from `CONTRIBUTING.md`): add `🤖🤖🤖` to the **end** of the
> PR title to opt into the streamlined agent-PR process. Your PR gets fast-tracked.

### PR title

```
Add Koma Gate & Koma Core — LLM security MCP servers 🤖🤖🤖
```

### PR body

````markdown
## What

Two MCP servers from [Koma](https://github.com/swnotmetal/Project-Koma), an open-source
prompt-injection firewall for Node.js:

- **Koma Gate MCP** (`koma-gate-mcp`) — `classify_input` blocks prompt injection,
  jailbreaks, and out-of-scope input before an agent acts on it.
- **Koma Core MCP** (`koma-core-mcp`) — `search_docs` + `retrieve_doc` over a
  split-store: the search index is public, content is gated by HKDF-derived tokens.

MIT-licensed, TypeScript, zero runtime dependencies beyond the MCP SDK and the
underlying `koma-gate` / `koma-core` packages. Both published on npm and listed on
the official MCP Registry.

## Install

```bash
npx -y koma-gate-mcp
npx -y koma-core-mcp
```

## Checklist

- [ ] Entries placed in the `🔒 Security` section, alphabetical order
- [ ] Install commands verified (`npx -y <pkg>`)
- [ ] Links point to the package subfolders
````

### Entries to insert (exact list format)

Legend: `📇` TypeScript · `🏠` local/stdio · `🍎 🪟 🐧` cross-platform.

```markdown
- [swnotmetal/Project-Koma](https://github.com/swnotmetal/Project-Koma/tree/main/packages/koma-gate-mcp) 📇 🏠 🍎 🪟 🐧 - Prompt-injection firewall for AI agents. `classify_input` checks untrusted user text for jailbreaks, prompt injection, and out-of-scope requests before the agent acts. Supports OpenAI, Anthropic, Google, DeepSeek, and local Ollama. Install: `npx -y koma-gate-mcp`.
- [swnotmetal/Project-Koma](https://github.com/swnotmetal/Project-Koma/tree/main/packages/koma-core-mcp) 📇 🏠 🍎 🪟 🐧 - Protected RAG storage for AI agents. `search_docs` returns public index metadata only; `retrieve_doc` fetches content only at the correct access tier via HKDF-derived tokens. Discovery ≠ authorization. Install: `npx -y koma-core-mcp`.
```

### About the Glama badge

Many newer entries carry a Glama score badge + link (e.g.
`[![repo MCP server](https://glama.ai/mcp/servers/<owner>/<repo>/badges/score.svg)](...)`).
That badge 404s until the server is indexed by Glama. Two options:

1. **Submit without the badge** — the repo's `check-glama.yml` workflow syncs from
   Glama and will attach the badge once Glama picks the server up.
2. **List on Glama first** — use the "Add Server" flow at `glama.ai/mcp/servers`,
   then include the badge in the PR.

Either is accepted; option 1 is simpler and won't block the merge.

---

## 3. `wong2/awesome-mcp-servers` (and similar community lists)

Same content, adapted to whatever category each list uses (Security / Safety).

### PR title

```
Add Koma Gate & Koma Core MCP servers (prompt-injection firewall + protected RAG)
```

### PR body

````markdown
Two LLM-security MCP servers from [Koma](https://github.com/swnotmetal/Project-Koma):

- **`koma-gate-mcp`** — `classify_input` tool. Blocks prompt injection, jailbreaks,
  and out-of-scope input before an agent acts. OpenAI / Anthropic / Google /
  DeepSeek / Ollama. `npx -y koma-gate-mcp`
- **`koma-core-mcp`** — `search_docs` + `retrieve_doc` tools. Public search index,
  HKDF-token-gated content retrieval. `npx -y koma-core-mcp`

MIT · TypeScript · npm-published.
````

## 4. More community lists (smaller, faster to merge)

Same entries, pasted into whichever category each list uses (Security / Safety).
Formats vary — always check the repo's `CONTRIBUTING.md` first.

| Repo | Notes |
|---|---|
| `wong2/awesome-mcp-servers` | The original list; categories + bullets |
| `appcypher/awesome-mcp-servers` | Popular fork; table-based sections |
| `hesreallyhim/awesome-mcp-servers` | Newer curated list; categories + bullets |

Reusable one-line entries:

```markdown
- [Koma Gate MCP](https://github.com/swnotmetal/Project-Koma/tree/main/packages/koma-gate-mcp) — `classify_input` blocks prompt injection, jailbreaks, and out-of-scope input before an agent acts. OpenAI / Anthropic / Google / DeepSeek / Ollama. `npx -y koma-gate-mcp`
- [Koma Core MCP](https://github.com/swnotmetal/Project-Koma/tree/main/packages/koma-core-mcp) — `search_docs` + `retrieve_doc` over a split-store: public index, HKDF-token-gated content. `npx -y koma-core-mcp`
```

---

## Checklist before submitting

- [ ] Fork the target repo, create a branch.
- [ ] Add the entry/entries to the correct section (Security).
- [ ] Keep install command at the end of the description, matching the list style.
- [ ] Test both `npx -y` commands locally (Node ≥ 18).
- [ ] One PR per list; link back to `https://github.com/swnotmetal/Project-Koma`.
