// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRecordingFilename,
  extFromMime,
  pickSupportedMimeType,
  startScreenRecording,
} from './recorder.js';

describe('helpers puros', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pickSupportedMimeType devuelve el primero soportado', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: t => t === 'video/webm;codecs=vp8,opus' });
    expect(pickSupportedMimeType()).toBe('video/webm;codecs=vp8,opus');
  });

  it('pickSupportedMimeType devuelve "" si nada es soportado', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    expect(pickSupportedMimeType()).toBe('');
  });

  it('extFromMime distingue mp4 de webm', () => {
    expect(extFromMime('video/mp4')).toBe('mp4');
    expect(extFromMime('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extFromMime(undefined)).toBe('webm');
  });

  it('buildRecordingFilename formatea con fecha fija', () => {
    const d = new Date(2026, 5, 7, 9, 3, 5); // 2026-06-07 09:03:05 local
    expect(buildRecordingFilename(d, 'webm')).toBe('presentation-2026-06-07_09-03-05.webm');
  });
});

// ── Mocks de las APIs de captura/grabación ───────────────────
function track(kind) {
  return { kind, stop: vi.fn(), addEventListener: vi.fn() };
}
class FakeStream {
  constructor(tracks = []) { this._tracks = tracks; }
  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio'); }
}
class FakeRecorder {
  constructor(stream, opts) { this.stream = stream; this.mimeType = opts?.mimeType || ''; this.state = 'inactive'; this._l = {}; }
  addEventListener(type, cb) { (this._l[type] ||= []).push(cb); }
  _emit(type, ev) { (this._l[type] || []).forEach(cb => cb(ev)); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this._emit('dataavailable', { data: { size: 10 } });
    this._emit('stop', {});
  }
  static isTypeSupported(t) { return t === 'video/webm;codecs=vp9,opus'; }
}

let displayTracks;
beforeEach(() => {
  displayTracks = [track('video'), track('audio')];
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getDisplayMedia: vi.fn(async () => new FakeStream(displayTracks)),
      getUserMedia: vi.fn(async () => new FakeStream([track('audio')])),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('startScreenRecording', () => {
  it('inicia la captura y entrega un Blob al detener', async () => {
    let blob = null;
    const ctrl = await startScreenRecording({ withMic: false, withSystemAudio: false, onStop: b => { blob = b; } });
    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledOnce();
    expect(ctrl.state).toBe('recording');
    ctrl.stop();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('pide micrófono cuando withMic=true', async () => {
    const ctrl = await startScreenRecording({ withMic: true, withSystemAudio: false });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    ctrl.stop();
  });

  it('si el micrófono es denegado, graba igualmente sin romper', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => { throw new Error('denegado'); });
    let blob = null;
    const ctrl = await startScreenRecording({ withMic: true, withSystemAudio: false, onStop: b => { blob = b; } });
    ctrl.stop();
    expect(blob).toBeInstanceOf(Blob);
  });

  it('lanza si getDisplayMedia no está disponible', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} });
    await expect(startScreenRecording()).rejects.toThrow();
  });
});
