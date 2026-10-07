/**
 * Galería de fondos del setup (CAM-TSK-0060): «Sin fondo», las imágenes
 * guardadas (miniatura + borrar) y «Subir imagen». Solo pinta y avisa: la app
 * decide qué hacer con onSelect(id | null), onRemove(id) y onUpload().
 * Los textos salen en el idioma actual: la app la repinta al cambiarlo.
 */

import { t } from './i18n.js';
import { BLUR_BACKGROUND_ID } from './constants.js';

function button(doc, className, label) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = className;
  if (label) element.setAttribute('aria-label', label);
  return element;
}

function choice(doc, { label, selected, onClick }) {
  const element = button(doc, 'bg-choice', label);
  element.setAttribute('aria-pressed', String(selected));
  element.addEventListener('click', onClick);
  return element;
}

export function renderBackgroundPicker(container, { backgrounds, selectedId, onSelect, onRemove, onUpload }) {
  const doc = container.ownerDocument;
  const items = [];

  const none = choice(doc, { label: t('bg.noneLabel'), selected: !selectedId, onClick: () => onSelect(null) });
  none.textContent = t('bg.none');
  items.push(none);

  // Desenfocado (CAM-TSK-0100): el propio fondo de la cámara, borroso.
  const blur = choice(doc, { label: t('bg.blurLabel'), selected: selectedId === BLUR_BACKGROUND_ID, onClick: () => onSelect(BLUR_BACKGROUND_ID) });
  blur.textContent = t('bg.blur');
  items.push(blur);

  for (const { id, name, url } of backgrounds) {
    const item = doc.createElement('span');
    item.className = 'bg-item';
    const pick = choice(doc, { label: t('bg.choose', { name }), selected: id === selectedId, onClick: () => onSelect(id) });
    const thumb = doc.createElement('img');
    thumb.src = url;
    thumb.alt = name;
    pick.append(thumb);
    const remove = button(doc, 'bg-remove', t('bg.remove', { name }));
    remove.textContent = '×';
    remove.addEventListener('click', () => onRemove(id));
    item.append(pick, remove);
    items.push(item);
  }

  const upload = button(doc, 'bg-upload');
  upload.textContent = t('bg.upload');
  upload.addEventListener('click', () => onUpload());
  items.push(upload);

  container.replaceChildren(...items);
}
