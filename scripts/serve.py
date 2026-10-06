"""Serve viewer code with optional same-origin assets from a separate directory."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128


class AssetHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, assets_directory=None, **kwargs):
        self.assets_directory = assets_directory
        super().__init__(*args, **kwargs)

    def translate_path(self, path):
        url_path = unquote(urlsplit(path).path)
        if url_path in ('/viewer', '/viewer/'):
            return str(Path(self.directory) / 'studio031' / 'index.html')
        mounts = ('/assets/', '/studio031/data/')
        if self.assets_directory:
            for mount in mounts:
                if url_path.startswith(mount):
                    base = (self.assets_directory / mount.lstrip('/')).resolve()
                    candidate = (self.assets_directory / url_path.lstrip('/')).resolve()
                    if base.is_relative_to(self.assets_directory) and candidate.is_relative_to(base):
                        return str(candidate)
                    return str(Path(self.directory) / '__asset_path_rejected__')
        return super().translate_path(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8888)
    parser.add_argument('--directory', type=Path, default=Path('web'))
    parser.add_argument('--assets-directory', type=Path)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or not args.directory.is_dir():
        parser.error('A valid preview port and existing code directory are required')
    if args.assets_directory and not args.assets_directory.is_dir():
        parser.error('The external assets directory must exist')
    handler = partial(AssetHandler, directory=str(args.directory.resolve()),
                      assets_directory=args.assets_directory.resolve() if args.assets_directory else None)
    with PreviewServer(('127.0.0.1', args.port), handler) as server:
        server.serve_forever()
