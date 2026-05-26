# Presentation Camera

> 🇪🇸 [Léeme en español](./README.es.md)

**Live demo**: https://manufosela.dev/presentation-camera/

Static web app that overlays your **webcam** on top of an **embedded presentation**. Built for recording or teaching live with your slides and your face on screen at the same time — talking-head style.

The webcam can be rendered as a framed rectangle or as a **background-free cut-out** using in-browser person segmentation (TensorFlow.js + BodyPix).

## Features

- Embed any presentation reachable over HTTPS (Genially, Google Slides, Canva, etc.) full-screen in an iframe.
- **Auto-normalisation of Google Slides URLs**: paste an `/edit` URL and the app rewrites it to `/preview` before loading, so the iframe doesn't go blank when Slides tries to redirect to its non-embeddable presenter view.
- Webcam overlay with two treatments:
  - **Frame**: video inside a rounded card with subtle border.
  - **Cut-out**: just the person's silhouette, transparent background (BodyPix).
- Position: any of the 4 corners.
- Size: small / medium / large.
- Camera picker if more than one webcam is available.
- Built-in fullscreen mode that keeps the webcam composited on top of the iframe.
- Keyboard shortcuts while presenting:
  - `←` / `→` rotate corner.
  - `B` toggle frame ↔ cut-out.
  - `F` enter / exit fullscreen.
  - `Esc` exit fullscreen, then end broadcast.
- State persisted in the URL: share the link and the other side opens the same view.
- Zero runtime dependencies: every library and font is served locally from `vendor/`.

## Requirements

- A modern browser with `getUserMedia` support (recent Chrome, Firefox, Safari, Edge).
- **Secure context** is mandatory: the camera only works under `https://` or `http://localhost`.

## Run locally

```bash
./start.sh           # static server on http://localhost:8000
./start.sh 8080      # custom port
```

The script uses `python3 -m http.server` and picks the next free port if none is given.

Open `http://localhost:8000`, paste your presentation URL and click **Go live**.

## Demo

There's an **or try a demo** button that loads a public Genially presentation so you can test the app without needing one of your own.

## Layout

```
.
├── index.html          # Entry point
├── precam.js           # Logic: webcam, BodyPix, state, UI
├── precam.css          # Styles (Editorial Broadcast)
├── start.sh            # Local static server
├── vendor/             # Locally-served libraries and fonts
│   ├── tf.min.js                 # TensorFlow.js 4.22.0
│   ├── body-pix.min.js           # BodyPix 2.2.1
│   └── fonts/                    # Fraunces variable (display)
└── package.json
```

## Refresh `vendor/`

```bash
cd vendor
curl -fsSL -o tf.min.js       "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
curl -fsSL -o body-pix.min.js "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js"
```

BodyPix 2.x requires TensorFlow.js `^4.10.0`. If you bump one, double-check compatibility with the other.

BodyPix 2.2.x's UMD bundle exposes its API as `window["body-pix"]`. The alias to `window.bodyPix` lives in an inline `<script>` right after the library tag in `index.html` — keep that in mind if you upgrade to a version that changes the UMD wrapper.

## Privacy

All video processing happens **in the browser**. The webcam feed never leaves your machine. The presentation is loaded in an iframe directly from its original host.

## License

MIT. See [LICENSE](./LICENSE).
