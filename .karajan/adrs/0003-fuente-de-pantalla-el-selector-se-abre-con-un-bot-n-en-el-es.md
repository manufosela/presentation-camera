# Fuente de pantalla: el selector se abre con un botón en el escenario

Status: accepted
Date: 2026-11-13

## Context

CAM-TSK-0193. getDisplayMedia exige un gesto del usuario en la ventana principal. Al pulsar Go live la auto-grabación ya gasta ese gesto en su propio selector, y al cambiar de fuente desde el panel o el mando no hay gesto en la principal: pedir la pantalla en esos momentos falla.

## Decision

Al activar la fuente de pantalla, el área de la presentación muestra un botón «Compartir pantalla»; el selector se abre al pulsarlo. Go live no pide la pantalla por su cuenta y la auto-grabación sigue igual.

## Consequences

Un clic más al usar la fuente de pantalla, pero funciona igual desde el setup, el panel y el mando, y no choca con la grabación.
