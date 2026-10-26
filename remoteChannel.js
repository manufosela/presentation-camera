/**
 * Canal del mando móvil sobre Firebase Realtime Database (CAM-TSK-0167, ADR 0001).
 *
 * El escritorio crea remote/{id}, escucha cmd y responde en ack; el móvil
 * escribe cmd y mide cuánto tarda en volver su ack. Cada lado marca su
 * presencia y deja un onDisconnect que la apaga si se corta la conexión. El
 * SDK se carga bajo demanda desde gstatic, con la versión fijada.
 */

import { createRemoteSession, deckCommandForRemote } from './remoteSession.js';
import { withTimeout } from './withTimeout.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';
const FIREBASE_CONFIG = {
  projectId: 'precam-app',
  databaseURL: 'https://precam-app-default-rtdb.europe-west1.firebasedatabase.app',
};

export async function loadRemoteDatabase(importer = url => import(url)) {
  const { initializeApp } = await importer(`${SDK}/firebase-app.js`);
  const rtdb = await importer(`${SDK}/firebase-database.js`);
  return { ...rtdb, db: rtdb.getDatabase(initializeApp(FIREBASE_CONFIG, 'onslide-remote')) };
}

const online = snapshot => snapshot.val() === true;

/** Lado escritorio: abre la sesión y entrega cada comando nuevo como comando de deck. */
export async function hostRemote({ rtdb, sessionId, onCommand, onPhone, now = Date.now }) {
  const { db, ref, set, remove, onValue, onDisconnect } = rtdb;
  const path = `remote/${sessionId}`;
  await set(ref(db, path), createRemoteSession(now()));
  const presence = onDisconnect(ref(db, `${path}/desktop/online`));
  await presence.set(false);
  let lastSeq = 0;
  const stopCommands = onValue(ref(db, `${path}/cmd`), snapshot => {
    const command = snapshot.val();
    const deckCommand = deckCommandForRemote(command);
    if (!deckCommand || command.seq <= lastSeq) return;
    lastSeq = command.seq;
    onCommand(deckCommand);
    set(ref(db, `${path}/ack`), { seq: command.seq });
  });
  const stopPhone = onValue(ref(db, `${path}/phone/online`), snapshot => onPhone(online(snapshot)));
  return {
    async close() {
      stopCommands();
      stopPhone();
      await presence.cancel();
      await remove(ref(db, path));
    },
  };
}

/** Lado móvil: marca su presencia, envía comandos y avisa de cada ack con su ida y vuelta. */
export async function joinRemote({ rtdb, sessionId, onDesktop, onAck, clock = () => performance.now() }) {
  const { db, ref, set, onValue, onDisconnect } = rtdb;
  const path = `remote/${sessionId}`;
  const presence = ref(db, `${path}/phone/online`);
  const presenceOnDisconnect = onDisconnect(presence);
  await presenceOnDisconnect.set(false);
  await set(presence, true);
  const pending = new Map();
  const stopAcks = onValue(ref(db, `${path}/ack`), snapshot => {
    const sent = pending.get(snapshot.val()?.seq);
    if (!sent) return;
    pending.delete(snapshot.val().seq);
    onAck({ name: sent.name, roundTripMs: clock() - sent.at });
  });
  const stopDesktop = onValue(ref(db, `${path}/desktop/online`), snapshot => onDesktop(online(snapshot)));
  // seq parte de la hora: si el móvil recarga, sus comandos siguen siendo nuevos para el escritorio.
  let seq = 0;
  return {
    send(name) {
      seq = Math.max(seq + 1, Date.now());
      pending.set(seq, { name, at: clock() });
      return set(ref(db, `${path}/cmd`), { seq, name, sentAt: Date.now() });
    },
    async close() {
      stopAcks();
      stopDesktop();
      await presenceOnDisconnect.cancel();
      await set(presence, false);
    },
  };
}

/**
 * Carga el SDK y se une con plazo: en el móvil la primera conexión puede no
 * responder nunca (CAM-BUG-0027). Si la unión llega tarde se cierra, para que
 * el escritorio no vea conectado un mando que dice haber fallado.
 */
export async function joinRemoteWithin({ timeoutMs, loadRtdb = loadRemoteDatabase, ...options }) {
  const joining = (async () => joinRemote({ rtdb: await loadRtdb(), ...options }))();
  try {
    return await withTimeout(joining, timeoutMs);
  } catch (error) {
    joining.then(remote => remote.close(), () => {});
    throw error;
  }
}
