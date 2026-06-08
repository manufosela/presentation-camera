# Presentation Camera

> 🇪🇸 [Léeme en español](./README.es.md)

**Live demo**: https://manufosela.dev/presentation-camera/

Static web app that overlays your **webcam** on top of an **embedded presentation**. Built for recording or teaching live with your slides and your face on screen at the same time — talking-head style.

The webcam can be rendered as a framed rectangle or as a **background-free cut-out** using in-browser person segmentation (TensorFlow.js + BodyPix).

## What it does

You bring a presentation (a public URL or a local file) and your webcam; the app
overlays your face on top of the slides, lets you record the whole thing to disk,
and runs entirely in your browser — installable as an app.

## Features

- **Presentation sources**:
  - Any presentation reachable over **HTTPS** (Genially, Google Slides, Canva, published reveal.js/slides.to…), embedded full-screen.
  - A **local self-contained `.html`** (one file).
  - A **local HTML folder** (`index.html` + relative assets), e.g. a reveal.js/impress export (Chromium browsers).
  - Multiple sources at once, switchable with `1`–`9`, plus a separate **control panel** window.
  - **Auto-normalisation of Google Slides URLs**: paste an `/edit` URL and it's rewritten to `/preview` so the iframe doesn't go blank.
- **Webcam overlay**: framed card or **background-free cut-out** (TensorFlow.js + BodyPix); any of the 4 corners; S/M/L size; camera picker.
- **Recording**: capture the whole session (slides + face) to a `.webm`, with **auto-record on Go live** (toggleable), microphone + system audio, written to disk as you go, and a space/time estimate before you start.
- **Installable PWA**: add it to your dock; the shell works offline.
- Zero runtime dependencies: every library and font is served locally from `vendor/`.

## How to use

1. Open the app (the live demo above, or install it).
2. **Add your presentation** in *Source slides*:
   - Paste a URL, **or** *Load local HTML (one .html)*, **or** *Load HTML folder (with assets)*.
   - **PPTX?** PowerPoint doesn't render natively in a browser — upload it to **Office Online** or **Google Slides** and paste *that* URL.
3. **Set up your camera** in *Camera stage*: corner, size, and Framed vs Cut-out.
4. Click **Go live**. Your face appears over the slides.
5. In Zoom/Meet/Teams, **share only this tab/window**.

### Recording

- Recording is **on by default** when you go live (turn it off with the *Record automatically* toggle in the setup).
- When it starts, the browser asks **what to capture** → pick **"This tab" / the current tab** so the browser's "you're sharing" bar stays **out of the video**.
- Audio: your **microphone** plus **system/tab audio** when the browser/OS allows it (no mic → it still records video).
- The app's own controls **auto-hide while recording** so they don't appear in the video. Press **`H`** (or the small eye button, top-left) to show/hide them.
- Stop with the **REC** button or `R` (or End the session); the `.webm` **downloads automatically**.
- It's written to disk **as you record** (not buffered in RAM), and you'll see an estimated **max duration** before starting.

### Keyboard shortcuts (while presenting)

| Key | Action |
|-----|--------|
| `←` / `→` | rotate webcam corner |
| `B` | toggle framed ↔ cut-out |
| `F` | enter / exit fullscreen |
| `R` | start / stop recording |
| `H` | hide / show the app controls |
| `\` | open the control panel |
| `1`–`9` | switch active source |
| `Esc` | exit fullscreen, then end the session |

### Install as an app (PWA)

In Chrome/Edge, use the install icon in the address bar. It opens in its own
window and the interface loads offline.

## Things to keep in mind

- **Secure context**: the camera only works under `https://` or `http://localhost`.
- The **"you're sharing/recording" bar is the browser's**, not the app — it can't be hidden from a web page. Capturing **the current tab** keeps it out of the recording.
- **PPTX** has no faithful in-browser renderer → use an online viewer (Office/Google) and embed the URL.
- **Local HTML folders** need a browser with the File System Access API (Chrome/Edge). On others, use a single self-contained `.html`.
- Some remote presentations refuse to be embedded (`X-Frame-Options`); Google Slides is auto-normalised to `/preview`.
- Local HTML presentations and recordings live in the **browser's storage (OPFS)**, per origin — they aren't shared via the URL.
- **Cloud upload** (to Drive/Dropbox) is planned and **not available yet**; for now recordings download to your disk.

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
├── index.html              # Entry point
├── precam.js               # Logic: webcam, BodyPix, recording, state, UI
├── precam.css              # Styles (Editorial Broadcast)
├── sources.js              # Multi-source store (URL / local HTML) + cross-window sync
├── localStore.js           # Local HTML files & folder bundles stored in OPFS
├── recorder.js             # Recording (getDisplayMedia + MediaRecorder) + storage estimate
├── sw.js                   # Service worker: PWA shell + serves local HTML bundles
├── manifest.webmanifest    # PWA manifest
├── icon.svg                # PWA icon
├── panel.html / panel.js   # Multi-source control panel window
├── firebase.json           # Hosting config (prepared; production is GitHub Pages)
├── start.sh                # Local static server
├── *.test.js               # Vitest unit tests (sources, localStore, recorder)
├── vendor/                 # Locally-served libraries and fonts
│   ├── tf.min.js                 # TensorFlow.js 4.22.0
│   ├── body-pix.min.js           # BodyPix 2.2.1
│   └── fonts/                    # Fraunces variable (display)
└── package.json
```

## Tests

```bash
npm test            # Vitest unit tests (sources, local storage, recorder)
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

All video processing happens **in the browser**. The webcam feed never leaves your
machine, and **recordings are written locally** (download / OPFS) — nothing is
uploaded. Local HTML presentations are stored in the browser's OPFS, per origin.
Remote presentations are loaded in an iframe directly from their original host.
(Optional cloud upload is planned and will always be **opt-in**.)

## License

MIT. See [LICENSE](./LICENSE).
