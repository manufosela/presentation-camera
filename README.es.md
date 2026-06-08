# Presentation Camera

> 🇬🇧 [Read in English](./README.md)

**Demo en vivo**: https://manufosela.dev/presentation-camera/

Web app estática que superpone tu **webcam** sobre una **presentación embebida**. Pensada para grabar o impartir clases mostrando las diapositivas y tu cara al mismo tiempo, estilo *talking head*.

La webcam puede dibujarse con marco rectangular o **recortada sin fondo** usando segmentación de persona en el navegador (TensorFlow.js + BodyPix).

## Qué hace

Tú pones una presentación (una URL pública o un fichero local) y tu webcam; la app
superpone tu cara sobre las diapositivas, te deja grabar todo a disco y funciona
enteramente en el navegador — instalable como app.

## Características

- **Fuentes de presentación**:
  - Cualquier presentación accesible vía **HTTPS** (Genially, Google Slides, Canva, reveal.js/slides.to publicados…), embebida a pantalla completa.
  - Un **`.html` local autocontenido** (un solo fichero).
  - Una **carpeta HTML local** (`index.html` + assets relativos), p. ej. un export de reveal.js/impress (navegadores Chromium).
  - Varias fuentes a la vez, alternables con `1`–`9`, más una ventana de **panel de control** aparte.
  - **Auto-normalización de URLs de Google Slides**: si pegas una URL `/edit`, se reescribe a `/preview` para que no quede en blanco.
- **Webcam superpuesta**: marco redondeado o **recorte sin fondo** (TensorFlow.js + BodyPix); las 4 esquinas; tamaño S/M/L; selector de cámara.
- **Grabación**: captura toda la sesión (slides + cara) a un `.webm`, con **grabación automática al Go live** (desactivable), micrófono + audio de sistema, escritura a disco mientras grabas, y una estimación de espacio/tiempo antes de empezar.
- **PWA instalable**: añádela a tu escritorio; la interfaz funciona offline.
- Cero dependencias en runtime: librerías y fuentes servidas localmente desde `vendor/`.

## Cómo se usa

1. Abre la app (la demo de arriba, o instálala).
2. **Añade tu presentación** en *Source slides*:
   - Pega una URL, **o** *Cargar HTML local (un .html)*, **o** *Cargar carpeta HTML (con assets)*.
   - **¿PPTX?** PowerPoint no se renderiza nativo en el navegador — súbelo a **Office Online** o **Google Slides** y pega *esa* URL.
3. **Configura la cámara** en *Camera stage*: esquina, tamaño y Frame vs Cut-out.
4. Pulsa **Go live**. Tu cara aparece sobre las diapositivas.
5. En Zoom/Meet/Teams, **comparte solo esta pestaña/ventana**.

### Grabación

- La grabación está **activada por defecto** al ir en directo (se desactiva con el toggle *Grabar automáticamente* del setup).
- Al empezar, el navegador pregunta **qué capturar** → elige **"Esta pestaña" / la pestaña actual** para que la barra de "estás compartiendo" del navegador **no salga** en el vídeo.
- Audio: tu **micrófono** más el **audio de sistema/pestaña** cuando el navegador/SO lo permiten (sin micro → graba solo vídeo).
- Los controles de la app **se ocultan solos al grabar** para no salir en el vídeo. Pulsa **`H`** (o el botón del ojo, arriba-izquierda) para mostrarlos/ocultarlos.
- Detén con el botón **REC** o `R` (o finaliza la sesión); el `.webm` **se descarga automáticamente**.
- Se escribe a disco **mientras grabas** (no se acumula en RAM) y verás una **duración máxima estimada** antes de empezar.

### Atajos de teclado (durante la presentación)

