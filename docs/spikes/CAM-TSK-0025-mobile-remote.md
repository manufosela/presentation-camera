# SPIKE CAM-TSK-0025 — Mando desde el móvil: canal y comandos

> Estado: evaluación y recomendación. La PoC con latencia medida en un móvil real va en su propia
> card, después de que el usuario elija el transporte (ADR propuesto al final).

## Problema
El ponente quiere pasar slides y controlar la grabación desde el móvil, escaneando un QR que muestra
onslide en el escritorio. Son dos dispositivos distintos, a menudo en la Wi-Fi de un evento, y
onslide es una web estática en GitHub Pages: no hay servidor propio con sockets.

## Transportes evaluados

| Opción | Latencia típica | Presencia (¿sigue el mando?) | Coste / infra | Riesgos |
|---|---|---|---|---|
| **Firebase Realtime Database** | 50–150 ms | `onDisconnect` nativo | Ya en el proyecto `precam-app` (Blaze); se paga por GB transferido, comandos de pocos bytes | Activar RTDB y sus reglas |
| Firestore (`onSnapshot`) | 200–500 ms | Hay que simularla con latidos | Ya activo; se paga por escritura/lectura | Más lento; latidos = más escrituras |
| WebRTC DataChannel P2P (señalización por Firestore/RTDB) | 10–50 ms en LAN | Estado de la conexión | Sin coste por mensaje; TURN propio si falla P2P | Wi-Fi de eventos con aislamiento de clientes o NAT simétrico: sin TURN no conecta |
| Pub/sub de terceros (Ably, Pusher, PeerJS cloud) | 50–150 ms | Sí | Otra cuenta, otra factura, datos en un tercero | Dependencia externa y RGPD |

**Si el código no existiera** la respuesta canónica sería WebRTC P2P: el móvil y el escritorio
hablan directo, sin servidor por mensaje. Pierde aquí porque la Wi-Fi de un evento rompe P2P con
frecuencia y obliga a montar TURN, justo el servidor que se quiere evitar.

**Recomendación: Realtime Database.** Latencia de sobra para pasar slides, presencia resuelta con
`onDisconnect` y nada nuevo que contratar: el proyecto Firebase ya existe. Firestore funcionaría,
pero es más lento y la presencia saldría a base de escrituras periódicas.

## Modelo de sesión
- El escritorio crea `remote/{sessionId}` con un id aleatorio de 128 bits (16 bytes de
  `crypto.getRandomValues` en base64url).
- El QR lleva `https://onsli.de/remote.html#{sessionId}`: el id va en el fragmento, que no viaja
  en peticiones HTTP ni queda en logs del servidor (capability URL).
- TTL de 12 h: `expiresAt` en el nodo; las reglas rechazan escrituras pasado ese momento y una
  función programada borra las sesiones caducadas.
- Las reglas solo aceptan comandos de una lista cerrada, con un tamaño máximo; el escritorio los
  valida otra vez antes de ejecutarlos (nunca se ejecuta texto recibido).
- Un solo mando por sesión: el primer móvil reclama la sesión; un segundo ve «ya hay un mando».
- Cerrar la presentación borra el nodo.

## Matriz de comandos (según el código actual)

| Fuente | Siguiente / anterior | Ir a slide, vista general, pausa | Cómo |
|---|---|---|---|
| reveal.js remota (iframe cross-origin) | Sí | Sí | API postMessage de reveal (`deckKeys.js`) |
| HTML local o carpeta con reveal.js | Sí | Sí | Misma API postMessage |
| PDF o imágenes | Sí | Sí | `pdfDeckNavigator` entiende los mismos comandos |
| HTML local sin reveal.js | No hoy | No hoy | Posible ampliando `deckBridge.js` para que despache la tecla dentro del deck |
| Genially, Google Slides, Canva | No | No | Cross-origin sin API de control |
| Controles de onslide (grabar, pausa, cámara, láser, subtítulos) | Sí | — | Son acciones de la propia app |

## Fuera de alcance de este spike
- Medir la latencia en un móvil real y la PoC del canal: card nueva, tras el ADR.
- La interfaz del mando en el móvil.

## Resultado en vivo (CAM-TSK-0167 y CAM-TSK-0169)
El ADR 0001 eligió Realtime Database y la PoC quedó en producción: instancia
`precam-app-default-rtdb` (europe-west1) con `database.rules.json` desplegado; una lectura o
escritura anónima fuera de `remote/{id}` devuelve 401.

Ida y vuelta de cada comando (el móvil escribe `cmd`, el escritorio responde `ack`):

| Prueba | Comandos | Mediana | p95 |
|---|---|---|---|
| Dos pestañas en el mismo escritorio | 8 | 55 ms | 192 ms |
| Móvil real pasando slides de un deck reveal.js | 11 | 123 ms | 165 ms |

Con el móvil real las slides avanzan sin retraso apreciable: la latencia cae dentro de lo previsto
para RTDB (50–150 ms).

Pendiente de revisar: la primera conexión del móvil se quedó una vez en «Conectando…» (al
repetir conectó a la primera) y la página del mando se ve en apaisado.
