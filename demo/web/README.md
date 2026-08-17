# Koma Gate — Online Demo

A zero-friction, interactive demo of **Koma Gate**, the semantic prompt-injection
firewall. Type any prompt on the left — a legit question or a jailbreak attempt —
and watch it get classified by a real LLM in real time.

This demo runs the actual `koma-gate` npm package (LLM classifier), **not** a
keyword list. The API key stays server-side and is never sent to the browser.

## Local run

```bash
# from the demo/web directory
npm install
GEMINI_API_KEY=your-key node server.mjs
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

### Vercel

1. Create a new project pointing at this repo.
2. Set **Root Directory** to `demo/web`.
3. Add `GEMINI_API_KEY` (and optionally `KOMA_PROVIDER`) as environment variables.
4. Deploy. Vercel serves `public/` as static files and `api/classify.mjs` as a
   serverless function.

### Railway / Zeabur

1. Create a new service pointing at this repo.
2. Set the **root directory / build path** to `demo/web`.
3. Set the **start command** to `node server.mjs` (or `npm start`).
4. Add `GEMINI_API_KEY` as an environment variable.
5. Deploy.

## Cost & abuse notes

- Every request makes one small LLM classification call. A cheap/fast model
  (`gemini-2.5-flash`) is the default on purpose.
- A per-IP rate limit (30 req/min) is built in; on serverless platforms this is
  per-instance, so add a platform-level rate limit for a public launch.
- The classifier is fail-closed: if the LLM call errors, input is blocked rather
  than passed through.
