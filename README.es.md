# Presentation Camera

> 🇬🇧 [Read in English](./README.md)

**Pruébala**: https://manufosela.dev/presentation-camera/

Pon tu **cámara encima de cualquier presentación** y presenta o graba con tus slides y tu cara en pantalla a la vez. Todo funciona **en tu navegador**: no hay servidor, ni cuenta, y no se sube nada.

## Qué puedes hacer

- **Presentar cualquier slide**: una URL pública (Genially, Google Slides, Canva, un reveal.js publicado…; siempre que esa web permita incrustarla), un **fichero `.html` local** o una **carpeta local** exportada de reveal.js/impress (con su `index.html` y sus recursos).
- **Guardar varias presentaciones** y cambiar entre ellas con `1`–`9`.
- **Colocar tu cámara** en cualquier esquina y en tres tamaños, con **marco**, **recortada** sin fondo o **con un fondo virtual** (tus propias imágenes, guardadas para la próxima vez). O elegir **Sin cámara** para grabar solo las slides y tu voz.
- **Grabar toda la sesión** (slides, cámara, micrófono y sonido de la pestaña) en un `.webm` que se descarga al parar. Los controles de la app se ocultan para no salir en el vídeo.
- **Leer tus notas** en una ventana aparte, el panel de control, que nunca sale en la grabación.
- **Tema claro u oscuro** e interfaz en **español o inglés**.
- **Instalarla como app** (PWA); la interfaz funciona sin conexión.

## Cómo empezar

1. Abre la app (la demo de arriba o la app instalada).
2. **Añade tu presentación** en *Presentaciones*: pega una URL, o usa *Cargar HTML local (un .html)* o *Cargar carpeta HTML (con recursos)*. Queda en *Presentaciones guardadas*, así que la próxima vez solo tienes que elegirla.
   - **¿PPTX?** Los navegadores no muestran PowerPoint: súbelo a **Office Online** o **Google Slides** y pega esa URL.
3. **Prepara tu cámara** en *Tu cámara*: esquina, tamaño y tratamiento — *Marco*, *Recorte* (con imagen de fondo opcional) o *Sin cámara*.
4. Pulsa **En directo**. Tu cara aparece sobre las slides.
5. En Zoom/Meet/Teams, **comparte solo esta ventana**.

### Grabación

- La grabación empieza **al pasar a directo** (se desactiva con *Grabar automáticamente al empezar*). También puedes empezarla y pararla con **REC** o `R`.
- El navegador pregunta **qué capturar**: elige **esta pestaña**, para que su barra de «estás compartiendo» no salga en el vídeo.
- Audio: tu **micrófono** más el **sonido de la pestaña** si el navegador lo permite. Sin micrófono graba igualmente el vídeo.
- Los controles de la app **se ocultan al grabar**. Pulsa `H` (o el botón del ojo, arriba a la izquierda) para mostrarlos u ocultarlos.
- Al parar, el `.webm` **se descarga solo**. Se escribe a disco mientras grabas (no se queda en memoria); antes de empezar ves cuánto tiempo puedes grabar.
- Se graba lo que ves: la grabación es una captura de la pestaña.

### Fondo virtual

Con *Recorte*, la sección *Fondo* te deja elegir *Ninguno*, una de tus imágenes o *+ Subir imagen* (PNG, JPEG o WebP, hasta 15 MB). Las imágenes se guardan en tu navegador, así que puedes volver a elegirlas sin subirlas. Usa imágenes con la proporción de tu cámara (normalmente 4:3, p. ej. 1600×1200): con otras proporciones se recortan para llenar el recuadro.

### Notas y panel de control

