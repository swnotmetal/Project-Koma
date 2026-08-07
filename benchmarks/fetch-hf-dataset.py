#!/usr/bin/env python3
"""Fetch HuggingFace prompt-injection datasets via Datasets Server API (no auth needed).

Usage:
  python3 benchmarks/fetch-hf-dataset.py                           # deepset/prompt-injections (662 rows)
  python3 benchmarks/fetch-hf-dataset.py --dataset jayavibhav/prompt-injection
  python3 benchmarks/fetch-hf-dataset.py --dataset reshabhs/SPML_Chatbot_Prompt_Injection
"""

import urllib.request, json, sys, os

DATASET = sys.argv[sys.argv.index('--dataset') + 1] if '--dataset' in sys.argv else 'deepset/prompt-injections'
OUTPUT = os.path.join(os.path.dirname(__file__), 'data', 'prompt-injection.jsonl')

# Get dataset size
size_url = f'https://datasets-server.huggingface.co/size?dataset={DATASET}'
size_data = json.loads(urllib.request.urlopen(size_url).read())
splits = {s['split']: s['num_rows'] for s in size_data.get('splits', [])}

print(f'Dataset: {DATASET}')
for split, rows in splits.items():
    print(f'  {split}: {rows} rows')

count = 0
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, 'w') as out:
    for split in splits:
        offset = 0
        while offset < splits[split]:
            url = f'https://datasets-server.huggingface.co/rows?dataset={DATASET}&config=default&split={split}&offset={offset}&length=100'
            data = json.loads(urllib.request.urlopen(url).read())
            rows = data.get('rows', [])
            if not rows:
                break
            for r in rows:
                out.write(json.dumps(r['row']) + '\n')
                count += 1
            offset += len(rows)
            print(f'  {split}: {offset}/{splits[split]} rows')

print(f'\nDone: {count} rows → {OUTPUT}')

# Show distribution
neg = pos = 0
with open(OUTPUT) as f:
    for line in f:
        r = json.loads(line)
        if r.get('label') == 1: neg += 1
        else: pos += 1
print(f'Injection (label=1): {neg} | Safe (label=0): {pos}')
