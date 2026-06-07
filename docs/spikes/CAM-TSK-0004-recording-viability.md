# SPIKE CAM-TSK-0004 — Viabilidad de grabación compuesta (slides + cara)

> Estado: investigación. Entregables: este documento + PoC (`poc/recording-poc.html`) + ADR propuesto.
> Contexto: la app compone la presentación en **iframes cross-origin** y la webcam en un
> `<canvas>` separado posicionado por CSS encima. No hay un canvas único con todo.

## Pregunta del spike

¿Cómo grabar en un único vídeo la presentación (iframe) + el overlay de la webcam, sabiendo
que el contenido de un iframe cross-origin no es capturable por canvas?

## Hallazgos

### 1. El iframe cross-origin NO es capturable por canvas
Dibujar un iframe cross-origin en un canvas (o leerlo) lanza un fallo de seguridad / "taints" el
canvas. Por tanto **no se puede** componer slides remotos + cara en un canvas y grabar ese canvas.
Esto descarta la vía `canvas.captureStream()` para las sources actuales (URLs remotas).

### 2. Hay DOS caminos de grabación según el tipo de source (hallazgo central)

| Tipo de source | Técnica de grabación | Selector del navegador | Automatizable |
|---|---|---|---|
| **Remota** (iframe cross-origin: Genially, Google Slides, Canva, slides.to hospedado…) | `getDisplayMedia()` + `MediaRecorder` | **Sí, obligatorio** (gesto + picker) | Parcial: 1 gesto al arrancar |
| **Local same-origin** (PDF/imágenes/HTML servidos por blob/Service Worker — épica CAM-PCS-0005) | Compositing en **canvas único** + `canvas.captureStream()` + `MediaRecorder` | **No** | **Total** (sin picker ni barra "compartiendo") |

Consecuencia de planificación: la grabación **totalmente automática y compuesta** solo es posible
para presentaciones **locales** (que renderizamos nosotros same-origin). Para presentaciones
remotas, la única vía web es capturar pantalla/pestaña con `getDisplayMedia`.

### 3. `getDisplayMedia` no se puede iniciar sin interacción
Es una restricción de seguridad del navegador, no del código: siempre requiere un **gesto del
usuario** y el **selector** (pantalla / ventana / pestaña). El máximo "automático" es:
al pulsar **Go live**, lanzar el selector **una sola vez**; concedido, la grabación arranca y
continúa sola. En Chromium, `preferCurrentTab: true` sugiere capturar la pestaña actual (encuadre
más limpio: incluye iframe + overlay sin barras del navegador). Si el usuario detiene la captura
desde la barra "Estás compartiendo…", el evento `ended` del track lo detecta y cerramos la grabación.

### 4. Codecs / contenedor (`MediaRecorder.isTypeSupported`)
Matriz esperada (confírmala en runtime con el PoC, sección 1):

| MIME | Chromium | Firefox | Safari |
|---|---|---|---|
| `video/webm;codecs=vp9,opus` | sí | sí | normalmente no |
| `video/webm;codecs=vp8,opus` | sí | sí | normalmente no |
| `video/mp4;codecs=h264,aac` | sí (reciente) | no | sí |

Estrategia: detectar por orden de preferencia y caer al primero soportado
(`vp9/opus → vp8/opus → webm → mp4`). Por defecto **WebM (VP9/Opus)** por compresión; **MP4/H264**
donde WebM no exista (Safari).

### 5. Audio
- `getDisplayMedia({ audio: true })`: audio de pestaña/sistema (según navegador y elección del picker).
- Micrófono: `getUserMedia({ audio: true })`.
- Mezcla de ambos: **Web Audio API** (`AudioContext` → `createMediaStreamDestination`), añadiendo
  la pista resultante al `MediaStream` que va a `MediaRecorder`. Validado en el PoC (sección 4).

### 6. Espacio en disco / duración máxima (entronca con CAM-TSK-0019)
- `navigator.storage.estimate()` devuelve **cuota del origin** (OPFS/IndexedDB), **no** el espacio
  físico libre del disco.
- Con **File System Access API** (`showSaveFilePicker`) escribiendo a una ubicación real, el
  navegador **no expone** el espacio libre de ese volumen (privacidad).
- Por tanto la "duración máxima" fiable solo se calcula si grabamos a **OPFS** (cuota conocida) y
  luego exportamos; si grabamos a disco real, solo cabe una **estimación por bitrate** con aviso.
- Referencia de tamaño: 1080p a 4–8 Mbps ≈ **1.8–3.6 GB/hora**.

### 7. Persistencia para sesiones largas (entronca con CAM-TSK-0010)
`MediaRecorder.start(timeslice)` emite chunks periódicos. Con File System Access API se vuelcan al
fichero por trozos (sin acumular en RAM). Fallback en navegadores sin la API: acumular Blob y
descargar al detener (limitado para sesiones muy largas). OPFS es alternativa para poder estimar
espacio y recuperar parciales.

## Limitaciones / no resuelto en el spike
- La prueba end-to-end de `getDisplayMedia` requiere gesto humano → se valida con el PoC, no de
  forma automatizada.
- Fidelidad de captura de audio de sistema varía por navegador/SO (Linux/Wayland puede no ofrecerlo).

## Recomendación (→ ADR)
1. **Estrategia dual de grabación**:
   - Sources **remotas** → `getDisplayMedia` + `MediaRecorder` (un gesto, `preferCurrentTab`).
   - Sources **locales** (futura épica CAM-PCS-0005) → canvas único + `canvas.captureStream` (auto).
2. **Formato**: WebM (VP9/Opus) por defecto con detección y fallback; MP4/H264 donde proceda.
3. **Audio**: mezcla mic + sistema con Web Audio API.
4. **Persistencia**: File System Access API por chunks; fallback a descarga; OPFS como opción.
5. **Espacio/duración**: `storage.estimate()` para la ruta OPFS; estimación por bitrate + aviso
   claro para disco real (CAM-TSK-0019).

## Cómo reproducir el PoC
```bash
./start.sh
# abrir http://localhost:8000/poc/recording-poc.html
```
Botones: (1) matriz de codecs, (2) APIs disponibles, (3) espacio + duración, (4) grabación real
(elige la **pestaña actual** en el selector). Anota los resultados de tu navegador para cerrar el spike.
