/**
 * Versión de la aplicación (mostrada en la UI).
 *
 * Fuente única: el campo `version` de `Frontend/package.json`, que
 * `vite.config.ts` inyecta como `__APP_VERSION__` al compilar. NO escribir
 * aquí un literal: para subir de versión, `cd Backend && npm run version:bump`.
 */
export const APP_VERSION = __APP_VERSION__;
