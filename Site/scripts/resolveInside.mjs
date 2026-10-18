// La ruta del archivo que pide una URL, solo si está dentro de `root`.
// Lo usa el servidor local de scripts/og.mjs (revisión de Codex, PR #96):
// `startsWith(root)` aceptaba carpetas vecinas con el mismo prefijo
// (`dist-private/`), y una URL mal formada (`/%ZZ`) tumbaba el proceso.
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

export function resolveInside(root, url) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(url, 'http://local').pathname)
  } catch {
    return null
  }
  try {
    const base = realpathSync(root)
    const file = realpathSync(join(base, pathname)) // resuelve también los enlaces simbólicos
    const rel = relative(base, file)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
    return statSync(file).isFile() ? file : null
  } catch {
    return null // no existe
  }
}