Abre el **panel de control** con `\` (o *Abrir panel de control*): una ventana aparte para tener en otro monitor. Muestra las notas de la slide actual en los decks reveal.js locales, te deja cambiar y renombrar presentaciones y nunca sale en la grabación.

### Atajos de teclado (durante la presentación)

| Tecla | Acción |
|-------|--------|
| `←` `→` `↑` `↓`, `RePág`/`AvPág`, `Espacio`, `Inicio`/`Fin` | navegar el deck (reveal.js, vía su API postMessage) |
| `B` / `.` | fundido a negro del deck (pausa de reveal.js) |
| `S` | notas del ponente: con un deck local se muestran en el panel de control (sigue la slide actual y no sale en la grabación); con una presentación publicada abre la ventana de notas de reveal.js (si el navegador la bloquea, permítela para ese sitio) |
| `C` / `Shift+C` | rotar la esquina de la webcam |
| `M` | alternar marco ↔ recorte (no hace nada con *Sin cámara*) |
| `F` | entrar / salir de pantalla completa |
| `R` | iniciar / detener grabación |
| `H` | ocultar / mostrar los controles |
| `\` | abrir el panel de control |
| `1`–`9` | cambiar la fuente activa |
| `Esc` | vista general del deck (reveal.js); sale de pantalla completa. Para terminar, botón de salir |

Los atajos de una tecla (`C`, `M`, `R`, `F`, `H`, `S`, `\`, `1`–`9`) se pueden desactivar en el setup, algo útil si usas dictado por voz. La navegación del deck sigue funcionando.

### Tema e idioma

El botón sol/luna cambia entre **tema claro y oscuro** (por defecto sigue al de tu sistema). El botón **ES/EN** cambia el idioma de la interfaz (por defecto, el de tu navegador). Ambos se recuerdan y se aplican también al panel de control.

### Instalar como app (PWA)

En Chrome/Edge, usa el icono de instalar de la barra de direcciones. Se abre en su
propia ventana y la interfaz carga sin conexión.

## Cómo funciona

- Es una **web estática** (HTML, CSS y módulos JavaScript, sin compilación) publicada en GitHub Pages. Un service worker mantiene la interfaz disponible sin conexión.
- **Las presentaciones** se muestran en un `iframe` bajo la cámara. Las remotas se cargan directamente desde su web. Los `.html` y las carpetas locales se guardan en tu navegador y se muestran en un **`iframe` aislado** (sandbox, con origen opaco): el código del deck no puede leer los datos de la app, tus grabaciones ni tus imágenes.
- **La cámara** se dibuja encima de las slides. El *Recorte* te separa del fondo con segmentación de persona (TensorFlow.js + BodyPix) **en tu ordenador**; el modelo lo sirve esta misma web y solo se carga cuando eliges *Recorte*.
- **La grabación** captura la pestaña del navegador (`getDisplayMedia`) y la codifica con `MediaRecorder`, mezclando tu micrófono. Se va escribiendo en el almacenamiento privado del navegador (OPFS) y se descarga al parar.
- **El panel de control** es otra ventana de la misma app; ambas se comunican con un `BroadcastChannel` dentro de tu navegador.

## Privacidad: todo se queda en tu navegador

| Qué | Adónde va |
|-----|-----------|
| Cámara y micrófono | Se procesan en tu ordenador. No se envían a ningún sitio. |
| Grabaciones | Se escriben en el almacenamiento del navegador y se descargan a tu disco. Nunca se suben. |
| Presentaciones locales (`.html` y carpetas) | Se guardan en tu navegador (OPFS). Nunca se suben. |
| Imágenes de fondo | Se guardan en tu navegador (OPFS). Nunca se suben. |
| Preferencias (presentaciones guardadas, tema, idioma, cámara…) | En el `localStorage` de tu navegador. |
| Presentaciones remotas | Tu navegador las carga directamente desde su web, como si las abrieras tú. |

No hay backend, ni cuentas, ni analítica, ni cookies. Las únicas peticiones que hace la app son para cargar sus propios ficheros y las presentaciones que eliges.

## Cosas a tener en cuenta

- **Contexto seguro**: la cámara solo funciona con `https://` o `http://localhost`.
- La **barra de «estás compartiendo» es del navegador** y una web no puede ocultarla; capturar **esta pestaña** la deja fuera de la grabación.
- Un **PPTX** no se puede mostrar en un navegador: usa Office Online o Google Slides y pega esa URL.
- Las **carpetas HTML locales** necesitan un navegador que permita elegir carpetas (Chrome o Edge). En otros, usa un `.html` autocontenido.
- En los decks de carpeta no funcionan los ficheros que el código carga dinámicamente (p. ej. un Markdown externo); la app te avisa de qué recursos no encontró.
- Algunas webs no se dejan incrustar (`X-Frame-Options`). Los enlaces `/edit` de Google Slides se convierten solos en `/preview`.
- Lo que se guarda en tu navegador se queda en **ese** navegador: no se comparte por el enlace ni con otros ordenadores.

## Requisitos

- Un navegador de escritorio reciente. Se recomiendan **Chrome o Edge**: en otros pueden faltar los decks de carpeta o la captura de pestaña para grabar.
- Un contexto seguro: `https://` o `http://localhost`.

## Arranque local

```bash
./start.sh           # servidor estático en http://localhost:8000
./start.sh 8080      # otro puerto
npm run fetch-assets # descarga los pesos de BodyPix (Recorte) y pdf.js (importar PDF), una vez
```

`start.sh` usa `python3 -m http.server` y busca el siguiente puerto libre si no indicas uno. El botón **o prueba una demo** carga una presentación pública para probar la app.

## Desarrollo

El código son módulos ES en la raíz del repositorio, un módulo pequeño por tema, cada uno con su `*.test.js` al lado:

```
.
├── index.html / precam.js / precam.css   # Ventana principal: setup y presentación (precam.js conecta los módulos)
├── panel.html / panel.js / panel.css     # Ventana del panel de control
├── theme.js / i18n.js / messages.js      # Tema, idioma de la interfaz y sus textos (es/en)
├── sources.js / localStore.js            # Presentaciones guardadas y ficheros locales (OPFS)
├── bundleRewrite.js / bundleBlobs.js     # Decks de carpeta servidos aislados
├── webcamLoop.js / segmentationLoader.js # Dibujo de la cámara y carga diferida de BodyPix
├── backgroundStore.js / backgroundPicker.js # Fondos virtuales
├── recorder.js / recordingFlow.js        # Grabación
├── sw.js / manifest.webmanifest          # PWA
├── scripts/fetch-assets.js               # Descarga los pesos de BodyPix y pdf.js (comprobados con sha256)
└── vendor/                               # TensorFlow.js, BodyPix y fuentes, servidos localmente
```

```bash
npm test            # tests unitarios con Vitest
```

Al subir a `main` se publica la web con `.github/workflows/pages.yml`, que además descarga el modelo y genera `version.json` (lo que se ve en el pie).

## Actualizar `vendor/`

```bash
cd vendor
curl -fsSL -o tf.min.js       "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
curl -fsSL -o body-pix.min.js "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js"
```

BodyPix 2.x requiere TensorFlow.js `^4.10.0`. Si subes la versión de uno, verifica compatibilidad con el otro.

El bundle UMD de BodyPix 2.2.x expone la API como `window["body-pix"]`; `segmentationLoader.js` la toma de ahí al cargar los scripts bajo demanda.

## Licencia

MIT. Ver [LICENSE](./LICENSE).
