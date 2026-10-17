# Transporte del mando móvil: Firebase Realtime Database

Status: accepted
Date: 2026-10-17

## Context

CAM-TSK-0025: el ponente quiere pasar slides y controlar la grabación desde el móvil; onslide es estática en GitHub Pages, sin servidor propio con sockets. Evaluación en docs/spikes/CAM-TSK-0025-mobile-remote.md

## Decision

Usar Firebase Realtime Database del proyecto precam-app como canal: sesión efímera remote/{id} con id aleatorio de 128 bits en el fragmento del QR (capability URL), TTL de 12 h, comandos de una lista cerrada validados por reglas y por la app, presencia con onDisconnect y un solo mando por sesión

## Consequences

Hay que activar RTDB y sus reglas en precam-app y una función programada que borre sesiones caducadas. Latencia de 50-150 ms, suficiente para pasar slides. Se descarta WebRTC P2P (menor latencia pero falla en Wi-Fi de eventos sin TURN), Firestore (más lento, presencia a base de latidos) y pub/sub de terceros (otra cuenta y datos en un tercero)
