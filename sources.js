/**
 * Multi-source store: lista de presentaciones embebibles + activeIndex,
 * persistida en localStorage. Pub/sub para que cualquier vista (la
 * ventana principal o el panel) escuche cambios.
 *
 * El estado interno (slide actual, zoom...) de cada presentación
 * cross-origin no se puede leer ni guardar — eso vive dentro del iframe.
 * Aquí solo gestionamos la lista de URLs y cuál está activa.
 */

const STORAGE_KEY = 'cam.sources.v1';
const MAX_SOURCES = 12;

function loadFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { list: [], activeIndex: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.list)) return { list: [], activeIndex: 0 };
    const list = parsed.list
      .filter(item => item && typeof item.url === 'string')
      .slice(0, MAX_SOURCES)
      .map(item => ({
        id: typeof item.id === 'string' ? item.id : generateId(),
        url: item.url,
        title: typeof item.title === 'string' ? item.title : null,
      }));
    const activeIndex = clampIndex(parsed.activeIndex, list.length);
    return { list, activeIndex };
  } catch (error) {
    console.warn('[sources] localStorage corrupted, starting empty.', error);
    return { list: [], activeIndex: 0 };
  }
}

function saveToStorage(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[sources] could not persist to localStorage.', error);
  }
}

function clampIndex(index, length) {
  if (length === 0) return 0;
  const n = Number.isInteger(index) ? index : 0;
  return Math.max(0, Math.min(n, length - 1));
}

function generateId() {
  return (crypto?.randomUUID?.() ?? `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

export function createSourcesStore() {
  let state = loadFromStorage();
  const listeners = new Set();

  function emit() {
    const snapshot = { list: [...state.list], activeIndex: state.activeIndex };
    for (const listener of listeners) {
      try { listener(snapshot); } catch (error) { console.warn('[sources] listener threw', error); }
    }
  }

  function commit(next) {
    state = next;
    saveToStorage(state);
    emit();
  }

  return {
    list() {
      return [...state.list];
    },
    getActive() {
      return state.list[state.activeIndex] ?? null;
    },
    getActiveIndex() {
      return state.activeIndex;
    },
    snapshot() {
      return { list: [...state.list], activeIndex: state.activeIndex };
    },
    add(url, title) {
      if (typeof url !== 'string' || !url) return null;
      const existing = state.list.findIndex(s => s.url === url);
      if (existing >= 0) {
        commit({ list: state.list, activeIndex: existing });
        return state.list[existing];
      }
      if (state.list.length >= MAX_SOURCES) return null;
      const item = { id: generateId(), url, title: title ?? null };
      const list = [...state.list, item];
      commit({ list, activeIndex: list.length - 1 });
      return item;
    },
    remove(id) {
      const idx = state.list.findIndex(s => s.id === id);
      if (idx < 0) return false;
      const list = state.list.filter(s => s.id !== id);
      const activeIndex = clampIndex(
        idx < state.activeIndex ? state.activeIndex - 1 : state.activeIndex,
        list.length,
      );
      commit({ list, activeIndex });
      return true;
    },
    setActive(index) {
      const next = clampIndex(index, state.list.length);
      if (next === state.activeIndex) return;
      commit({ list: state.list, activeIndex: next });
    },
    setActiveById(id) {
      const idx = state.list.findIndex(s => s.id === id);
      if (idx >= 0) this.setActive(idx);
    },
    cycleActive(direction = 1) {
      if (state.list.length === 0) return;
      const next = (state.activeIndex + direction + state.list.length) % state.list.length;
      commit({ list: state.list, activeIndex: next });
    },
    updateTitle(id, title) {
      const idx = state.list.findIndex(s => s.id === id);
      if (idx < 0) return;
      const list = state.list.map((s, i) => (i === idx ? { ...s, title } : s));
      commit({ list, activeIndex: state.activeIndex });
    },
    clear() {
      commit({ list: [], activeIndex: 0 });
    },
    /**
     * Reemplaza el estado completo. Útil para sincronización entre ventanas
     * cuando otra instancia ya tiene la lista actualizada.
     */
    hydrate(next) {
      if (!next || !Array.isArray(next.list)) return;
      const list = next.list
        .filter(item => item && typeof item.url === 'string')
        .slice(0, MAX_SOURCES);
      const activeIndex = clampIndex(next.activeIndex, list.length);
      commit({ list, activeIndex });
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(this.snapshot());
      return () => listeners.delete(listener);
    },
  };
}

export const SOURCES_STORAGE_KEY = STORAGE_KEY;

/**
 * Conecta un store a un BroadcastChannel para sincronizar el estado entre
 * ventanas del mismo origin. Maneja el anti-loop: cuando llega un snapshot
 * remoto se hidrata el store sin re-broadcastear el cambio.
 *
 * Tipos de mensaje gestionados:
 *   - 'sources:state'   → snapshot completo {list, activeIndex}
 *   - 'sources:request' → la otra ventana pide el snapshot actual
 *
 * Devuelve una función para desuscribir todo.
 */
export function bindSourcesToChannel(store, channel) {
  let suppressBroadcast = false;
  let firstEmission = true;

  const unsubscribe = store.subscribe(snapshot => {
    if (firstEmission) { firstEmission = false; return; }
    if (suppressBroadcast) return;
    try {
      channel.postMessage({ type: 'sources:state', payload: snapshot });
    } catch (error) {
      console.warn('[sources] broadcast failed', error);
    }
  });

  const onMessage = event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'sources:state' && data.payload) {
      suppressBroadcast = true;
      store.hydrate(data.payload);
      suppressBroadcast = false;
    } else if (data.type === 'sources:request') {
      try {
        channel.postMessage({ type: 'sources:state', payload: store.snapshot() });
      } catch (error) { /* noop */ }
    }
  };
  channel.addEventListener('message', onMessage);

  // Pedimos snapshot a quien ya esté conectado (si está la otra ventana, nos lo manda).
  try {
    channel.postMessage({ type: 'sources:request' });
  } catch (error) { /* noop */ }

  return () => {
    unsubscribe();
    channel.removeEventListener('message', onMessage);
  };
}
