"""Assemble the static volume site from code and separately managed assets."""
import argparse
import shutil
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--assets-directory', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
code = Path(__file__).resolve().parents[1] / 'web'
assets = args.assets_directory.resolve()
output = args.output.resolve()
if output.exists():
    parser.error('Output must be a new directory; existing files are never overwritten')
if output.is_relative_to(assets) or output.is_relative_to(code):
    parser.error('Output must be outside both the code and assets directories')
for relative in ('assets/brain-oblique-hold.png', 'studio031/data/volume-groups.json',
                 'studio031/data/structure-volumes.json', 'studio031/data/transport.json'):
    if not (assets / relative).is_file():
        parser.error('Required external asset missing: ' + relative)
shutil.copytree(code, output)
# Only assets used by the published pages are included.
landing_assets = (
    'brain-oblique-hold.png', 'adam-photo-square.webp', 'brain-cover-loop.webm',
    'brain-cover-loop.mp4', 'brain-cover-loop.gif', 'brain-mri-cross-sections.jpg',
    'brain-mri-mosaic.webp', 'brain-social-x.jpg', 'brain-social-linkedin.jpg',
)
(output / 'assets').mkdir()
for name in landing_assets:
    shutil.copy2(assets / 'assets' / name, output / 'assets' / name)
data = assets / 'studio031/data'
manifest = json.loads((data / 'transport.json').read_text())
(output / 'studio031/data/assets').mkdir(parents=True)
for name in ('volume-groups.json', 'structure-volumes.json', 'transport.json'):
    shutil.copy2(data / name, output / 'studio031/data' / name)
for entry in manifest['entries'].values():
    name = Path(entry['url']).name
    if name != entry['sha256'] + '.bin.gz':
        parser.error('Unexpected viewer asset name')
    source = data / 'assets' / name
    if source.stat().st_size != entry['encoded_bytes']:
        parser.error('Viewer asset size mismatch: ' + name)
    shutil.copy2(source, output / 'studio031/data/assets' / name)
files = [p for p in output.rglob('*') if p.is_file()]
if len(files) > 20000 or any(p.stat().st_size > 25 * 1024 * 1024 for p in files):
    parser.error('Assembled site exceeds Cloudflare Pages Free file limits')
print(f'Prepared {len(files)} files, {sum(p.stat().st_size for p in files):,} bytes in {output}')
