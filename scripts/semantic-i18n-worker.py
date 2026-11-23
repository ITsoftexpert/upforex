"""Local cross-language similarity signals, not a guarantee of translation correctness.

All token chunks are evaluated; input is never silently truncated. The model
stays in tmp. This worker cannot change catalogs or completed coverage.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

sys.stdin.reconfigure(encoding='utf-8', errors='strict')
sys.stdout.reconfigure(encoding='utf-8', errors='strict')

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / 'tmp/offline-i18n/semantic-model'
options = ort.SessionOptions()
threads = int(os.environ.get('UPFOREX_SEMANTIC_THREADS', '4'))
if not 1 <= threads <= 8:
    raise ValueError('Semantic worker threads must be between 1 and 8')
options.intra_op_num_threads = threads
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(MODEL / 'model_quint8_avx2.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
tokenizer = Tokenizer.from_file(str(MODEL / 'tokenizer.json'))
tokenizer.no_truncation()
START = tokenizer.token_to_id('<s>')
END = tokenizer.token_to_id('</s>')
PAD = tokenizer.token_to_id('<pad>')
cache = {}

def encode(texts):
    for index, value in enumerate(texts):
        if not isinstance(value, str):
            raise ValueError('Non-string semantic input at ' + str(index) + ': ' + repr(value)[:120])
    needed = list(dict.fromkeys(text for text in texts if text not in cache))
    parts, owners, weights = [], [], []
    for owner, text in enumerate(needed):
        try:
            ids = tokenizer.encode(text, add_special_tokens=False).ids
        except Exception as error:
            raise ValueError('Tokenizer rejected input ' + repr(text[:150]) + ': ' + str(error)) from error
        for start in range(0, max(len(ids), 1), 124):
            content = ids[start:start + 124]
            parts.append([START] + content + [END])
            owners.append(owner)
            weights.append(max(len(content), 1))
    totals = np.zeros((len(needed), 384), dtype=np.float64)
    total_weights = np.zeros(len(needed), dtype=np.float64)
    for start in range(0, len(parts), 24):
        subset = parts[start:start + 24]
        width = max(map(len, subset))
        ids = np.full((len(subset), width), PAD, dtype=np.int64)
        mask = np.zeros_like(ids)
        for row, tokens in enumerate(subset):
            ids[row, :len(tokens)] = tokens
            mask[row, :len(tokens)] = 1
        available = {'input_ids': ids, 'attention_mask': mask, 'token_type_ids': np.zeros_like(ids)}
        output = session.run(None, {item.name: available[item.name] for item in session.get_inputs()})[0]
        pooled = (output * mask[:, :, None]).sum(axis=1) / mask.sum(axis=1)[:, None]
        for offset, vector in enumerate(pooled):
            index = start + offset
            totals[owners[index]] += vector * weights[index]
            total_weights[owners[index]] += weights[index]
    for index, text in enumerate(needed):
        vector = totals[index] / total_weights[index]
        cache[text] = vector / max(float(np.linalg.norm(vector)), 1e-12)
    return [cache[text] for text in texts]

for line in sys.stdin:
    try:
        request = json.loads(line)
        pairs = request['pairs']
        vectors = encode([text for pair in pairs for text in pair])
        scores = [float(np.dot(vectors[index * 2], vectors[index * 2 + 1])) for index in range(len(pairs))]
        print(json.dumps({'scores': scores, 'method': 'multilingual-MiniLM-all-token-chunks', 'humanReview': False}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
