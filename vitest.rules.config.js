// Tests de reglas de Firestore: necesitan el emulador (npm run test:rules).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['firestore-tests/**/*.spec.js'], fileParallelism: false },
});
