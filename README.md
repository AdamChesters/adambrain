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
    adam-photo-square.webp
    brain-cover-loop.webm
    brain-cover-loop.mp4
    brain-cover-loop.gif
    brain-mri-cross-sections.jpg
    brain-mri-mosaic.webp
    brain-social-x.jpg
    brain-social-linkedin.jpg
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

Open `http://127.0.0.1:8888/`. The interactive viewer is at `/viewer`.
The server mounts only `/assets/` and `/studio031/data/` from the supplied folder.
Browser URLs stay relative and on the same origin; machine-specific paths are
not embedded in the site. Without the separate assets, the source alone cannot
render this portrait. Assets are not automatically downloaded from GitHub.

## Static hosting

Assemble a local deployment folder without adding its images or data to Git:

```sh
python3 scripts/package-site.py --assets-directory /path/to/adambrain-assets --output /path/to/new-site-folder
```

Packaging generates the mirrored backdrop from the supplied MRI mosaic.
Deploy that assembled folder to Cloudflare Pages using Direct Upload. Only the
landing assets and compressed viewer payloads are packaged; raw acquisitions,
modelling work and preview alternatives are excluded. For a custom subdomain,
add it to the Pages project first, then create a CNAME pointing to the project
`pages.dev` hostname at your DNS provider. No Node build, server-side
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

## Feedback and support

<p align="center">
  <a href="https://discord.gg/fs4WyaQPA"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/social-discord.svg" width="38" height="38" alt="Discord" title="Discord"></a>
  <a href="https://www.reddit.com/r/AdamChsLab/"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/social-reddit.svg" width="38" height="38" alt="Reddit" title="Reddit"></a>
  <a href="https://github.com/AdamChesters"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/social-github.svg" width="38" height="38" alt="GitHub" title="GitHub"></a>
  <a href="https://www.linkedin.com/in/adamchesters/"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/social-linkedin.svg" width="38" height="38" alt="LinkedIn" title="LinkedIn"></a>
  <a href="https://adamch.com"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/social-website.svg" width="38" height="38" alt="AdamCh.com" title="AdamCh.com"></a>
</p>

<p align="center">Thanks for using Adambrain. I like to fix bugs and implement features rapidly. Issue? Idea? Let's work on it! Contact me anywhere you prefer.</p>

<h3 align="center">Support</h3>

<p align="center">I love making things to have fun, share fun, and make life a lil better. If you got value out of one of them, feel free to buy us a coffee. Or a house. Push comes to shove, I prefer Aston Martin. Supporters get golden crowns on the Discord / tags on the subreddit!</p>

<p align="center">
  <a href="https://github.com/sponsors/AdamChesters"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/support-github.svg" width="220" height="86" alt="GitHub Sponsors" title="GitHub Sponsors"></a>
  <a href="https://buymeacoffee.com/adamch"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/support-buymeacoffee.svg" width="220" height="86" alt="Buy Me a Coffee" title="Buy Me a Coffee"></a>
  <a href="https://www.paypal.com/donate/?business=KLHSZPXTSVSAU&amp;no_recurring=0&amp;item_name=I%27ve+donated+to+lots+of+small+creators+for+their+useful+little+tools%2C+now+I+create+them.+Dig+one?+I%27d+love+your+support.&amp;currency_code=AUD"><img src="https://raw.githubusercontent.com/AdamChesters/.github/main/assets/support/support-paypal.svg" width="220" height="86" alt="Support with PayPal" title="Support with PayPal"></a>
</p>
