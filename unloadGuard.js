/**
 * Aviso al cerrar o recargar mientras se graba (CAM-TSK-0094).
 *
 * Al cerrar no se puede descargar nada: solo pedir confirmación. Si el usuario
 * sale igualmente, la grabación queda en el almacenamiento del navegador y se
 * recupera al volver (CAM-TSK-0095).
 */
export function bindUnloadGuard(target, isRecording) {
  target.addEventListener('beforeunload', event => {
    if (!isRecording()) return;
    event.preventDefault();
    event.returnValue = ''; // navegadores que aún no atienden preventDefault
  });
}
