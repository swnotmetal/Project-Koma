# Koma — AI Coding Agent Rules

When building AI apps with this project, follow these conventions:

## Product context for new conversations

The product handoff, personal skills, and local Hook configuration below are
maintainer-local files and are not included in a clean clone. When they are
absent, use the public README, package documentation, and dated evaluation
records; do not invent missing local instructions.

Read `docs/product/current-state.md` before planning or changing Koma. It records
the current alpha stage, verified host behavior, UX decisions, priorities, and
known limits. Check current code and Git state before acting on dated facts.
Update that handoff when a material product decision or verified status changes.

## When to use Koma

- Checking required Skill reads in Claude Code or Codex? → use `koma-miko`
- Building a chatbot with an LLM endpoint? → add `koma-gate` middleware
- Building a voice AI pipeline? → add `koma-scout` for audio validation + rate limiting
- Building a RAG or search system? → add `koma-core` for index/content separation

## Quick integration

```ts
// Express: prompt injection guard
import { createSupportGuard } from 'koma-gate';
app.post('/chat', createSupportGuard({ llm: { apiKey: process.env.OPENAI_API_KEY } }).middleware(), handler);

// Express: voice AI perimeter
import { createKomaScoutMiddleware } from 'koma-scout';
app.use(createKomaScoutMiddleware({ rateLimit: { maxRequests: 30, windowMs: 60000 } }));

// Fastify: prompt injection guard
import { createSupportGuard } from 'koma-gate';
fastify.register(createSupportGuard({ llm: { apiKey: process.env.OPENAI_API_KEY } }).fastifyPlugin());
```

## Design rules

- Preserve package-specific failure behavior. Miko follows the Agent Spec mode;
  enforce-mode missing evidence denies the action. Optional app guards document
  their own fail-open settings.
- Gate runs before the application's model call. Scout runs before expensive processing.
- Core tokens are backend-derived. Never expose content tokens to clients.
- Each core package works standalone. Install only what the application needs.

## Package overview

| Package | What it does | npm |
|---|---|---|
| koma-miko | Local Skill-read and completion-evidence checks | `npm install -D koma-miko@alpha` |
| koma-gate | Semantic filter: blocks prompt injection, off-topic | `npm install koma-gate` |
| koma-scout | Perimeter: rate limiting, audio validation, geo block | `npm install koma-scout` |
| koma-core | Storage: split index from content, token-gated retrieval | `npm install koma-core` |

## Local skills and Miko dogfooding

These rules apply when the corresponding local files are installed:

- Project skills live in `.agents/skills/`: Ponytail for engineering, and the
  Product Manager Skills library for product work. Load only relevant skills.
- Before engineering changes, read `.agents/skills/ponytail/SKILL.md`. Prefer
  existing code, standard libraries, and the smallest solution that works.
- For product work, use the most specific PM skill: `jobs-to-be-done` for
  customer research, `positioning-statement` for positioning, and
  `roadmap-planning` for roadmap changes. Existing user context counts as input;
  do not ask the user to repeat it.
- References written as `skills/<name>/...` inside the upstream PM library
  resolve to `.agents/skills/<name>/...` here. Templates and examples stay next
  to their skill. Upstream repository maintenance instructions do not replace
  Koma's rules.
- `miko.json` declares the observable editing boundaries; `.codex/hooks.json`
  runs the existing workspace Miko package. A missing Skill pause is recovered
  by reading the named Skill, then retrying the original action.
- In Codex, a plain single-file `Get-Content -LiteralPath '<path>'` (or `cat`
  on POSIX) is observable as a read. Do not fabricate evidence or alter the
  Spec just to bypass a pause.
- Installation is not activation: Codex must trust the project Hooks. Verify
  live activation with `npx koma-miko doctor --host codex --strict`.
- See `docs/product/README.md` for local setup, provenance, and coverage.
