# Tizen Notes

Samsung TV Web Apps are packaged around `config.xml` and standard HTML/CSS/JavaScript files. The runtime exposes TV-specific APIs such as `tizen.tvinputdevice` for remote keys and `webapis.avplay` for media playback.

Implemented compatibility choices:

- Plain script tags instead of ES modules.
- No npm runtime dependencies.
- XHR-based API client instead of assuming `fetch`.
- HTML5 video fallback for desktop debugging.
- Focus navigation based on element geometry, not DOM order alone.
- Media keys registered when `tizen.tvinputdevice` exists.
- Local settings, favorites, and history stored under the `ddys-tizen` namespace.

The app can generate an unsigned `.wgt` package locally. Final device installation may still require Tizen Studio signing and a TV developer certificate, depending on the target device.
