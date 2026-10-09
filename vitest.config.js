// Suite por defecto (y del CI, que solo tiene Node): sin los tests que necesitan
// el emulador de Firestore, que van con npm run test:rules.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'firestore-tests/**'] },
});
