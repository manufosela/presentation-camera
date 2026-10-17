# Publicar slides en onsli.de/usuario: login de ponente, Firebase Storage y enrutado por 404.html

Status: proposed
Date: 2026-10-17

## Context

CAM-TSK-0134 pide publicar decks en onsli.de/<usuario>/<nombre> sin login para quien los ve. El ADR 0001 de docs/adr fijó ponentes sin login, sin Firebase Storage y sin Firebase Hosting, y dejó el enrutado para esta card. onsli.de está en GitHub Pages, que no enruta rutas arbitrarias. Los decks son HTML de usuario (también los generados desde PDF o imágenes).

## Decision

(1) Login con Google (Firebase Auth) solo para publicar; presentar sigue sin login. El nombre de usuario se reserva en Firestore (usernames/{nombre}) con una transacción. (2) Los decks publicados van a Firebase Storage en europe-west1 bajo decks/{uid}/{nombre}.html, lectura pública y escritura solo del dueño, con tope de tamaño por deck y de decks por usuario. (3) El enrutado se hace con un 404.html en GitHub Pages que lee la ruta y carga el deck desde Storage en un iframe aislado (sandbox sin allow-same-origin), como bundleBlobs. (4) Botón de denunciar y retirada por el dueño de onslide, más condiciones de uso que lo prohíban.

## Consequences

Cambia el ADR 0001 en dos puntos (login de ponente para publicar, Firebase Storage). Coste: almacenamiento y descargas de Storage en europe-west1, fuera de la capa gratuita de us-*; se acota con los topes. El 404.html responde con estado 404 aunque muestre el deck: las vistas previas de enlaces y buscadores lo verán como no encontrado; si importa, la alternativa es mover onsli.de entero a Firebase Hosting con un rewrite. Alojar HTML ajeno en público abre la puerta a phishing: por eso el sandbox, la denuncia y la retirada. Alternativas descartadas: Firestore como almacén (límite de 1 MiB por documento, los decks con imágenes no caben), un tercero tipo Cloudflare R2 (otra cuenta y otra factura) y URLs con fragmento tipo onsli.de/v#usuario/charla (no es la URL pedida).
