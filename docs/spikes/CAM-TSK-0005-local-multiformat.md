# SPIKE CAM-TSK-0005 — Render multiformato de presentaciones locales en navegador

> Estado: investigación. Entregables: este documento + PoC (`poc/local-formats-poc.html`) + ADR propuesto.
> Objetivo: decidir qué formatos entran en la v1 de carga local y con qué técnica.
> Formato principal del usuario: **HTML (reveal.js / impress.js / slides.to)**. También: PDF, imágenes, PPTX.

## Por qué importa (conexión con grabación, CAM-TSK-0004)
Todo lo que rendericemos **nosotros same-origin** (blob / Service Worker) se puede componer en un
**canvas único** y grabar con `canvas.captureStream()` → **grabación 100% automática y compuesta,
sin selector** (ver ADR de grabación). Por eso la carga local no es solo "abrir ficheros": es la
palanca que habilita la mejor grabación.

## Formatos y técnicas

### 1. PDF — ✅ sólido, sin dependencias
- **Vía simple**: `URL.createObjectURL(file)` → `<iframe src="blob:…">`. Usa el visor PDF nativo del
  navegador (navegable con teclado/UI). Cero dependencias. Validado en el PoC (sección A).
- **Vía con control** (recomendada si queremos grabación auto-compuesta y navegación propia):
  **pdf.js** renderiza cada página a un `<canvas>` same-origin → integrable en el compositing y
  controlable por teclado. Coste: añadir pdf.js a `vendor/` (coherente con el patrón actual de
  servir libs locales).
- **Recomendación**: PDF en v1. Empezar con iframe+blob; migrar a pdf.js cuando se aborde la
  grabación auto-compuesta de locales.

### 2. Imágenes (PNG/JPG/WebP) — ✅ sólido, sin dependencias
- `<input multiple>`, ordenar por nombre (`localeCompare` numérico), mostrar una a una en un `<img>`
  (o pintarlas a canvas). Blob same-origin → componibles y grabables al 100% automático.
- **Recomendación**: imágenes en v1. Trivial y de alto valor.

### 3. Export HTML (reveal.js / impress.js / slides.to) — ⚠️ viable, dos sub-casos
- **C1 · HTML autocontenido** (un solo `.html` con CSS/JS/imágenes inline o data-URI):
  `<iframe src="blob:…">` funciona directo. Validado en el PoC (sección C1). Algunos exports de
  reveal/slides.to pueden generarse así.
- **C2 · Bundle con assets relativos** (carpeta/zip: `index.html` + `css/ js/ img/`): un `blob:` para
  el index **no** resuelve las rutas relativas. Solución robusta **same-origin**:
  1. El usuario elige carpeta (`showDirectoryPicker`, Chromium) o sube un `.zip`.
  2. Copiamos/descomprimimos los ficheros a **OPFS**.
  3. Un **Service Worker** intercepta `/_local/<id>/*` y sirve cada asset desde OPFS con su MIME.
  4. La presentación se carga en el iframe como `/_local/<id>/index.html` → same-origin, assets OK,
     y **componible/grabable**.
  - Para `.zip` hace falta un descompresor. Para no romper "cero dependencias en runtime de captura",
    se puede usar la API nativa **`DecompressionStream`** (gzip/deflate) para casos simples, o añadir
    una lib de unzip pequeña (p.ej. fflate) a `vendor/` solo para esta función.
- **Recomendación**: HTML en v1 priorizando C1 (rápido). C2 (carpeta/zip + SW + OPFS) como segundo
  paso dentro de la misma épica; es la pieza que más valor da (formato principal + grabación auto).

### 4. PPTX — ❌ no nativo fiel; recomendación: fuera de v1
- No hay render nativo en navegador. Opciones cliente (p.ej. **pptxjs**) dependen de jQuery y dan
  **fidelidad parcial** (fallos en animaciones, fuentes, SmartArt, posicionados).
- Fidelidad real → conversión con LibreOffice headless (servidor, coste e infra — choca con la
  restricción de costes del proyecto).
- **Recomendación preliminar**: **no soportar PPTX nativo en v1**; flujo recomendado al usuario:
  *exportar el PPTX a PDF o HTML* y cargarlo por las vías 1/3. Decisión final del stakeholder.

## Modelo de datos (conexión con CAM-TSK-0012)
El store actual (`sources.js`) guarda solo `{ id, url, title }`. Para locales se necesita un
`type` y que el recurso **no** se persista como URL pública:
```
{ id, type: 'url' | 'pdf' | 'images' | 'html', title, url? , localRef? }
```
- `url` → comportamiento actual (iframe remoto).
- locales → `localRef` apunta al recurso en OPFS (o a un handle); **no** viajan por BroadcastChannel
  ni se comparten por link. Persistencia entre recargas: vía OPFS (sobrevive) o re-selección
  (handles no siempre persisten). A definir en CAM-TSK-0012; **sin fallback silencioso**.

## Recomendación (→ ADR)
- **v1**: PDF (iframe→pdf.js), imágenes, HTML (C1 ya; C2 con SW+OPFS como objetivo de la épica).
- **PPTX**: fuera de v1; recomendar export a PDF/HTML.
- **Arquitectura clave**: Service Worker + OPFS para servir bundles locales **same-origin**,
  habilitando navegación propia y **grabación auto-compuesta** (cierra el círculo con CAM-TSK-0004).

## Reproducir el PoC
```bash
./start.sh
# abrir http://localhost:8000/poc/local-formats-poc.html
```
Secciones: A) PDF, B) imágenes, C) HTML (C1 blob / C2 directorio), D) nota PPTX.
