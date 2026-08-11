#!/usr/bin/env python3
"""Fetch HuggingFace prompt-injection datasets via Datasets Server API (no auth needed).

Usage:
  python3 benchmarks/fetch-hf-dataset.py                              # all sources merged
  python3 benchmarks/fetch-hf-dataset.py --source deepset             # single source
  python3 benchmarks/fetch-hf-dataset.py --list                       # list available sources

Sources:
  deepset   — deepset/prompt-injections (662 rows, EN+DE)
  jayavibhav — jayavibhav/prompt-injection (327k rows, mixed)
  spml      — reshabhs/SPML_Chatbot_Prompt_Injection (16k rows)
"""

import urllib.request, json, sys, os

SOURCES = {
    'deepset': 'deepset/prompt-injections',
    'jayavibhav': 'jayavibhav/prompt-injection',
    'spml': 'reshabhs/SPML_Chatbot_Prompt_Injection',
}

if '--list' in sys.argv:
    for k, v in SOURCES.items():
        print(f'  {k}: {v}')
    sys.exit(0)

# Determine which sources to fetch
if '--source' in sys.argv:
    src_key = sys.argv[sys.argv.index('--source') + 1]
    targets = {src_key: SOURCES[src_key]}
else:
    targets = SOURCES

BASE_OUT = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(BASE_OUT, exist_ok=True)

total_neg = 0
total_pos = 0
merged = []

for name, dataset in targets.items():
    try:
        size_url = f'https://datasets-server.huggingface.co/size?dataset={dataset}'
        size_data = json.loads(urllib.request.urlopen(size_url).read())
        splits = {s['split']: s['num_rows'] for s in size_data.get('size', {}).get('splits', [])}
    except Exception as e:
        print(f'  ⚠ {name}: cannot fetch size ({e}), skipping')
        continue

    total_rows = sum(splits.values())
    if total_rows > 50000:
        print(f'  ⚠ {name}: {total_rows} rows — too large, sampling 5000')
        total_rows = 5000

    count = 0
    out_path = os.path.join(BASE_OUT, f'{name}-prompt-injection.jsonl')
    with open(out_path, 'w') as out:
        for split in splits:
            offset = 0
            while offset < splits[split]:
                url = f'https://datasets-server.huggingface.co/rows?dataset={dataset}&config=default&split={split}&offset={offset}&length=100'
                try:
                    data = json.loads(urllib.request.urlopen(url).read())
                except:
                    break
                rows = data.get('rows', [])
                if not rows:
                    break
                for r in rows:
                    row = r['row']
                    text = row.get('text') or row.get('prompt') or row.get('question') or ''
                    label = row.get('label')
                    if isinstance(label, str):
                        label = 1 if label.lower() in ('1', 'true', 'injection', 'jailbreak') else 0
                    if not text.strip():
                        continue
                    out.write(json.dumps({'text': text.strip(), 'label': label, 'source': name}) + '\n')
                    merged.append({'text': text.strip(), 'label': label, 'source': name})
                    count += 1
                    if count >= total_rows:
                        break
                offset += len(rows)
                if count >= total_rows:
                    break
                print(f'  {name}/{split}: {min(offset, count)} rows', end='\r')
            if count >= total_rows:
                break

    neg = sum(1 for m in merged if m['source'] == name and m['label'] == 1)
    pos = sum(1 for m in merged if m['source'] == name and m['label'] == 0)
    print(f'  {name}: {count} rows ({neg} attacks, {pos} safe) → {out_path}')
    total_neg += neg
    total_pos += pos

# Write merged corpus
if len(targets) > 1:
    merged_path = os.path.join(BASE_OUT, 'prompt-injection-merged.jsonl')
    with open(merged_path, 'w') as f:
        for m in merged:
            f.write(json.dumps(m) + '\n')
    print(f'\nMerged: {len(merged)} rows ({total_neg} attacks, {total_pos} safe) → {merged_path}')
    print(f'  Run: node benchmarks/gate-eval.js --corpus {merged_path} --provider deepseek --preset knowledge')
