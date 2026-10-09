# ADR 0001 — Instancia de empresa: grabaciones al Drive de cada empresa

- Estado: aceptado
- Fecha: 2026-10-09
- Card: CAM-TSK-0102 (épica CAM-PCS-0013)
- Sustituye en parte a los ADRs de junio de 2026 «Subida a nube: token-broker con nonce» y
  «Alcance app: sin Firebase Auth». Lo que cambia se marca en cada apartado.

## Contexto

onslide es una app estática (GitHub Pages) que funciona entera en el navegador. Las empresas
quieren que las charlas de sus eventos se graben y lleguen solas a **su** Google Drive, sin que
cada ponente tenga cuenta ni toque nada. El vídeo pesa GB, no puede pasar por servidores de
onslide (coste y privacidad) y la empresa tiene que ver y controlar qué entra en su Drive.

Restricciones: la app sigue en GitHub Pages; Firebase solo para Functions y Firestore; al principio
las empresas las da de alta el dueño de onslide (el autoservicio con pago es CAM-PCS-0014); solo
Google Drive, con OneDrive «próximamente» (CAM-TSK-0105).

## Decisión

### 1. Piezas

| Pieza | Uso |
|---|---|
| GitHub Pages | Sigue sirviendo la app y el panel de empresa (páginas estáticas) |
| Proyecto Firebase `onslide` (id `precam-app`), plan Blaze | Todo el backend, región **europe-west1** |
| Cloud Functions (2.ª gen.) | OAuth con Google, códigos, sesiones de subida |
| Firestore (europe-west1) | Empresas, eventos, códigos, registro de subidas |
| Firebase Auth (Google) | **Solo** administradores de empresa y el dueño de onslide |
| Secret Manager | Secreto del cliente OAuth y clave de cifrado de credenciales |

Sin Firebase Storage ni Firebase Hosting. El enrutado de `onsli.de/<usuario>` para publicar slides
se decide en CAM-TSK-0134. *(Cambia «sin Firebase Auth»: los ponentes siguen sin login, pero los
administradores lo necesitan para su panel.)*

### 2. Roles

- **Dueño de onslide**: claim `superadmin`. Da de alta empresas y sus administradores.
- **Administrador de empresa**: entra con Google; claim `orgId`. Conecta el Drive, crea eventos y
  códigos, ve las subidas de su empresa.
- **Ponente**: sin login. Usa un código de evento.

### 3. Conectar el Drive de la empresa

1. El administrador pulsa «Conectar Google Drive» en el panel.
2. La Function `driveConnectStart` comprueba su claim y genera un `state` aleatorio de un solo uso
   (guardado en Firestore, ligado a `orgId` y al administrador, caduca en 10 minutos).
3. Google pide consentimiento con `drive.file`, `access_type=offline` y `prompt=consent`.
4. `driveConnectCallback` (la URI de redirección registrada en el cliente `onslide-web`) valida el
   `state`, canjea el código con el secreto de Secret Manager y crea en ese Drive la carpeta
   «onslide».
5. El `refresh_token` se cifra con AES-256-GCM (clave `ORG_TOKEN_KEY` en Secret Manager) y se
   guarda en `orgs/{orgId}/private/drive`. Las reglas de Firestore niegan todo acceso de cliente a
   `private`: solo lo leen las Functions con el Admin SDK.
6. «Desconectar» revoca el token en Google y borra el documento.

`drive.file` solo da acceso a lo que crea onslide, nunca al resto del Drive.

### 4. Códigos de evento (solo subida)

- Uno o varios por evento, 128 bits aleatorios mostrados en base32 por grupos (`ABCD-EFGH-…`).
- Se guarda solo su **SHA-256**; el código en claro se enseña una vez al crearlo.
- Tienen caducidad (fin del evento más un margen), se pueden revocar y llevan un tope de subidas.
- Solo sirven para **crear sesiones de subida** en la carpeta de su evento: no permiten leer,
  listar ni borrar nada.
- El ponente abre `onsli.de/?org=<slug>&event=<id>` y escribe el código, o lo recibe en el
  fragmento (`#code=…`), que no llega a los registros de ningún servidor.

*(Cambia el «nonce de un solo uso» de junio: un código de evento cubre a todos sus ponentes.)*

### 5. Sesiones de subida

1. Al empezar a grabar, la app llama a `createUploadSession` con el código, el nombre del ponente
   y el título.
2. La Function valida el código en una transacción (vigente, no revocado, bajo su tope y bajo el
   límite de la empresa), obtiene un access token con el `refresh_token`, crea si faltan las
   carpetas `evento/AAAA-MM-DD ponente` e inicia una subida *resumable* de Drive enviando
   `Origin: https://onsli.de`.
