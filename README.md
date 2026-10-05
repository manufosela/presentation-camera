# Presentation Camera

> 🇪🇸 [Léeme en español](./README.es.md)

**Live demo**: https://manufosela.dev/presentation-camera/

Put your **webcam on top of any presentation** and present or record with your slides and your face on screen at the same time. Everything runs **in your browser**: there is no server, no account and nothing is uploaded.

## What you can do

- **Present any slides**: a public URL (Genially, Google Slides, Canva, a published reveal.js…, as long as that site allows embedding), a **local `.html`** file or a **local folder** exported from reveal.js/impress (with its `index.html` and assets).
- **Keep several presentations** saved and switch between them with `1`–`9`.
- **Place your camera** in any corner, in three sizes, as a **framed** card, as a **cut-out** without background, or **with a virtual background** (your own images, saved for next time). Or choose **No camera** to record only the slides and your voice.
- **Record the whole session** (slides, camera, microphone and tab sound) to a `.webm` that downloads when you stop. The app controls hide themselves so they don't appear in the video.
- **Read your speaker notes** in a separate control panel window that never appears in the recording.
- **Light or dark theme** and **English or Spanish** interface.
- **Install it as an app** (PWA); the interface works offline.

## Getting started

1. Open the app (the live demo above, or the installed app).
2. **Add your presentation** in *Source slides*: paste a URL, or use *Load local HTML (one .html)* or *Load HTML folder (with assets)*. It is saved under *Saved presentations*, so next time you just pick it.
   - **PPTX?** Browsers can't render PowerPoint: upload it to **Office Online** or **Google Slides** and paste that URL.
3. **Set up your camera** in *Camera stage*: corner, size and treatment — *Framed*, *Cut-out* (with an optional background image) or *No camera*.
4. Press **Go live**. Your face appears over the slides.
5. In Zoom/Meet/Teams, **share only this window**.

### Recording

- Recording starts **when you go live** (turn it off with *Record automatically when going live*). You can also start and stop it with **REC** or `R`.
- The browser asks **what to capture**: pick **this tab**, so its "you are sharing" bar stays out of the video.
- Audio: your **microphone** plus the **tab sound** when the browser allows it. Without a microphone it still records the video.
- The app controls **hide while recording**. Press `H` (or the small eye button, top left) to show or hide them.
- When you stop, the `.webm` **downloads automatically**. It is written to disk as you record (not kept in memory); before starting you see an estimate of how long you can record.
- What you see is what is recorded: the recording is a capture of the tab.

### Virtual background

With *Cut-out*, the *Background* section lets you choose *None*, one of your images or *+ Upload image* (PNG, JPEG or WebP, up to 15 MB). Images are saved in your browser, so you can pick them again without uploading. Use images with your camera's proportions (usually 4:3, e.g. 1600×1200): other proportions are cropped to fill the frame.

### Speaker notes and control panel

