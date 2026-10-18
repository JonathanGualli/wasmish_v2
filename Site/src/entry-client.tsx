import { hydrateRoot } from 'react-dom/client'
import './styles.css'
import { findRoute } from './routes.ts'
import { renderSalesPage } from './salesPages.tsx'

// El HTML ya viene escrito (scripts/prerender.mjs): aquí solo se le da vida a
// las páginas que tienen movimiento.
const route = findRoute(location.pathname)
const root = document.getElementById('app')
if (route?.hydrate && root) hydrateRoot(root, renderSalesPage(route.path))
