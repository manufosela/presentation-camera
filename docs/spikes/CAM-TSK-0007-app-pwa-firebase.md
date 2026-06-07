# SPIKE CAM-TSK-0007 — Alcance de "app": PWA + piezas Firebase e impacto en el repo estático

> Estado: investigación de diseño (sin PoC ejecutable: requiere proyecto Firebase real).
> Entregables: este documento + ADR propuesto.
> Decisiones del usuario: uso **libre, sin login** de usuarios; la única autorización es el **token
> de un solo uso del anfitrión** para subir a la nube (ver CAM-TSK-0006).

## Pregunta
¿Qué significa convertir esta web estática en "app" y qué piezas de Firebase hacen falta de verdad,
sin meter un build pesado ni auth de usuarios innecesaria?

## Estado de partida
Repo estático: HTML/CSS/JS sin build, `vendor/` con libs locales, servidor `start.sh`
(`python3 -m http.server`). Cero dependencias en runtime. Demo en `manufosela.dev/presentation-camera/`.

## Piezas evaluadas

### 1. PWA (manifest + service worker) — ✅ recomendado
- `manifest.webmanifest` (nombre, iconos, `display: standalone`, `start_url`) → instalable.
- Service Worker para cachear el **shell** (HTML/CSS/JS + `vendor/`) → arranque rápido y offline del
  shell. Estrategia *cache-first* para estáticos versionados, *network-first* para `index.html`.
- **Aviso crítico**: el SW **no** debe interceptar/romper `getUserMedia`/`getDisplayMedia` (necesitan
  contexto seguro, ya cubierto por https) ni los iframes cross-origin de presentaciones remotas.
  Cachear solo lo same-origin propio.
- **Sinergia**: el SW es además la pieza que sirve los **bundles HTML locales same-origin** desde OPFS
  (`/_local/<id>/*`, ver CAM-TSK-0005). Un mismo SW cubre shell-offline + carga local. **Dos pájaros.**

### 2. Firebase Hosting — ✅ recomendado
- Sirve la PWA por https (requisito de getUserMedia/getDisplayMedia y de OAuth).
- Permite convivir Hosting + Functions bajo el mismo dominio (rewrites a la Function del token-broker).
- Sustituye al hosting actual de la demo; `firebase.json` con headers correctos (p.ej. cache larga
  para `vendor/`, no-cache para SW e `index.html`).

### 3. Firebase Functions — ✅ recomendado (solo para nube)
- Únicamente el **token-broker** del spike CAM-TSK-0006 (OAuth del anfitrión + nonces de un solo uso).
- No procesa vídeo. Coste mínimo.

### 4. Firebase Auth — ⚠️ NO para usuarios finales
- El uso es **libre, sin login** → **no** se añade login de usuarios.
- Único caso a evaluar: que el **anfitrión** se identifique una vez para hacer el OAuth y custodiar su
  refresh token. Eso puede resolverse con:
  - (a) un flujo OAuth directo del anfitrión sin Firebase Auth (más simple), o
  - (b) Firebase Auth **solo** para el panel del anfitrión (no para presentadores).
- **Recomendación**: no introducir Firebase Auth en v1; el anfitrión usa un flujo OAuth puntual. Si en
  el futuro hay "panel de anfitrión" multiusuario, reconsiderar (b).

### 5. Firestore — ⚠️ mínimo, solo si hace falta para los nonces
- El token-broker necesita persistir nonces de un solo uso `{ used, expiresAt, providerHint }` y el
  refresh token del anfitrión. Firestore con reglas cerradas (acceso solo desde la Function/Admin SDK)
  encaja. Alternativa: Secret Manager para el refresh token + Firestore para nonces.

## Impacto en el repo estático
- **Bajo**. Se mantiene sin framework ni bundler pesado. Añadidos:
  - `manifest.webmanifest`, `sw.js`, iconos.
  - `firebase.json` + `functions/` (Node) para el token-broker.
  - Posibles libs en `vendor/` (pdf.js, fflate) por la épica de carga local, no por la de app.
- No se requiere migrar a Astro/bundler. Mantener "cero dependencias en runtime de captura".

## Orden recomendado de la épica
1. PWA (manifest + SW del shell) — independiente, valor inmediato (CAM-TSK-0017).
2. Firebase Hosting (deploy) — CAM-TSK-0018.
3. Functions (token-broker) — cuando se aborde la nube (CAM-PCS-0006).
El SW se diseña pensando ya en servir OPFS (`/_local/*`) para no rehacerlo al llegar la carga local.

## Recomendación (→ ADR)
- **Sí**: PWA (manifest + SW), Firebase Hosting, Functions (solo token-broker).
- **No** en v1: Firebase Auth para usuarios; Firebase Storage (descartado por coste).
- **Firestore**: solo para nonces/credenciales del token-broker, reglas cerradas.
- SW único que cubre shell-offline **y** servir bundles locales same-origin (sinergia con CAM-TSK-0005).
- Mantener el repo estático sin build pesado.
