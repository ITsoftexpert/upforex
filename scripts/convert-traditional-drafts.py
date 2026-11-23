"""Reuse Simplified Chinese draft meanings with OpenCC's Taiwan phrase profile.
The output remains an unreviewed draft and must pass its own target checks.
"""
import hashlib
import json
from pathlib import Path
from opencc import OpenCC

root = Path(__file__).resolve().parent.parent
directory = root / 'tmp/free-native-translations'
source = json.loads((directory / 'zh-CN.json').read_text(encoding='utf-8'))
target_file = directory / 'zh-TW.json'
target = json.loads(target_file.read_text(encoding='utf-8')) if target_file.exists() else {
    'provider': source['provider'], 'language': 'zh-TW', 'reviewed': False, 'published': False, 'entries': {}}
converter = OpenCC('s2twp')
added = 0
for key, entry in source['entries'].items():
    if target['entries'].get(key, {}).get('english') == entry['english']:
        continue
    copied = dict(entry)
    copied['translation'] = converter.convert(entry['translation'])
    copied['rawTranslation'] = converter.convert(entry.get('rawTranslation', entry['translation']))
    copied['derivation'] = {'sourceLanguage': 'zh-CN', 'provider': source['provider'], 'conversion': 'OpenCC s2twp',
                            'sourceTargetSha256': hashlib.sha256(entry['translation'].encode('utf-8')).hexdigest()}
    copied['reviewed'] = False
    copied['semanticReviewComplete'] = False
    target['entries'][key] = copied
    added += 1
temporary = target_file.with_suffix('.json.writing')
temporary.write_text(json.dumps(target, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
temporary.replace(target_file)
print(json.dumps({'language': 'zh-TW', 'reusedDrafts': added, 'drafts': len(target['entries']), 'published': 0, 'paidRequests': 0}))