Open the **control panel** with `\` (or *Open control panel*): a separate window to keep on another screen. It shows the speaker notes of the current slide for local reveal.js decks, lets you switch and rename presentations, and never appears in the recording.

### Keyboard shortcuts (while presenting)

| Key | Action |
|-----|--------|
| `←` `→` `↑` `↓`, `PgUp`/`PgDn`, `Space`, `Home`/`End` | navigate the deck (reveal.js, via its postMessage API) |
| `B` / `.` | black out the deck (reveal.js pause) |
| `S` | speaker notes: for a local deck they are shown in the control panel (they follow the current slide and stay out of the recording); for a published deck it opens the reveal.js notes window (if the browser blocks the popup, allow it for that site) |
| `C` / `Shift+C` | rotate webcam corner |
| `M` | toggle framed ↔ cut-out (does nothing with *No camera*) |
| `F` | enter / exit fullscreen |
| `R` | start / stop recording |
| `H` | hide / show the app controls |
| `\` | open the control panel |
| `1`–`9` | switch active source |
| `Esc` | deck overview (reveal.js); exits fullscreen. To end the session use the exit button |

The single-key shortcuts (`C`, `M`, `R`, `F`, `H`, `S`, `\`, `1`–`9`) can be turned off in the setup — useful if you use voice dictation. Deck navigation keeps working.

### Theme and language

The sun/moon button switches between **light and dark** (by default it follows your system). The **EN/ES** button switches the interface language (by default, your browser's). Both are remembered and apply to the control panel too.

### Install as an app (PWA)

In Chrome/Edge, use the install icon in the address bar. It opens in its own
window and the interface loads offline.

## How it works

- It is a **static web app** (HTML, CSS and JavaScript modules, no build step) published on GitHub Pages. A service worker keeps the interface available offline.
- **Presentations** are shown in an `iframe` under the camera. Remote ones load directly from their own site. Local `.html` files and folders are stored in your browser and shown in an **isolated `iframe`** (sandboxed, with an opaque origin): the deck's code cannot read the app's data, your recordings or your images.
- **The camera** is drawn on top of the slides. The *Cut-out* separates you from your background with person segmentation (TensorFlow.js + BodyPix) **running on your computer**; the model is served by this same site and loaded only when you choose *Cut-out*.
- **The recording** captures the browser tab (`getDisplayMedia`) and encodes it with `MediaRecorder`, mixing your microphone in. It is written to the browser's private storage (OPFS) as it goes and downloaded when you stop.
- **The control panel** is another window of the same app; both talk through a `BroadcastChannel` inside your browser.

## Privacy: everything stays in your browser

| What | Where it goes |
|------|---------------|
| Camera and microphone | Processed on your computer. Never sent anywhere. |
| Recordings | Written to your browser's storage and downloaded to your disk. Never uploaded. |
| Local presentations (`.html` and folders) | Stored in your browser (OPFS). Never uploaded. |
| Background images | Stored in your browser (OPFS). Never uploaded. |
| Preferences (saved presentations, theme, language, camera…) | Your browser's `localStorage`. |
| Remote presentations | Loaded by your browser directly from their site, as if you opened them. |

There is no backend, no account, no analytics and no cookies. The only requests the app makes are to load its own files and the presentations you choose.

## Things to keep in mind

- **Secure context**: the camera only works under `https://` or `http://localhost`.
- The **"you are sharing" bar belongs to the browser** and cannot be hidden by a page; capturing **this tab** keeps it out of the recording.
- **PPTX** cannot be rendered in a browser: use Office Online or Google Slides and embed that URL.
- **Local HTML folders** need a browser that can pick folders (Chrome or Edge). Elsewhere, use a single self-contained `.html`.
- In folder decks, files loaded dynamically by code (e.g. external Markdown) are not supported; the app tells you which resources it could not find.
- Some sites refuse to be embedded (`X-Frame-Options`). Google Slides `/edit` links are turned into `/preview` automatically.
- What is stored in your browser stays in **that** browser: it is not shared through the link or with other computers.

## Requirements

- A recent desktop browser. **Chrome or Edge** are recommended: other browsers may lack folder decks or tab capture for recording.
- A secure context: `https://` or `http://localhost`.

## Run locally

```bash
./start.sh           # static server on http://localhost:8000
./start.sh 8080      # custom port
npm run fetch-model  # downloads the BodyPix weights used by Cut-out (once)
```

`start.sh` uses `python3 -m http.server` and picks the next free port if none is given. The **or try a demo** button loads a public presentation to test the app.

## Development

The code is plain ES modules in the repository root, one small module per concern, each with its `*.test.js` next to it:

```
.
├── index.html / precam.js / precam.css   # Main window: setup and presentation (precam.js wires the modules)
├── panel.html / panel.js / panel.css     # Control panel window
├── theme.js / i18n.js / messages.js      # Theme, interface language and its texts (es/en)
├── sources.js / localStore.js            # Saved presentations and local files (OPFS)
├── bundleRewrite.js / bundleBlobs.js     # Folder decks served isolated
├── webcamLoop.js / segmentationLoader.js # Camera drawing and lazy BodyPix
├── backgroundStore.js / backgroundPicker.js # Virtual backgrounds
├── recorder.js / recordingFlow.js        # Recording
├── sw.js / manifest.webmanifest          # PWA
├── scripts/fetch-model.mjs               # Downloads the BodyPix weights (checked with sha256)
└── vendor/                               # TensorFlow.js, BodyPix and fonts, served locally
```

```bash
npm test            # Vitest unit tests
```

Pushing to `main` publishes the site with `.github/workflows/pages.yml`, which also downloads the model and writes `version.json` (shown in the footer).

## Refresh `vendor/`

```bash
cd vendor
curl -fsSL -o tf.min.js       "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
curl -fsSL -o body-pix.min.js "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js"
```

BodyPix 2.x requires TensorFlow.js `^4.10.0`. If you bump one, double-check compatibility with the other.

BodyPix 2.2.x's UMD bundle exposes its API as `window["body-pix"]`; `segmentationLoader.js` picks it up from there when it loads the scripts on demand.

## License

MIT. See [LICENSE](./LICENSE).
