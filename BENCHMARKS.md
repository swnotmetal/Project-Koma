# Benchmarks

Koma Gate evaluation against public prompt-injection corpora using real LLM providers.

## Methodology

- **Corpus**: [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) — 263 injection attacks, 50 domain-aligned safe queries
- **Preset**: `knowledge` (General Knowledge Assistant)
- **Mode**: `failOpen: false` (fail-closed, security-first)
- **Cache**: disabled (cold-path measurement)
- **Retries**: 1

## Results

| Provider | Model | Recall | Precision | FPR | P50 Latency | P99 Latency |
|----------|-------|:------:|:---------:|:---:|:-----------:|:-----------:|
| DeepSeek | deepseek-chat | 92.8% | 100.0% | 0.0% | 766ms | 1122ms |
| Google | gemini-2.5-flash | 96.2% | 100.0% | 0.0% | 1508ms | 4591ms |

- **Recall**: percentage of injection attacks correctly blocked
- **Precision**: percentage of blocked requests that were actual attacks
- **FPR** (False Positive Rate): percentage of safe queries incorrectly blocked

### Key Findings

1. **Zero false positives** across both providers — all 50 domain-aligned knowledge queries passed correctly
2. **92.8–96.2% recall** on the public injection corpus — missed samples were predominantly non-English (German) injections; the classifier prompt is English-only
3. DeepSeek offers better latency; Google offers higher recall at the cost of speed (thinking-model overhead)

## Running the Benchmark

```bash
# 1. Download the corpus
python3 benchmarks/fetch-hf-dataset.py

# 2. Run evaluation
export DEEPSEEK_API_KEY=sk-...
node benchmarks/gate-eval.js \
  --corpus benchmarks/data/prompt-injection.jsonl \
  --positive benchmarks/data/knowledge-positive.jsonl \
  --provider deepseek \
  --preset knowledge

# 3. Compare providers
export GEMINI_API_KEY=...
node benchmarks/gate-eval.js \
  --corpus benchmarks/data/prompt-injection.jsonl \
  --positive benchmarks/data/knowledge-positive.jsonl \
  --provider google \
  --preset knowledge
```

## Reproducibility

All benchmark artifacts are deterministic (temperature=0, no cache). To reproduce:

1. Set the required API keys
2. Run the commands above
3. Results are printed as both human-readable tables and machine-readable JSON for CI integration

## Future Work

- [ ] Multi-language prompt templates (German, Chinese, Japanese)
- [ ] Evaluation against additional corpora (jailbreak-eval, HarmBench)
- [ ] Anthropic Claude 3 Haiku results
- [ ] Local model benchmarks (Ollama + Llama)

## Design Decisions

This benchmark suite exists because of a detailed community security review. The reviewer identified three gaps in the initial release:

| Feedback | Action taken |
|----------|-------------|
| Scope classifier ≠ cryptographic defense — claims should match mechanism | [Security boundary](https://github.com/swnotmetal/Project-Koma/blob/main/packages/koma-gate/README.md#security-boundary) section added to README, with explicit limitations and mitigation advice |
| Need evaluation against public corpora with real providers, not mock adapters | This benchmark suite: 263-sample public corpus, two real providers (DeepSeek + Gemini), fail-closed mode |
| `failOpen: true` as default is unsafe for security use cases | `failOpen: false` documented as recommended config for evaluation and high-security deployments |

We're grateful for reviews that push projects toward stronger engineering. If you spot a gap in methodology, data, or claims, [open an issue](https://github.com/swnotmetal/Project-Koma/issues).