3. Devuelve **solo la URI de la sesión**. Esa URI sirve para subir ese fichero y nada más.
4. El navegador sube por trozos mientras graba (CAM-TSK-0107): bloques múltiplos de 256 KiB con
   `Content-Range: bytes a-b/*`, y el tamaño total en el último.
5. Cada subida queda en `orgs/{orgId}/uploads/{id}` con estado, bytes y fechas, sin IP.

**El access token nunca sale del servidor.** *(Cambia junio, que daba al navegador un access token:
con `drive.file` ese token vería todas las grabaciones que onslide ha creado en ese Drive.)*

**Verificado el 2026-10-10 (CAM-TSK-0104):** con la sesión abierta en el servidor con
`Origin: https://onsli.de`, una página de onsli.de sube trozos con `PUT` y lee la respuesta (308 con
la cabecera `Range`). No hace falta el relay que se dejó como alternativa (reenviar cada trozo desde
una Function); se mantiene solo como plan B si Google cambiara ese comportamiento.

### 6. Aviso visible

En modo empresa, la app muestra antes y durante la grabación «Esta grabación se guardará en el
Google Drive de *Empresa* · *Evento*». El nombre sale de Firestore a partir del código, nunca de
la URL, y el ponente lo confirma al introducir el código.

### 7. Protección de datos (RGPD)

- **La empresa** es responsable de las grabaciones y de los datos de sus ponentes.
- **onslide** (manufosela) es encargado del tratamiento de lo que guarda: credenciales cifradas,
  metadatos de eventos y subidas, y cuentas de administradores. Requiere el contrato de encargo de
  CAM-TSK-0131.
- **Google** es subencargado de onslide para Firebase, con datos en la UE, y proveedor directo de la
  empresa para su Drive.
- Datos mínimos: el nombre del ponente y el título solo van en el nombre de carpeta y de fichero y
  en el registro de subidas. El registro se borra a los 90 días; al dar de baja una empresa se
  revoca el acceso y se borra todo en 30 días.
- El vídeo no se guarda nunca en servidores de onslide; con el relay, solo pasa en tránsito.

### 8. Costes y topes

- Las Functions y Firestore solo mueven credenciales y metadatos, así que el uso es bajo; los GB van
  al almacenamiento de la empresa, no al de onslide.
- **Tope estricto, el que protege el coste de onslide**: sesiones por código, por evento y por empresa
  al día. Se reserva en la misma transacción que valida el código.
- **Tope de GB, el que protege el Drive de la empresa**: con subida directa onslide no ve los bytes
  y no puede cortar una subida a medias. Por eso no es estricto:
  - al crear la sesión, si el tamaño se conoce (subir una grabación ya terminada), la sesión se abre
    con `X-Upload-Content-Length` y la Function rechaza lo que exceda el cupo restante;
  - en la subida mientras se graba el tamaño no se conoce: al cerrarse cada sesión, la app avisa a
    `completeUploadSession` y la Function lee el tamaño real del fichero en Drive. Lo suma al
    contador y, si se pasa del tope, no abre más sesiones. Hay una conciliación diaria que lee de
    Drive las sesiones que nunca avisaron.
  - con el relay sí es estricto: la Function cuenta cada trozo y corta al llegar al tope.
- La cuenta de facturación tiene una alerta de presupuesto (CAM-TSK-0110).

### 9. Proveedores

Cada proveedor implementa la misma interfaz (`connect`, `disconnect`, `createUploadSession`), de
modo que OneDrive (CAM-TSK-0105) se añade sin tocar el resto.

## Consecuencias

- La empresa controla qué entra en su Drive y puede desconectarlo cuando quiera; onslide nunca ve
  el resto de sus ficheros ni guarda vídeo.
- Un código filtrado solo permite subir a un evento, con tope y caducidad, y se puede revocar.
- Hay que custodiar dos secretos (cliente OAuth y clave de cifrado) y mantener reglas de Firestore
  cerradas.
- La app de producción en Google necesita pasar de «prueba» a «publicada» con verificación de
  marca antes de abrirla a empresas.
- Si la verificación de CORS falla, el relay añade coste de CPU y un punto de paso del vídeo.

## Alternativas descartadas

- **Backend propio con login para todos** (Cloud Run + base de datos): más coste y operación para un
  servicio que solo mueve credenciales, y obligaría a los ponentes a registrarse.
- **Access token al navegador** (ADR de junio): expone todas las grabaciones de onslide en ese Drive.
- **Subir el vídeo a Firebase Storage y copiarlo después**: duplica coste y hace que el vídeo pase
  por onslide.
