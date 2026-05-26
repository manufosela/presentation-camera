# Presentation Camera

Web app estática que superpone tu **webcam** sobre una **presentación embebida**. Pensada para grabar o impartir clases mostrando las diapositivas y tu cara al mismo tiempo, estilo *talking head*.

La webcam puede dibujarse con marco rectangular o **recortada sin fondo** usando segmentación de persona en el navegador (TensorFlow.js + BodyPix).

## Características

- Embebido de cualquier presentación accesible vía HTTPS (Genially, Google Slides, Canva, etc.) en un iframe a pantalla completa.
- Webcam superpuesta con dos estilos:
  - **Frame**: vídeo dentro de un marco redondeado con borde.
  - **Cutout**: solo el cuerpo de la persona, fondo transparente (BodyPix).
- Posición configurable: las 4 esquinas.
- Tamaño configurable: pequeño / mediano / grande.
- Selector de cámara si hay más de una webcam disponible.
- Atajos de teclado durante la presentación:
  - `←` / `→` rotar posición.
  - `B` alternar estilo frame ↔ cutout.
  - `Esc` volver al panel de configuración.
- Configuración persistida en la URL: copia y comparte el enlace para reproducir la misma vista.
- Cero dependencias en runtime: librerías servidas localmente desde `vendor/`.

## Requisitos

- Navegador moderno con soporte para `getUserMedia` (Chrome, Firefox, Safari, Edge recientes).
- **Contexto seguro** obligatorio: la cámara solo funciona bajo `https://` o `http://localhost`.

## Arranque local

```bash
./start.sh           # arranca un servidor estático en http://localhost:8000
./start.sh 8080      # puerto custom
```

El script usa `python3 -m http.server` y busca el siguiente puerto libre si no se indica uno.

Una vez arrancado, abre `http://localhost:8000`, pega la URL de tu presentación y pulsa **Iniciar Presentación**.

## Demo

Hay un botón **Presentación de ejemplo** que carga una presentación pública de Genially para probarlo sin tener una propia.

## Estructura

```
.
├── index.html          # Entry point
├── precam.js           # Lógica: webcam, BodyPix, estado, UI
├── precam.css          # Estilos
├── start.sh            # Servidor estático local
├── vendor/             # Librerías servidas localmente
│   ├── pico.min.css       # Pico CSS 2.1.1
│   ├── tf.min.js          # TensorFlow.js 4.22.0
│   └── body-pix.min.js    # BodyPix 2.2.1
└── package.json
```

## Actualizar las librerías de `vendor/`

```bash
cd vendor
curl -fsSL -o pico.min.css   "https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css"
curl -fsSL -o tf.min.js      "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
curl -fsSL -o body-pix.min.js "https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.umd.js"
```

BodyPix 2.x requiere TensorFlow.js `^4.10.0`. Si subes la versión de uno, verifica compatibilidad con el otro.

## Privacidad

Todo el procesamiento de vídeo ocurre **en el navegador**. La señal de la cámara nunca sale de tu equipo. La presentación se carga en un iframe directamente desde su servidor original.

## Licencia

MIT. Ver [LICENSE](./LICENSE).