| Tecla | Acción |
|-------|--------|
| `←` / `→` | rotar la esquina de la webcam |
| `B` | alternar marco ↔ recorte |
| `F` | entrar / salir de pantalla completa |
| `R` | iniciar / detener grabación |
| `H` | ocultar / mostrar los controles |
| `\` | abrir el panel de control |
| `1`–`9` | cambiar la fuente activa |
| `Esc` | salir de pantalla completa y luego finalizar |

### Instalar como app (PWA)

En Chrome/Edge, usa el icono de instalar de la barra de direcciones. Se abre en su
propia ventana y la interfaz carga offline.

## Cosas a tener en cuenta

- **Contexto seguro**: la cámara solo funciona bajo `https://` o `http://localhost`.
- La barra de **"estás compartiendo/grabando" es del navegador**, no de la app — no se puede ocultar desde una web. Capturar **la pestaña actual** la mantiene fuera de la grabación.
- **PPTX** no tiene render fiel en el navegador → usa un visor online (Office/Google) y pega la URL.
- Las **carpetas HTML locales** necesitan un navegador con File System Access (Chrome/Edge). En otros, usa un `.html` autocontenido.
- Algunas presentaciones remotas rechazan embeberse (`X-Frame-Options`); Google Slides se normaliza a `/preview`.
- Las presentaciones HTML locales y las grabaciones viven en el **almacenamiento del navegador (OPFS)**, por origen — no se comparten por el enlace.
- La **subida a la nube** (Drive/Dropbox) está planificada y **aún no disponible**; por ahora las grabaciones se descargan a tu disco.

## Requisitos

- Navegador moderno con soporte para `getUserMedia` (Chrome, Firefox, Safari, Edge recientes).
- **Contexto seguro** obligatorio: la cámara solo funciona bajo `https://` o `http://localhost`.

## Arranque local

```bash
./start.sh           # arranca un servidor estático en http://localhost:8000
./start.sh 8080      # puerto custom
```

El script usa `python3 -m http.server` y busca el siguiente puerto libre si no se indica uno.

Una vez arrancado, abre `http://localhost:8000`, pega la URL de tu presentación y pulsa **Go live**.

## Demo

Hay un botón **or try a demo** que carga una presentación pública de Genially para probarlo sin tener una propia.

## Estructura

```
.
├── index.html              # Entry point
├── precam.js               # Lógica: webcam, BodyPix, grabación, estado, UI
├── precam.css              # Estilos (Editorial Broadcast)
├── sources.js              # Store multi-fuente (URL / HTML local) + sync entre ventanas
├── localStore.js           # Ficheros HTML y carpetas locales en OPFS
├── recorder.js             # Grabación (getDisplayMedia + MediaRecorder) + estimación de espacio
├── sw.js                   # Service worker: shell PWA + sirve bundles HTML locales
├── manifest.webmanifest    # Manifiesto PWA
├── icon.svg                # Icono PWA
├── panel.html / panel.js   # Ventana del panel de control multi-fuente
├── firebase.json           # Config de hosting (preparado; producción: GitHub Pages)
├── start.sh                # Servidor estático local
├── *.test.js               # Tests unitarios Vitest (sources, localStore, recorder)
├── vendor/                 # Librerías y fuentes servidas localmente
│   ├── tf.min.js                 # TensorFlow.js 4.22.0
│   ├── body-pix.min.js           # BodyPix 2.2.1
│   └── fonts/                    # Fraunces variable (display)
└── package.json
```

## Tests

```bash
npm test            # Tests unitarios con Vitest (sources, almacenamiento local, recorder)
```

## Actualizar `vendor/`

```bash
cd vendor
curl -fsSL -o tf.min.js       "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
curl -fsSL -o body-pix.min.js "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js"
```

BodyPix 2.x requiere TensorFlow.js `^4.10.0`. Si subes la versión de uno, verifica compatibilidad con el otro.

El bundle UMD de BodyPix 2.2.x expone la API como `window["body-pix"]`. El alias a `window.bodyPix` está en un `<script>` inline justo después de cargar la librería en `index.html` — tenlo en cuenta si actualizas a una versión que cambie el wrapper UMD.

## Privacidad

Todo el procesamiento de vídeo ocurre **en el navegador**. La señal de la cámara
nunca sale de tu equipo, y las **grabaciones se escriben localmente** (descarga /
OPFS) — no se sube nada. Las presentaciones HTML locales se guardan en el OPFS del
navegador, por origen. Las presentaciones remotas se cargan en un iframe
directamente desde su servidor original. (La subida opcional a la nube está
planificada y será siempre **opt-in**.)

## Licencia

MIT. Ver [LICENSE](./LICENSE).
