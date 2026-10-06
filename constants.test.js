import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, SYNC_CHANNEL } from './constants.js';

describe('constants — contrato entre ventanas y con el almacenamiento', () => {
  it('canal compartido por la ventana principal y el panel', () => {
    expect(SYNC_CHANNEL).toBe('cam.sync');
  });

  // Estas claves ya están en el localStorage de los usuarios: cambiarlas
  // borraría en silencio sus presentaciones y preferencias.
  it('las claves de almacenamiento no cambian', () => {
    expect(STORAGE_KEYS).toEqual({
      sources: 'cam.sources.v1',
      onboarded: 'cam.onboarded.v1',
      autoRecord: 'cam.autoRecord.v1',
      mirror: 'cam.mirror.v1',
      camera: 'cam.camera.v1',
      singleKeyShortcuts: 'cam.singleKeyShortcuts.v1',
      background: 'cam.background.v1',
      theme: 'cam.theme.v1',
      lang: 'cam.lang.v1',
    });
  });

  it('no se pueden modificar en tiempo de ejecución', () => {
    expect(Object.isFrozen(STORAGE_KEYS)).toBe(true);
  });
});
