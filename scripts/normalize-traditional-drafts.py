"""Build-time script conversion only. No network, inference or coverage approval."""
import json
from pathlib import Path
from opencc import OpenCC

ROOT = Path(__file__).resolve().parent.parent
converter = OpenCC('s2twp')
changed = 0

def convert(value):
    if isinstance(value, str):
        return converter.convert(value)
    if isinstance(value, list):
        return [convert(item) for item in value]
    if isinstance(value, dict):
        return {key: convert(item) if not key.startswith('__') else item for key, item in value.items()}
    return value

for relative in ['tmp/free-native-translations/zh-TW.json', 'tmp/offline-native-translations/zh-TW.json',
                 'tmp/native-translations/zh-TW.json', 'tmp/reviewed-native-translations/zh-TW.json']:
    file = ROOT / relative
    if not file.exists():
        continue
    document = json.loads(file.read_text(encoding='utf-8'))
    for row in document.get('entries', {}).values():
        for field in ['translation', 'rawTranslation']:
            if isinstance(row.get(field), str):
                target = converter.convert(row[field])
                changed += target != row[field]
                row[field] = target
    file.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

file = ROOT / 'scripts/i18n-reviewed-translations.json'
document = json.loads(file.read_text(encoding='utf-8'))
for row in document.get('zh-TW', {}).values():
    target = converter.convert(row['translation'])
    changed += target != row['translation']
    row['translation'] = target
file.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

file = ROOT / 'src/assets/i18n/zh-TW.json'
document = json.loads(file.read_text(encoding='utf-8'))
converted = convert(document)
changed += converted != document
file.write_text(json.dumps(converted, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'changedTargets': changed, 'sourceEnglishChanged': False, 'coverageApproved': False, 'networkRequests': 0}))
