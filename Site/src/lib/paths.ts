// La forma única de una ruta: sin barra final, sin `.html` y en minúsculas.
// Cloudflare Pages sirve `imprentas.html` en `/imprentas`, pero el navegador
// puede llegar con `/imprentas/` o `/imprentas.html`: las tres son la misma página.
export function normalizePath(pathname: string): string {
  let path = pathname.toLowerCase()
  path = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path || '/'
}
