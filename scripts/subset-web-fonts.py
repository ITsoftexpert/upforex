"""Optional offline asset preparation; NOT required by npm ci/build.
Requires fontTools[woff] (local tmp codec is also supported).
Only subsets existing fonts. Keeps original faces as fallback for every other glyph.
"""
from pathlib import Path
import hashlib, json, re, sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/font-subset-tools'))
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
OUT = ROOT / 'src/assets/fonts/subsets'
CSS = ROOT / 'src/styles/font-subsets.scss'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ranges(points):
    ordered = sorted(points)
    groups = []
    for point in ordered:
        if groups and point == groups[-1][1] + 1:
            groups[-1][1] = point
        else:
            groups.append([point, point])
    return ', '.join('U+%X' % a if a == b else 'U+%X-%X' % (a, b) for a, b in groups)


def outline(font, point, location):
    glyphs = font.getGlyphSet(location=location)
    name = font.getBestCmap()[point]
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    # JSON roundtrip normalizes tuples; variation interpolation can differ below 1e-6.
    def normalize(value):
        if isinstance(value, float): return round(value, 5)
        if isinstance(value, (tuple, list)): return [normalize(v) for v in value]
        return value
    return normalize(pen.value), round(glyphs[name].width, 5)


def create(label, source, points, family, weight, names=None):
    source = ROOT / source
    font = TTFont(source, recalcTimestamp=False)
    points = set(points) & set(font.getBestCmap())
    assert points, label
    options = subset.Options()
    options.flavor = 'woff2'
    options.glyph_names = True
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    options.layout_features = ['*']
    options.recalc_timestamp = False
    tool = subset.Subsetter(options=options)
    tool.populate(unicodes=points)
    tool.subset(font)
    font.flavor = 'woff2'
    temporary = OUT / (label + '.woff2')
    font.save(temporary)
    digest = sha(temporary)
    target = OUT / (label + '.' + digest[:16] + '.woff2')
    if target.exists():
        assert target.read_bytes() == temporary.read_bytes()
        temporary.unlink()
    else:
        temporary.rename(target)
    original = TTFont(source)
    result = TTFont(target)
    assert set(result.getBestCmap()) == points
    assert original['head'].unitsPerEm == result['head'].unitsPerEm
    for table in ('hhea', 'OS/2'):
        for attr in ('ascent', 'descent', 'lineGap', 'sTypoAscender', 'sTypoDescender', 'sTypoLineGap'):
            if hasattr(original[table], attr):
                assert getattr(original[table], attr) == getattr(result[table], attr), (label, table, attr)
    locations = [{'wght': weight} for weight in (100, 400, 700, 900)] if 'fvar' in original else [None]
    for location in locations:
        for point in sorted(points):
            assert outline(original, point, location) == outline(result, point, location), (label, point, location)
    return {'label': label, 'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': sha(source),
            'file': target.relative_to(ROOT).as_posix(), 'sha256': digest, 'originalBytes': source.stat().st_size,
            'bytes': target.stat().st_size, 'family': family, 'weight': weight, 'unicodeRange': ranges(points),
            'codepoints': sorted(points), 'iconNames': names or [], 'outlinesAndMetricsMatch': True,
            'checkedVariationWeights': [100, 400, 700, 900] if 'fvar' in original else []}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CSS.parent.mkdir(parents=True, exist_ok=True)
    latin = set(range(0x100)) | set(range(0x2000, 0x2070)) | {0x131, 0x152, 0x153, 0x2BB, 0x2BC, 0x2C6, 0x2DA, 0x2DC, 0x304, 0x308, 0x329, 0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD}
    rows = [create('montserrat-latin', 'src/assets/fonts/Montserrat/Montserrat-VariableFont_wght.woff2', latin, 'Montserrat', 'normal')]
    used = set()
    for path in (ROOT / 'src/app').rglob('*'):
        if path.suffix in ('.html', '.ts', '.scss'):
            used.update(re.findall(r'\bfa-([a-z0-9-]+)', path.read_text(encoding='utf-8')))
    original_css = (ROOT / 'node_modules/@fortawesome/fontawesome-free/css/all.css').read_text(encoding='utf-8')
    icon_points = {name: int(point, 16) for name, point in re.findall(r'\.fa-([a-z0-9-]+)\s*\{\s*--fa:\s*"\\([a-f0-9]+)";', original_css)}
    for style, family, weight, filename in [('solid', 'Font Awesome 7 Free', '900', 'fa-solid-900'), ('brands', 'Font Awesome 7 Brands', '400', 'fa-brands-400')]:
        font_path = 'node_modules/@fortawesome/fontawesome-free/webfonts/' + filename + '.woff2'
        cmap = TTFont(ROOT / font_path).getBestCmap()
        selected = {name: icon_points[name] for name in used if name in icon_points and icon_points[name] in cmap}
        rows.append(create('public-' + style, font_path, set(selected.values()), family, weight, sorted(selected)))
    # Last-declared matching face wins for these characters. The original complete
    # faces stay in styles.scss/Font Awesome CSS for Cyrillic, extended text,
    # future CMS icons, and every glyph outside the listed unicode ranges.
    blocks = ['// Generated by scripts/subset-web-fonts.py. Full original faces remain available.', '// Keep this stylesheet AFTER the existing global font definitions.']
    for row in rows:
        url = '../assets/fonts/subsets/' + Path(row['file']).name
        blocks.append('@font-face {\n  font-family: "%s";\n  font-style: normal;\n  font-weight: %s;\n  font-display: swap;\n  src: url("%s") format("woff2");\n  unicode-range: %s;\n}' % (row['family'], row['weight'], url, row['unicodeRange']))
    CSS.write_bytes(('\n\n'.join(blocks) + '\n').encode('utf-8'))
    (OUT / 'manifest.json').write_bytes((json.dumps({'generator': 'scripts/subset-web-fonts.py', 'fonts': rows, 'originalFontsRetained': True}, indent=2) + '\n').encode('utf-8'))
    (OUT / 'FONT-AWESOME-LICENSE.txt').write_bytes((ROOT / 'node_modules/@fortawesome/fontawesome-free/LICENSE.txt').read_bytes())
    (OUT / 'MONTSERRAT-OFL.txt').write_bytes((ROOT / 'src/assets/fonts/Montserrat/OFL.txt').read_bytes())
    print(json.dumps({'fonts': [{k: r[k] for k in ('label', 'originalBytes', 'bytes', 'outlinesAndMetricsMatch')} for r in rows]}))

if __name__ == '__main__': main()
