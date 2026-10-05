# Adambrain

An interactive MRI-derived portrait, rendered as volumes in your browser.

This repository contains the landing page and volume viewer **code only**. Scan
volumes, manifests and preview images are maintained separately and served from
the same website. Original DICOM files and modelling work are not distributed
here. The alternate surface renderer remains under development elsewhere.

## Run locally

Python 3.9 or later is required for the scripts; the viewer needs WebGL 2.

Supply a separate asset folder with this layout:

```text
adambrain-assets/
  assets/
    brain-oblique-hold.png
    social-preview.png
  studio031/
    data/
      volume-groups.json
      structure-volumes.json
      transport.json
      assets/
        <content-hash>.bin.gz
```

```sh
python3 scripts/serve.py --directory web --assets-directory /path/to/adambrain-assets --port 8888
```

Open `http://127.0.0.1:8888/`. The head viewer is at `/studio031/`.
The server mounts only `/assets/` and `/studio031/data/` from the supplied folder.
Browser URLs stay relative and on the same origin; machine-specific paths are
not embedded in the site. Without the separate assets, the source alone cannot
render this portrait. Assets are not automatically downloaded from GitHub.

## Static hosting

Assemble a local deployment folder without adding its images or data to Git:

```sh
python3 scripts/package-site.py --assets-directory /path/to/adambrain-assets --output /path/to/new-site-folder
```

Deploy that assembled folder to Cloudflare Pages. No Node build, server-side
functions, updater or feedback relay is required. Donation links go directly to
the selected providers. Application-compressed `.bin.gz` files must be served as
raw downloads; do not force `Content-Encoding: gzip`, because the viewer worker
handles decompression and verifies their decoded checksums.

The opening demo starts from the default view, waits for rendering and a one
second hold, then fades skin out for three seconds and bone out for three
seconds. Both remain hidden for five seconds before the fades reverse. Orbit
runs during the demo. Controls start visible; user interaction stops the demo.
Save and Load keep a view in browser-local storage.

## Credits

Three.js is bundled under its MIT licence in `web/studio031/vendor/THREE-LICENSE.txt`.
The landing page links to the imaging, reconstruction and scientific-computing
projects used to prepare the portrait, distinguishing current tools from earlier
experiments. Scan-derived boundaries and vessel classifications remain provisional.
