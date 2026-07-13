# ddys-tizen

Samsung Tizen TV web application for DDYS. It provides a remote-control friendly TV interface for DDYS home feeds, categories, search, details, playable resources, favorites, history, settings, diagnostics, and playback.

## Features

- Home feeds for latest and hot items.
- Category browsing for movies, series, anime, variety, and documentaries.
- Search with TV input support.
- Detail page with poster, metadata, summary, and resources.
- Tizen `webapis.avplay` first, HTML5 video fallback for browser debugging.
- Remote navigation with directional keys, enter, return, color keys, and media keys.
- Local favorites and playback history.
- API settings for base URL, API key, key mode, page size, cache TTL, and resource filters.
- Runtime diagnostics.
- `.wgt` and source ZIP packaging.

## Run And Install

Use the `.wgt` asset from the GitHub Release. Installing to a Samsung TV usually requires Tizen Studio or TV developer mode. The source can also be opened in a desktop browser for UI/API debugging.

## Verify

```bash
node tools/check.mjs
node --test tests/*.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```
