"""Assemble the static volume site from code and separately managed assets."""
import argparse
import shutil
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
for relative in ('assets', 'studio031/data'):
    shutil.copytree(assets / relative, output / relative)
files = [p for p in output.rglob('*') if p.is_file()]
if len(files) > 20000 or any(p.stat().st_size > 25 * 1024 * 1024 for p in files):
    parser.error('Assembled site exceeds Cloudflare Pages Free file limits')
print(f'Prepared {len(files)} files, {sum(p.stat().st_size for p in files):,} bytes in {output}')
