# Image Pipeline & Caching

RT-Library includes an integrated image normalization, downloading, and caching pipeline for game covers and topic screenshots.

---

## 1. Overview

Topic descriptions frequently reference images hosted on external services or embedded as BBCode/HTML markup. The image pipeline:
1. Normalizes raw image URLs into direct image endpoints.
2. Downloads images securely via the Main process (`electron/images/imageFetch.cjs`).
3. Caches images on the local filesystem with an LRU policy (`src/services/imageCachePolicy.ts`).
4. Serves cached binary assets to the Renderer process without exposing direct external network requests in the UI.

---

## 2. URL Normalization

The normalizer (`src/utils/imageResolver.ts`, `electron/indexer/normalize.cjs`) handles common provider patterns:

- **FastPic (`fastpic.org` / `fastpic.ru`)**: Converts viewer landing pages (e.g. `fastpic.org/view/...`) into direct content delivery URLs (`i*.fastpic.org/big/...`).
- **ImageBam / ImageVenue / PostImg**: Strips interstitial HTML viewer wrappers to target the raw image asset.
- **Protocol Normalization**: Upgrades insecure `http://` links to `https://` where supported.

---

## 3. LRU Disk Cache Architecture

Images are stored under `<userData>/image-cache/`:
- **Cache Index**: Keyed by cryptographic hash (SHA-256) of the canonical image URL.
- **Max Cache Size**: Configurable via Settings (e.g., 500 MB to 5 GB).
- **Auto Eviction**: When cache limit is exceeded, least recently accessed image files are purged to maintain target storage thresholds.
- **Warmup Service**: Asynchronous background warmup preloads visible viewport covers for smooth scrolling.

