// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Estructura del setup en una sola pantalla (CAM-TSK-0081): barra fina, vista
// previa a la izquierda y panel de configuración a la derecha.
const html = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const setup = doc.getElementById('setup');

describe('setup en una pantalla', () => {
  it('barra superior: logo, frase y, a la derecha, ayuda, idioma, tema y GitHub', () => {
    const topbar = setup.querySelector('.topbar');
    expect(topbar.querySelector('.wordmark-text').textContent.trim()).toBe('onslide');
    expect(topbar.querySelector('[data-i18n="topbar.tagline"]')).not.toBeNull();
    const nav = topbar.querySelector('nav');
    expect([...nav.children].map(el => el.id || el.getAttribute('href'))).toEqual([
      'helpBtn', 'langBtn', 'themeBtn', 'https://github.com/manufosela/presentation-camera',
    ]);
  });

  it('dos columnas: vista previa y panel lateral con el botón de empezar', () => {
    const grid = setup.querySelector('.setup-grid');
    const [stage, panel] = grid.children;
    expect(stage.matches('section.setup-stage')).toBe(true);
    expect(panel.matches('aside.setup-panel')).toBe(true);
    expect(stage.querySelector('.stage-mock')).not.toBeNull();
    expect(panel.querySelector('#startButton')).not.toBeNull();
    expect(panel.getAttribute('data-i18n-attr')).toBe('aria-label:setup.panelLabel');
  });

  it('las cuatro esquinas se eligen en la propia vista previa (CAM-TSK-0082)', () => {
    const stage = setup.querySelector('.setup-stage .stage-mock');
    const corners = [...stage.querySelectorAll('input[type="radio"][name="position"]')];
    expect(corners.map(input => input.value)).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    for (const input of corners) {
      expect(input.closest('label').querySelector('[data-i18n]').textContent.trim()).not.toBe('');
    }
    expect(stage.querySelector('fieldset legend[data-i18n="camera.cornerGroup"]')).not.toBeNull();
    expect(setup.querySelectorAll('input[name="position"]')).toHaveLength(4);
    expect(setup.querySelector('.corner-pad')).toBeNull();
    expect(setup.querySelector('.setup-stage [data-i18n="setup.cornerHint"]')).not.toBeNull();
  });

  it('«Tu presentación»: enlace con Usar, un único botón de subir con su menú y Recientes (CAM-TSK-0083)', () => {
    const panel = setup.querySelector('.setup-panel');
    const form = panel.querySelector('form#linkForm');
    expect(form.querySelector('input#url[type="url"]').labels[0].getAttribute('data-i18n')).toBe('sources.linkLabel');
    expect(form.querySelector('button[type="submit"]').getAttribute('data-i18n')).toBe('sources.use');
    const upload = panel.querySelector('#uploadBtn');
    const menu = panel.querySelector(`#${upload.getAttribute('popovertarget')}`);
    expect(menu.hasAttribute('popover')).toBe(true);
    expect([...menu.querySelectorAll('button')].map(b => b.id)).toEqual(['pickFileBtn', 'pickFolderBtn']);
    expect(panel.querySelector('input#fileInput[type="file"]').getAttribute('accept')).toContain('.pdf');
    for (const old of ['loadLocalHtmlBtn', 'loadLocalBundleBtn', 'loadPdfBtn', 'localHtmlInput', 'pdfInput']) {
      expect(doc.getElementById(old)).toBeNull();
    }
    expect(panel.querySelector('[data-i18n="sources.recent"]')).not.toBeNull();
  });

  it('«Tu cámara»: cómo apareces, fondo y tamaño con nombres claros (CAM-TSK-0084)', () => {
    const section = setup.querySelector('section[aria-labelledby="panel-camera"]');
    const styles = [...section.querySelectorAll('input[name="webcam-style"]')];
    expect(styles.map(input => input.closest('label').querySelector('[data-i18n]').getAttribute('data-i18n')))
      .toEqual(['camera.framed', 'camera.cutout', 'camera.none']);
    const sizes = [...section.querySelectorAll('input[name="webcam-size"]')];
    expect(sizes.map(input => input.closest('label').querySelector('[data-i18n]').getAttribute('data-i18n')))
      .toEqual(['camera.sizeS', 'camera.sizeM', 'camera.sizeL']);
    expect(sizes[0].closest('fieldset').classList.contains('size-control')).toBe(true);
    expect(section.querySelector('fieldset.background-control #backgroundPicker')).not.toBeNull();
  });

  it('«Más opciones» plegable y pie del panel con el botón de empezar (CAM-TSK-0090)', () => {
    const panel = setup.querySelector('.setup-panel');
    const more = panel.querySelector('details.more-options');
    expect(more.hasAttribute('open')).toBe(false);
    expect(more.querySelector('summary [data-i18n="more.title"]')).not.toBeNull();
    for (const id of ['cameraSelect', 'mirrorInput', 'singleKeyShortcutsInput', 'openPanelBtn']) {
      expect(more.querySelector(`#${id}`)).not.toBeNull();
    }
    const footer = panel.querySelector('.setup-footer');
    expect(footer.querySelector('#autoRecordInput')).not.toBeNull();
    expect(footer.querySelector('#startButton [data-i18n="footer.goLive"]')).not.toBeNull();
    expect(footer.querySelector('[data-i18n="footer.share"]')).not.toBeNull();
    expect(footer.querySelector('#mirrorInput, #singleKeyShortcutsInput')).toBeNull();
  });

  it('subtítulos en «Más opciones»: activar, hablo en, traducir a, descargar y estado (CAM-TSK-0133)', () => {
    const captions = setup.querySelector('details.more-options fieldset.captions-setup');
    expect(captions.querySelector('legend [data-i18n="captions.title"]')).not.toBeNull();
    for (const id of ['captionsEnabled', 'captionsSpoken', 'captionsTranslate']) {
      expect(captions.querySelector(`label[for="${id}"], label:has(#${id})`)).not.toBeNull(); // cada control con su etiqueta
    }
    expect([...captions.querySelectorAll('#captionsSpoken option')].map(o => o.value)).toEqual(['es', 'en']);
    expect([...captions.querySelectorAll('#captionsTranslate option')].map(o => o.value)).toEqual(['', 'es', 'en']);
    expect(captions.querySelector('#captionsPrepareBtn').hasAttribute('hidden')).toBe(true);
    expect(captions.querySelector('#captionsStatus').getAttribute('aria-live')).toBe('polite');
  });

  it('primera visita: estado vacío en la vista previa y tres pasos en el panel (CAM-TSK-0085)', () => {
    const empty = setup.querySelector('.setup-stage .stage-mock .stage-empty');
    expect(empty.querySelector('h1[data-i18n="empty.title"]')).not.toBeNull();
    expect(empty.querySelector('form#emptyLinkForm input[type="url"]').labels[0]).toBeTruthy();
    expect(empty.querySelector('#chooseFileBtn')).not.toBeNull();
    expect(empty.querySelector('#exampleButton')).not.toBeNull();
    expect(empty.querySelector('[data-i18n="empty.ppt"]')).not.toBeNull();
    expect(setup.querySelectorAll('.setup-panel ol.first-steps > li')).toHaveLength(3);
    expect(setup.querySelector('.setup-footer #startHint[data-i18n="footer.pickFirst"]')).not.toBeNull();
  });

  it('ayuda: un diálogo con todos los atajos, la versión y el espacio de grabación (CAM-TSK-0086)', () => {
    const help = doc.querySelector('dialog#helpDialog');
    expect(help.getAttribute('aria-labelledby')).toBe('helpTitle');
    const keys = [...help.querySelectorAll('.help-keys kbd')].map(kbd => kbd.textContent.trim());
    for (const key of ['←', '→', 'S', 'C', 'M', 'F', 'R', 'H', '\\', '1', '9', 'Esc', '?']) expect(keys).toContain(key);
    expect(help.querySelector('#appVersion')).not.toBeNull();
    expect(help.querySelector('#recordEstimate')).not.toBeNull();
    expect(doc.getElementById('onboarding')).toBeNull();
    expect(setup.querySelector('.stage-hint [data-i18n="setup.keyAll"]')).not.toBeNull();
  });

  it('pie de página con autor y copyright, dentro de la rejilla (CAM-TSK-0092)', () => {
    const footer = setup.querySelector('.setup-grid > footer.site-footer');
    expect(footer.textContent).toContain('©');
    const author = footer.querySelector('a[href="https://github.com/manufosela"]');
    expect(author.textContent.trim()).toBe('manufosela');
    expect(footer.querySelector('[data-i18n="footer.license"]')).not.toBeNull();
  });

  it.each(['.hero', '.status-pill', '.legend', '.footnote'])('sin ruido: no hay %s', selector => {
    expect(setup.querySelector(selector)).toBeNull();
  });
});
