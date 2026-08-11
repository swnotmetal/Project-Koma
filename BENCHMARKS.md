# Benchmarks

Koma Gate evaluation against public prompt-injection corpora using real LLM providers.

## Methodology

- **Corpora**: Multiple public prompt-injection datasets, merged and de-duplicated
  - [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) — 662 rows (EN + DE)
  - Additional sources via `python3 benchmarks/fetch-hf-dataset.py --list`
- **Positive (safe) queries**: 200 domain-aligned knowledge queries, independently curated
- **Preset**: `knowledge` (General Knowledge Assistant)
- **Mode**: `failOpen: false` (fail-closed, security-first)
- **Cache**: disabled (cold-path measurement)
- **Retries**: 1

### Important Caveats

This is a **dataset benchmark, not a security guarantee**. Key limitations:

- **Corpus size**: Current evaluation uses O(10³) samples. Production AI applications serve O(10⁶–10⁹) queries. A 0.1% FPR at this scale could mean thousands of false blocks.
- **Attack diversity**: Public corpora skew toward English direct-injection patterns. Real attackers use multi-turn, indirect, encoded, and cross-language techniques not fully represented here.
- **Evaluation leakage**: The `knowledge` preset's few-shot examples and the test corpus share distributional properties. Results should be validated against unseen attack distributions.
- **Single-language classifier**: The prompt template is English-only. Non-English injections (German, Chinese, Japanese) have lower detection rates.

These limitations are tracked in [SECURITY-HARDENING.md](./SECURITY-HARDENING.md).

## Results

### English Corpus (deepset/prompt-injections — 263 attacks, 50 safe)

| Provider | Model | Recall | Precision | FPR | P50 Latency | P99 Latency |
|----------|-------|:------:|:---------:|:---:|:-----------:|:-----------:|
| DeepSeek | deepseek-chat | 93.2% | 100.0% | 0.0% | 877ms | 1202ms |
| Google | gemini-2.5-flash | 96.2% | 100.0% | 0.0% | 1508ms | 4591ms |

### Chinese Corpus (zh-injection-50 — 50 attacks, 50 benign hard negatives)

| Provider | Model | Recall | Precision | FPR | P50 Latency | P99 Latency |
|----------|-------|:------:|:---------:|:---:|:-----------:|:-----------:|
| DeepSeek | deepseek-chat | 100.0% | 100.0% | 0.0% | 917ms | 1464ms |
| Google | gemini-2.5-flash | 100.0% | 98.0% | 2.0% | 1310ms | 10113ms |

- **Recall**: percentage of attacks correctly blocked
- **Precision**: percentage of blocked requests that were actual attacks  
- **FPR** (False Positive Rate): percentage of safe queries incorrectly blocked
- Latency measured end-to-end (network + inference); Google P99 reflects thinking-model variability

### Key Findings

1. **Zero false positives** across both providers — all 50 domain-aligned knowledge queries passed correctly
2. **92.8–96.2% recall** on the public injection corpus — missed samples were predominantly non-English (German) injections; the classifier prompt is English-only
3. DeepSeek offers better latency; Google offers higher recall at the cost of speed (thinking-model overhead)

## Running the Benchmark

```bash
# 1. Download all available corpora (merged)
python3 benchmarks/fetch-hf-dataset.py

# 2. Run evaluation against merged corpus
export DEEPSEEK_API_KEY=sk-...
node benchmarks/gate-eval.js \
  --corpus benchmarks/data/prompt-injection-merged.jsonl \
  --positive benchmarks/data/knowledge-positive.jsonl \
  --provider deepseek \
  --preset knowledge

# 3. Single-source evaluation
python3 benchmarks/fetch-hf-dataset.py --source deepset
node benchmarks/gate-eval.js \
  --corpus benchmarks/data/deepset-prompt-injection.jsonl \
  --positive benchmarks/data/knowledge-positive.jsonl \
  --provider deepseek \
  --preset knowledge
```

## Reproducibility

All benchmark artifacts are deterministic (temperature=0, no cache). To reproduce:

1. Set the required API keys
2. Run the commands above
3. Results are printed as both human-readable tables and machine-readable JSON for CI integration

## Future Work

### Corpus Expansion
- [ ] Chinese-language injection corpus (hand-curated)
- [ ] Japanese, Korean, Arabic injection samples
- [ ] Mixed-language and code-switching attacks
- [ ] Multi-turn conversation injection sequences
- [ ] Indirect injection via tool outputs and RAG context
- [ ] Encoded/obfuscated payloads (Base64, URL-encode, Unicode homoglyph)

### Evaluation Rigor
- [ ] 500+ domain-aligned safe queries for statistical FPR confidence
- [ ] Per-language recall breakdown
- [ ] Per-attack-category precision/recall
- [ ] Cross-preset evaluation (support, code, reference)
- [ ] Anthropic Claude 3 Haiku results
- [ ] Local model benchmarks (Ollama + Llama)

### Automation
- [ ] CI-integrated benchmark run (on schedule, not per-commit)
- [ ] Regression test for every fixed bypass
- [ ] Leaderboard-style results page

## Design Decisions

This benchmark suite exists because of a detailed community security review. The reviewer identified three gaps in the initial release:

| Feedback | Action taken |
|----------|-------------|
| Scope classifier ≠ cryptographic defense — claims should match mechanism | [Security boundary](https://github.com/swnotmetal/Project-Koma/blob/main/packages/koma-gate/README.md#security-boundary) section added to README, with explicit limitations and mitigation advice |
| Need evaluation against public corpora with real providers, not mock adapters | This benchmark suite: 263-sample public corpus, two real providers (DeepSeek + Gemini), fail-closed mode |
| `failOpen: true` as default is unsafe for security use cases | `failOpen: false` documented as recommended config for evaluation and high-security deployments |

I am very grateful for reviews that push projects toward stronger engineering. If you spot a gap in methodology, data, or claims, [open an issue](https://github.com/swnotmetal/Project-Koma/issues).
