# Koma — Online Demo

A zero-friction, interactive demo of the three Koma defenses:

- **Gate** — semantic prompt-injection firewall (real LLM classifier)
- **Scout** — deterministic early-stage checks (size / duration / MIME / country)
- **Core** — split-store retrieval (search shows metadata only; content needs the right tier)

This demo runs the actual `koma-gate` npm package (LLM classifier), **not** a
keyword list. The API key stays server-side and is never sent to the browser.

## Local run

```bash
# from the demo/web directory
npm install
# put your key in .env (auto-loaded on start) or export it
echo 'GEMINI_API_KEY=your-key' > .env
node server.mjs
# open http://localhost:8080
```

If you run it from the monorepo root instead, the workspace `koma-gate` package is
resolved automatically — no separate install needed:

```bash
GEMINI_API_KEY=your-key node demo/web/server.mjs
```

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `KOMA_PROVIDER` | no | `google` (default), `openai`, `anthropic`, or `ollama` |
| `KOMA_MODEL` | no | Model override (defaults per provider: `gemini-2.5-flash`, `gpt-4o-mini`, `claude-3-haiku`, `llama3.1:8b`) |
| `GEMINI_API_KEY` | if provider=google | Google Gemini API key |
| `OPENAI_API_KEY` | if provider=openai | OpenAI API key |
| `ANTHROPIC_API_KEY` | if provider=anthropic | Anthropic API key |
| `KOMA_BASE_URL` | no | Base URL override (e.g. a proxy) |

`ollama` requires no key but needs a local Ollama server at `localhost:11434`.

## Deploy

### Cloudflare Workers (recommended for cost safety)

Cloudflare is the best fit here because it gives you a **globally consistent,
atomic** rate limiter (Durable Objects) — Vercel's in-memory limiter resets per
instance, so it cannot enforce a hard daily budget.

1. `cd demo/web && npm install`
2. Set your key as a secret: `npx wrangler secret put GEMINI_API_KEY`
3. Apply the feedback schema: `npx wrangler d1 migrations apply koma-demo-feedback --remote`
4. (Optional kill switch) Create a KV namespace, uncomment the `kv_namespaces`
   block in `wrangler.toml`, and paste the id.
5. `npx wrangler deploy`

`wrangler.toml` is already configured with:

- Static assets served from `public/`
- `nodejs_compat` (enabled by default on compatibility date ≥ 2026-08-04, needed
  by `koma-gate`'s `crypto.createHash`)
- A Durable Object rate limiter: **30 req/min per IP + 500 req/day global hard cap**
- An EU-region D1 database for explicitly opted-in wrong-verdict feedback; prompts
  are not stored during normal classification, users can delete by submission ID,
  and feedback rows expire after 30 days

The Cloudflare Worker serves all three tabs. Gate runs the real `koma-gate`
classifier, Scout runs deterministic pre-flight checks, and Core runs the real
`koma-core` package with an in-memory demo adapter. The compatibility date
enables the Node crypto APIs used by Core.

The daily cron deletes expired feedback rows. See the just-in-time notice in the
Gate tab and `public/privacy.html` before changing the collected fields or retention.

### Vercel

1. Create a new project pointing at this repo.
2. Set **Root Directory** to `demo/web`.
3. Add `GEMINI_API_KEY` (and optionally `KOMA_PROVIDER`) as environment variables.
4. Deploy. Vercel serves `public/` as static files and `api/classify.mjs` as a
   serverless function.

> ⚠️ Vercel's rate limiter is per-instance only — it blunts casual abuse but
> cannot enforce a global budget. Pair it with the provider-side budget below.

### Railway / Zeabur

1. Create a new service pointing at this repo.
2. Set the **root directory / build path** to `demo/web`.
3. Set the **start command** to `node server.mjs` (or `npm start`).
4. Add `GEMINI_API_KEY` as an environment variable.
5. Deploy.

## Cost & abuse protection — three layers

Every request makes one small LLM classification call (~500 tokens ≈ a fraction
of a cent on `gemini-2.5-flash`), but don't rely on that alone. Protection is
layered:

1. **Edge rate limiting** — per-IP (30/min) plus a hard **global daily cap**
   (500/day, atomically enforced by a Durable Object on Cloudflare).
2. **Kill switch** — flip a KV key (`disabled=true`) to stop all traffic
   instantly, no redeploy.
3. **Provider-side budget (the real backstop)** — the only thing that physically
   cannot be exceeded, regardless of any bug in your code:
   - **Google (Gemini)**: create a dedicated API key in Google AI Studio, or use a
     GCP project with a **billing budget + hard cap**. Gemini also has a free tier.
   - **OpenAI**: set a **hard monthly usage limit** on the account/API key.
   - **Anthropic**: set a spend limit on the workspace.

If you do nothing else, do layer 3: even a broken rate limiter can never spend
more than the provider's own quota.

The classifier is fail-closed: if the LLM call errors, input is blocked rather
than passed through.
