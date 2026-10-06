"""Create a mirrored repeating backdrop from the separately supplied MRI mosaic."""
import base64
from pathlib import Path


def build_backdrop(mosaic: Path) -> bytes:
    image = 'data:image/webp;base64,' + base64.b64encode(mosaic.read_bytes()).decode()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="2880" height="2880" viewBox="0 0 2880 2880">'
            f'<defs><image id="tile" width="1440" height="1440" href="{image}"/></defs>'
            '<use href="#tile"/><use href="#tile" transform="translate(2880 0) scale(-1 1)"/>'
            '<use href="#tile" transform="translate(0 2880) scale(1 -1)"/>'
            '<use href="#tile" transform="translate(2880 2880) scale(-1 -1)"/></svg>').encode()
