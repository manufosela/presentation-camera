/**
 * La pantalla compartida en el área de la presentación (CAM-TSK-0193, ADR 3).
 *
 * El navegador solo abre el selector de getDisplayMedia desde un gesto del
 * usuario en esta ventana, así que al activarse la fuente se pinta un botón y
 * el selector se abre con su clic, venga la fuente del setup, del panel o del
 * mando. Lo elegido se pinta en un vídeo mudo: el audio no se comparte.
 */

const CANCELLED = 'NotAllowedError'; // el usuario cierra el selector sin elegir

export function createDisplayStage({ host, mediaDevices, labels, onEnded, onError }) {
  let sourceId = null;
  let stream = null;

  function release() {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  }

  function renderButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'display-share-btn';
    button.textContent = labels.share;
    button.addEventListener('click', () => share(button));
    host.replaceChildren(button);
    host.hidden = false;
  }

  function renderVideo() {
    const video = document.createElement('video');
    video.className = 'display-video';
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('aria-label', labels.video);
    video.srcObject = stream;
    host.replaceChildren(video);
  }

  async function share(button) {
    button.disabled = true;
    const requestedFor = sourceId;
    try {
      const captured = await mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (requestedFor !== sourceId) { // dejó de ser la activa con el selector abierto
        captured.getTracks().forEach(track => track.stop());
        return;
      }
      stream = captured;
      captured.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stream !== captured) return; // ya se soltó desde onslide
        release();
        renderButton();
        onEnded();
      }, { once: true });
      renderVideo();
    } catch (error) {
      if (error?.name !== CANCELLED) onError(error);
      button.disabled = false;
    }
  }

  function show(source) {
    if (source.id === sourceId) return; // ya está: no cortar lo que se comparte
    hide();
    sourceId = source.id;
    renderButton();
  }

  function hide() {
    sourceId = null;
    release();
    host.replaceChildren();
    host.hidden = true;
  }

  return { show, hide };
}
