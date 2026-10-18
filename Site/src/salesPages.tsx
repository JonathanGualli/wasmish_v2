import type { ReactElement } from 'react'
import { NICHES } from './routes.ts'
import { VentaPage } from './pages/VentaPage.tsx'

// Lo único que hidrata el navegador: las páginas de venta. Las legales y la 404
// se dibujan solo al compilar (entry-server.tsx), así `marked` y su contenido
// no llegan nunca al JavaScript del navegador.
export function renderSalesPage(path: string): ReactElement {
  const niche = NICHES.find((n) => n.path === path)
  if (!niche) throw new Error(`No hay página de venta para ${path}`)
  return <VentaPage niche={niche} />
}
