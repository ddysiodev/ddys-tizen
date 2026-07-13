# Architecture

`ddys-tizen` is a dependency-free Tizen TV Web App.

- `config.xml`: Tizen widget manifest, app id, icon, entry page, TV profile, and internet privilege.
- `index.html`: static shell and script loading order.
- `src/ddys-client.js`: DDYS API client, cache, movie/resource normalization, resource classification.
- `src/focus.js`: remote-control focus manager and TV key registration.
- `src/player.js`: Samsung AVPlay wrapper with HTML5 video fallback.
- `src/store.js`: localStorage-backed settings, favorites, and history.
- `src/app.js`: screen rendering, navigation, search, details, settings, diagnostics, and playback actions.

The application does not depend on npm packages. The `.wgt` artifact is a ZIP-compatible Tizen widget package containing only runtime app files.
