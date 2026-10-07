/**
 * Rellena un <select> de dispositivos (cámara o micrófono) con «Automático» y
 * los de ese tipo; sin permiso aún no tienen nombre y se numeran. Marca el
 * guardado si sigue existiendo. Devuelve cuántos dispositivos hay.
 */
export function renderDeviceSelect(select, devices, { kind, selectedId, autoLabel, numberedLabel }) {
  const doc = select.ownerDocument;
  const ofKind = devices.filter(device => device.kind === kind);
  const option = (value, label) => Object.assign(doc.createElement('option'), { value, textContent: label });
  select.replaceChildren(
    option('', autoLabel),
    ...ofKind.map((device, index) => option(device.deviceId, device.label || numberedLabel(index + 1))),
  );
  select.value = ofKind.some(device => device.deviceId === selectedId) ? selectedId : '';
  return ofKind.length;
}
