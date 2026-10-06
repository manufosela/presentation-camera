/**
 * Utilidades de URL de presentaciones, compartidas por la ventana principal
 * (precam.js) y el panel de control (panel.js).
 */

/**
 * Valida y normaliza una URL de presentación: solo http(s), resuelta contra
 * `base` y convertida a su variante embebible. Devuelve null si no es válida.
 */
export function sanitizePresentationUrl(rawUrl, base) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return normalizeEmbeddableUrl(parsed).toString();
  } catch {
    return null;
  }
}

// Algunos servicios tienen URLs distintas para "editar" vs "embeber".
// Cuando detectamos una URL de editor, la sustituimos por la versión apta
// para iframe — así el usuario puede pegar la URL que tenga abierta.
export function normalizeEmbeddableUrl(url) {
  // Google Slides: /edit, /edit?usp=sharing → /preview
  // La URL /present rechaza ser embebida (X-Frame-Options SAMEORIGIN),
  // por eso al pulsar "Presentar" desde /edit la app queda en blanco.
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/presentation/d/')) {
    const slidesId = url.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
    if (slidesId) {
      const next = new URL(url);
      next.pathname = `/presentation/d/${slidesId}/preview`;
      next.search = ''; // limpiamos params de edit (usp, ouid…)
      next.hash = '';
      return next;
    }
  }
  // Canva: /view, /edit, /watch (con o sin token y utm_*) → /view?embed.
  // /view responde X-Frame-Options: deny; solo la variante ?embed se deja embeber.
  if (url.hostname === 'www.canva.com' || url.hostname === 'canva.com') {
    const design = url.pathname.match(/^\/design\/([\w-]+)(?:\/([\w-]+))?\/(?:view|edit|watch)\/?$/);
    if (design) {
      const [, designId, shareToken] = design;
      const next = new URL(url);
      next.pathname = ['/design', designId, shareToken, 'view'].filter(Boolean).join('/');
      next.search = '?embed';
      next.hash = '';
      return next;
    }
  }
  return url;
}

/** Título legible a partir de la URL (servicio conocido o hostname), o null. */
export function deriveSourceTitle(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'docs.google.com') return 'Google Slides';
    if (parsed.hostname.endsWith('genially.com') || parsed.hostname.endsWith('genial.ly')) return 'Genially';
    if (parsed.hostname.includes('canva.com')) return 'Canva';
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Hostname sin www. para etiquetas; si no es una URL, el texto tal cual. */
export function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
