# Changelog

## 108.1 — 14 October 2026

- Much faster volume viewer. Rays skip empty space, and layer colour, lighting
  and normals are prepared once into compact textures instead of every frame.
  Add `?engine=legacy` to use the previous renderer.
- Lower memory use: CPU copies of volume data are freed after upload.
- Lite mode for phones and tablets (`pointer: coarse`, or `?lite=1`): half-size
  volumes and background rebakes spread over frames, so motion stays smooth.
- Controls panel starts closed on small screens.
- A failed load now shows the reason.

## 107.2 — 7 October 2026

- Clearer project introduction and AI explanation.
- Updated search and social metadata, consistent page URLs and a sitemap.

## 6 October 2026

- First public release.
