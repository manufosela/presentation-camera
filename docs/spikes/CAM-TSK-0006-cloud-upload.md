# SPIKE CAM-TSK-0006 — Arquitectura de subida a Drive/Dropbox sin Firebase Storage

> Estado: investigación de diseño (sin PoC ejecutable: requiere credenciales OAuth reales de
> Drive/Dropbox e infra Firebase). Entregables: este documento + ADR propuesto.
> Restricciones del usuario: Drive **o** Dropbox (uno por sesión), **sin login**, autorización por
> **token de un solo uso aportado por el anfitrión**, **sin Firebase Storage** (coste), no pasar los
> GB de vídeo por la Function.

## Problema
Subir una grabación (potencialmente varios GB) al almacenamiento del usuario, sin que el presentador
tenga cuenta/login, y sin que el vídeo atraviese una Cloud Function (coste de ejecución + egress +
límites de tamaño/tiempo).

## Decisión de fondo: la Function NO toca el vídeo
Pasar GB por una Cloud Function es caro y choca con límites (memoria, timeout, payload). Por tanto:
- **La Function solo gestiona credenciales** (token-broker).
- **El vídeo va directo navegador → proveedor** mediante *resumable/chunked upload* (Drive y Dropbox
  lo soportan nativamente).

## Roles
- **Anfitrión** (organiza el evento, configura una vez): hace el OAuth con Drive o Dropbox. Su
  refresh token queda custodiado en backend. Genera **tokens de un solo uso** para repartir.
- **Presentador** (sin login): recibe un token de un solo uso; al grabar, la app lo canjea y sube.

## Flujo propuesto (token de un solo uso)
```
[Anfitrión] --OAuth una vez--> [Function] guarda refresh_token (Secret Manager / Firestore cifrado)
[Anfitrión] --"generar token"--> [Function] crea NONCE de un solo uso (TTL corto) -> se lo da al presentador
[Presentador] introduce NONCE en la app (elige Drive o Dropbox para ESTA sesión)
   (al terminar de grabar)
[App] --canjea NONCE--> [Function] valida (no usado, no expirado) -> marca consumido
                         -> devuelve access_token EFÍMERO del proveedor (scope mínimo, carpeta destino)
[App] --resumable upload del .webm DIRECTO--> [Google Drive / Dropbox]
```
- El **NONCE** es de un solo uso: la Function lo marca consumido al canjear (Firestore con
  transacción para evitar doble uso).
- El **access token efímero** es de corta vida y scope mínimo (idealmente restringido a una carpeta).
- El client secret del proveedor vive **solo** en backend (Secret Manager), nunca en cliente ni git.

## Comparativa de proveedores
| Aspecto | Google Drive | Dropbox |
|---|---|---|
| OAuth | Google OAuth 2.0 (offline → refresh token) | Dropbox OAuth 2 (refresh tokens con `token_access_type=offline`) |
| Subida grande | Resumable upload (`uploadType=resumable`, PUT por chunks) | `upload_session/{start,append_v2,finish}` |
| Scope mínimo | `drive.file` (solo ficheros creados por la app) | `files.content.write` (+ App Folder app si se quiere aislar) |
| CORS subida directa desde navegador | Soportado | Soportado (content.dropboxapi.com) |
| Aislar a una carpeta | carpeta destino + `drive.file` | **App Folder** (la app solo ve su carpeta) → más limpio |

Ambos permiten subida directa desde el navegador (CORS) y refresh tokens. Dropbox con *App Folder*
da un aislamiento más simple; Drive con `drive.file` también limita bien el alcance.

## Custodia de credenciales
- `refresh_token` del anfitrión: backend only (Secret Manager o Firestore con cifrado + reglas
  cerradas). Nunca al cliente.
- Tokens de un solo uso (nonces): Firestore, documento por nonce `{ providerHint, used, expiresAt }`,
  consumo transaccional.
- Access tokens efímeros: nunca persistidos; viven en memoria del cliente lo justo para la subida.

## Riesgos / limitaciones
- Si el access token efímero caduca a mitad de una subida larga, hay que **reanudar** el resumable
  upload y, posiblemente, pedir un token nuevo (la Function puede reemitir contra el refresh token
  del anfitrión mientras el nonce de sesión siga válido como "sesión de subida").
- Verificación del dominio/app OAuth (pantalla de consentimiento de Google) requiere configuración.
- "Un solo uso" estricto vs reintentos: definir que el NONCE habilita **una sesión de subida**
  (permite reintentos de la MISMA subida) en lugar de "una única request", para no romper ante fallos
  de red. Decisión recomendada: nonce = una sesión de subida con TTL.

## Recomendación (→ ADR)
1. Function = **token-broker** (OAuth del anfitrión + emisión/canje de nonces de un solo uso). El
   vídeo **nunca** pasa por la Function.
2. Subida **directa** navegador → proveedor con **resumable/chunked upload**.
3. Soportar **un proveedor por sesión** (Drive o Dropbox), elegido por el presentador al introducir
   el nonce.
4. Scopes mínimos (`drive.file` / App Folder). Secretos en backend (Secret Manager).
5. NONCE = "sesión de subida" de un solo uso con TTL (permite reintentos de la misma grabación).
6. Sin Firebase Storage en ningún punto.

## Dependencias de implementación
- `CAM-TSK-0015` (Function token-broker) y `CAM-TSK-0016` (conectar + subir) implementan esto.
- Requiere la épica de app/Firebase (`CAM-PCS-0007`) para Hosting + Functions (spike CAM-TSK-0007).
